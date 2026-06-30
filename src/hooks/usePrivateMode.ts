// usePrivateMode — the React state-machine wrapper around Umbra's encrypted
// balance flows, designed for granma-friendly UI consumption.
//
// Owns:
//   - signer/client lifecycle (lazy — built only after first interaction)
//   - private balance polling (SOL only for MVP)
//   - incoming-payments scan state
//   - setup, deposit, withdraw, and (Phase 2) private-send actions
//
// Hides:
//   - SDK function names
//   - registration step counting
//   - the throwaway signer's existence
//
// First-time setup is "magic one-tap": the caller passes a `fundSigner`
// function (a SOL send from the main wallet to the signer's address). The
// hook orchestrates fund + register + ready in a single sequence.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Buffer } from 'buffer';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import { createCloseAccountInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import * as SecureStore from 'expo-secure-store';
import type { IUmbraClient, IUmbraSigner } from '@umbra-privacy/sdk';

import { SOL_MINT, SOLANA_RPC_URL } from '../constants';
import { SUPPORTED_TOKENS } from '../tokens/registry';

// SecureStore key for the cached private balance. v1 was SOL-only (single
// bigint string); v2 is a JSON record keyed by mint to support multi-mint
// private balance display + send. We still read v1 as a fallback so existing
// installs don't open to a blank sheet on first launch after upgrade.
const CACHED_BALANCE_KEY_V1 = 'umbra_cached_balance_lamports_v1';
const CACHED_BALANCES_KEY_V2 = 'umbra_cached_balances_by_mint_v2';

// Mints we track in private mode. Pulled from the central token registry so
// adding a new token in one place lights up its private-balance row + private
// send path everywhere. Detected non-registry tokens are NOT auto-included
// here — they're public-only in Phase 1 of #38.
const PRIVATE_MINTS: readonly string[] = SUPPORTED_TOKENS.map((t) => t.mint);

// Hard cap so a hung umbra RPC or stuck SDK call never spins forever.
// 60s is generous for the slow first-time client build + multi-tree scan.
const OP_TIMEOUT_MS = 60_000;

function withOpTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${OP_TIMEOUT_MS / 1000}s. Network may be slow — please retry.`)), OP_TIMEOUT_MS),
    ),
  ]);
}
import { ensurePrivateModeReady, type FundSignerFn, type SetupStage } from '../umbra/auto-setup';
import { fetchPrivateBalanceForMint } from '../umbra/private-balance';
import { withdrawToPublicBalance } from '../umbra/withdraw';
import { scanClaimableUtxosAcrossTrees } from '../umbra/utxo';
import { claimReceiverClaimableUtxosToEncryptedBalance } from '../umbra/claim';
import { getStoredSignerAndClient } from '../umbra/registration';

export type PrivateModeStatus =
  | 'idle'
  | 'loading'
  | 'unregistered'
  | 'ready'
  | 'setting-up'
  | 'busy';

export interface IncomingSummary {
  count: number;
  totalLamports: bigint;
}

export interface UsePrivateModeReturn {
  status: PrivateModeStatus;
  setupStage: SetupStage | null;
  /** SOL private balance in lamports — kept for backward compat with the
   *  header pill + zero-balance gate. New code should read
   *  `privateBalancesByMint[mint]` directly. */
  privateBalanceLamports: bigint;
  /** SOL private balance as a UI number (lamports / 1e9). Same caveat as
   *  `privateBalanceLamports` — SOL-only accessor over the multi-mint map. */
  privateBalanceSol: number;
  /** All tracked mints → raw private balance (smallest units of that mint).
   *  Always contains entries for every PRIVATE_MINTS mint, defaulting to 0n. */
  privateBalancesByMint: Record<string, bigint>;
  incoming: IncomingSummary;
  errorMessage: string | null;

  refresh: () => Promise<void>;
  refreshDeep: () => Promise<void>;
  setIncomingPollEnabled: (enabled: boolean) => void;
  setUp: (fundSigner: FundSignerFn) => Promise<void>;
  // Full "move encrypted balance back to user's main wallet" pipeline.
  // SOL-only in Phase A/B of #38 — the SPL branch is gated on the Umbra v5
  // SDK migration (the wSOL-close-unwrap trick doesn't apply to non-native
  // mints; SPL withdraw lands in signer's ATA and needs a follow-up transfer
  // to the main wallet's ATA). Optional `mint` param reserved for that work.
  moveAllToPublic: (mainWalletPubkey: string, mint?: string) => Promise<string>;
  refreshIncoming: () => Promise<void>;
  claimIncoming: () => Promise<void>;
  privateSend: (args: {
    destination: string;
    /** Raw amount in the mint's smallest units. Prefer this over `lamports`
     *  for new callers — `lamports` stays for backward compat with the SOL
     *  send path that pre-dates multi-mint. */
    amount?: bigint;
    /** Legacy SOL amount in lamports. Equivalent to `{amount: BigInt(lamports), mint: SOL_MINT}`. */
    lamports?: number;
    /** Mint to send privately. Defaults to SOL. */
    mint?: string;
    onDegradationRequested?: (info: { reason: string; recipient: string }) => Promise<boolean>;
    fundSigner: FundSignerFn;
  }) => Promise<{ mode: 'umbra-encrypted' | 'fallback-public'; signature: string }>;
}

const INCOMING_POLL_MS = 30_000;

// Initial multi-mint balance map. Every tracked mint starts at 0n so consumers
// never have to optional-chain into the record.
const emptyBalances = (): Record<string, bigint> =>
  Object.fromEntries(PRIVATE_MINTS.map((m) => [m, 0n]));

export function usePrivateMode(): UsePrivateModeReturn {
  const [status, setStatus] = useState<PrivateModeStatus>('idle');
  const [setupStage, setSetupStage] = useState<SetupStage | null>(null);
  const [privateBalancesByMint, setPrivateBalancesByMint] = useState<Record<string, bigint>>(emptyBalances);
  const [incoming, setIncoming] = useState<IncomingSummary>({ count: 0, totalLamports: 0n });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const privateBalanceLamports = privateBalancesByMint[SOL_MINT] ?? 0n;

  const clientRef = useRef<IUmbraClient | null>(null);
  const signerRef = useRef<IUmbraSigner | null>(null);
  const scannedUtxosRef = useRef<readonly any[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Lightweight probe: SecureStore reads for signer existence + cached balance.
  // Both are tiny disk reads, no RPC, no client build, no SDK init.
  // The cached balance lets the sheet show last-known state instantly when
  // it opens — the heavy fetch only runs when the user explicitly taps a
  // button.
  const refresh = useCallback(async () => {
    try {
      const [stored, cachedV2, cachedV1Sol] = await Promise.all([
        SecureStore.getItemAsync('umbra_throwaway_signer_v1'),
        SecureStore.getItemAsync(CACHED_BALANCES_KEY_V2),
        SecureStore.getItemAsync(CACHED_BALANCE_KEY_V1),
      ]);
      if (!mountedRef.current) return;
      // Prefer v2 multi-mint cache. Fall back to v1 SOL-only cache so an
      // existing tester upgrading from 0.4.2 → 0.4.3 sees their SOL balance
      // immediately on first open instead of a blank sheet.
      if (cachedV2) {
        try {
          const parsed = JSON.parse(cachedV2) as Record<string, string>;
          const next = emptyBalances();
          for (const [mint, raw] of Object.entries(parsed)) {
            try { next[mint] = BigInt(raw); } catch {}
          }
          setPrivateBalancesByMint(next);
        } catch {
          // fall through to v1
        }
      } else if (cachedV1Sol) {
        try {
          setPrivateBalancesByMint((prev) => ({ ...prev, [SOL_MINT]: BigInt(cachedV1Sol) }));
        } catch {}
      }
      setStatus(stored ? 'unregistered' : 'idle');
    } catch {
      if (!mountedRef.current) return;
      setStatus('idle');
    }
  }, []);

  // Persist the full multi-mint balance map to SecureStore so the next sheet
  // open shows real numbers instantly without rebuilding the client. JSON
  // serialisation of bigint requires string conversion — handled here.
  const cacheBalances = useCallback(async (balances: Record<string, bigint>) => {
    try {
      const serialisable: Record<string, string> = {};
      for (const [mint, raw] of Object.entries(balances)) {
        serialisable[mint] = raw.toString();
      }
      const serialised = JSON.stringify(serialisable);
      if (serialised.length > 1900) return;
      await SecureStore.setItemAsync(CACHED_BALANCES_KEY_V2, serialised);
    } catch {
      // Cache miss isn't fatal — the next deep refresh will repopulate.
    }
  }, []);

  // Mount probe — one SecureStore read, deferred to next tick so it doesn't
  // contend with the wallet's own initial fetches. No client build, no RPC.
  useEffect(() => {
    const id = setTimeout(() => { refresh(); }, 300);
    return () => clearTimeout(id);
  }, [refresh]);

  // Lazy client builder — first action that needs the client calls this.
  // Subsequent calls reuse the cached client.
  //
  // Yields to the event loop before AND after the heavy SDK construction so
  // UI updates (e.g. a "Loading..." state) can flush between frames. Without
  // these yields buildUmbraClient runs sync and freezes the JS thread for
  // hundreds of ms.
  const ensureClient = useCallback(async () => {
    if (clientRef.current && signerRef.current) {
      return { signer: signerRef.current, client: clientRef.current };
    }
    await new Promise((r) => setTimeout(r, 0));
    const { signer, client } = await getStoredSignerAndClient();
    await new Promise((r) => setTimeout(r, 0));
    signerRef.current = signer;
    clientRef.current = client;
    return { signer, client };
  }, []);

  // Heavy probe — only called when the user opens the private sheet OR
  // toggles "Send privately". Builds the client + fetches the encrypted
  // balance + sets status='ready' (or 'unregistered' if the user hasn't
  // finished setup).
  // Fetch every tracked mint's private balance in parallel, returning the
  // aggregate map + an "is the signer registered at all" flag (true if any
  // mint query succeeded as registered — SDK reports registration per-mint
  // but practically the signer either exists or doesn't).
  const fetchAllPrivateBalances = useCallback(
    async (client: IUmbraClient): Promise<{ balances: Record<string, bigint>; registered: boolean }> => {
      const results = await Promise.all(
        PRIVATE_MINTS.map(async (mint) => {
          try {
            const r = await fetchPrivateBalanceForMint(client, mint);
            return { mint, lamports: r.lamports, registered: r.registered };
          } catch {
            return { mint, lamports: 0n, registered: false };
          }
        }),
      );
      const balances = emptyBalances();
      let anyRegistered = false;
      for (const r of results) {
        balances[r.mint] = r.lamports;
        if (r.registered) anyRegistered = true;
      }
      return { balances, registered: anyRegistered };
    },
    [],
  );

  const refreshDeep = useCallback(async () => {
    setStatus((prev) => (prev === 'busy' || prev === 'setting-up' ? prev : 'loading'));
    try {
      const { client } = await ensureClient();
      const { balances, registered } = await fetchAllPrivateBalances(client);
      if (!mountedRef.current) return;
      setPrivateBalancesByMint(balances);
      cacheBalances(balances);
      setStatus(registered ? 'ready' : 'unregistered');
    } catch {
      if (!mountedRef.current) return;
      setStatus('unregistered');
      setPrivateBalancesByMint(emptyBalances());
    }
  }, [ensureClient, fetchAllPrivateBalances, cacheBalances]);

  // No auto deep-refresh. The Umbra client is heavy enough that even a 2s
  // deferred build noticeably stalls the JS thread when it runs. Instead, we
  // build the client ONLY when the user explicitly opens the private sheet
  // or toggles "Send privately" — callers invoke `refreshDeep()` at that
  // point. The header private-balance line stays hidden until that first
  // interaction has populated a real balance (or incoming count).

  const setUp = useCallback(async (fundSigner: FundSignerFn) => {
    setStatus('setting-up');
    setErrorMessage(null);
    try {
      const { signer, client } = await ensurePrivateModeReady({
        fundSigner,
        onProgress: (evt) => {
          if (mountedRef.current) setSetupStage(evt);
        },
      });
      signerRef.current = signer;
      clientRef.current = client;
      const { balances } = await fetchAllPrivateBalances(client);
      if (!mountedRef.current) return;
      setPrivateBalancesByMint(balances);
      cacheBalances(balances);
      setStatus('ready');
      setSetupStage(null);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setErrorMessage(err?.message ?? 'Setup failed');
      setStatus('unregistered');
      setSetupStage(null);
    }
  }, [fetchAllPrivateBalances, cacheBalances]);

  // `deposit` and `withdraw` low-level methods removed in 0.4.2 — only
  // `moveAllToPublic` is wired into the UI. If a future flow needs
  // arbitrary-amount deposit/withdraw, restore from git history and add
  // back to the hook's return type.

  // Move encrypted balance back to the user's main (smart) wallet.
  //
  // The Umbra SDK's withdraw lands wSOL in the SIGNER's wSOL ATA — that's
  // the only ATA the SDK can safely target (it exists from the deposit
  // flow + is owned by the signer who has authority over the encrypted
  // balance). Targeting the smart wallet's wSOL ATA directly fails
  // simulation because (a) it likely doesn't exist and (b) the SDK can't
  // create one on the user's behalf without their signer being the owner.
  //
  // The two-step pipeline:
  //   1. SDK withdraw  → wSOL appears in signer's wSOL ATA
  //   2. closeAccount  → wSOL ATA destroyed; rent + wSOL unwrap as native
  //                      SOL flow to the smart wallet (destination)
  // Both txs are paid for by the signer (it already holds ~0.017 SOL from
  // the original setup fund). User sees one button → success → SOL
  // appears in their main wallet.
  const moveAllToPublic = useCallback(async (mainWalletPubkey: string, mint?: string): Promise<string> => {
    // Phase A/B of #38 keep this SOL-only. The `mint` arg exists so callers
    // can start passing it now (forward-compat); non-SOL values throw until
    // the v5 SDK migration unlocks the SPL withdraw → ATA-transfer path.
    const targetMint = mint ?? SOL_MINT;
    if (targetMint !== SOL_MINT) {
      throw new Error('Moving non-SOL private balance to public is temporarily unavailable. Try again after the next app update.');
    }
    setStatus('busy');
    try {
      const sig = await withOpTimeout(
        (async () => {
          // 1. Lazy client build
          const { signer, client } = await ensureClient();

          // 2. Load signer keypair from SecureStore so we can sign the
          //    close+unwrap tx ourselves (the SDK only signs the withdraw).
          const stored = await SecureStore.getItemAsync('umbra_throwaway_signer_v1');
          if (!stored) throw new Error('Private mode signer not found — please set up private mode first.');
          const signerBytes = Uint8Array.from(Buffer.from(stored, 'base64'));
          if (signerBytes.byteLength !== 64) throw new Error('Stored signer key is malformed.');
          const signerKp = Keypair.fromSecretKey(signerBytes);

          // 3. Fresh on-chain balance check. Caller passes mainWalletPubkey;
          //    we re-read encrypted balance here so we never withdraw a stale
          //    amount that exceeds reality and fails simulation.
          const fresh = await fetchPrivateBalanceForMint(client, SOL_MINT);
          if (mountedRef.current) {
            setPrivateBalancesByMint((prev) => {
              const next = { ...prev, [SOL_MINT]: fresh.lamports };
              cacheBalances(next);
              return next;
            });
          }
          if (fresh.lamports === 0n) {
            throw new Error('Private balance is 0. Nothing to move to public.');
          }

          // The on-chain Umbra program checks
          //   encryptedBalance >= withdrawalAmount + protocolFees
          // before allowing the withdrawal. Attempting to drain the full
          // balance (withdrawalAmount = encryptedBalance) leaves zero room
          // for protocolFees and the simulation rejects with
          // "Transaction simulation failed". Reserve a small fee buffer
          // so the inequality holds. 10_000 lamports (0.00001 SOL) is
          // comfortably above the observed mainnet fee tier and still
          // small enough that the user effectively gets "all" back.
          const FEE_BUFFER_LAMPORTS = 10_000n;
          if (fresh.lamports <= FEE_BUFFER_LAMPORTS) {
            throw new Error('Private balance is too small to cover the network fee. Try again once you have at least 0.00002 SOL in private.');
          }
          const withdrawalAmount = fresh.lamports - FEE_BUFFER_LAMPORTS;

          // 4. Compute signer's wSOL ATA. This is the destination for the
          //    SDK withdraw — created earlier during the first deposit, so
          //    the SDK can write to it without a separate create-ATA step.
          const signerWsolAta = await getAssociatedTokenAddress(
            new PublicKey(SOL_MINT),
            signerKp.publicKey,
            true,
          );

          // 5. SDK withdraw → wSOL lands in signer's wSOL ATA.
          //    `withdrawalAmount` is balance minus the fee buffer so the
          //    on-chain validator (encryptedBalance >= amount + fees) passes.
          // The Umbra v4 → v5 migration on mainnet means this SDK call
          // currently fails with InstructionFallbackNotFound (Anchor 0x65).
          // The error is surfaced to WalletScreen, which translates it into a
          // user-friendly "Withdrawal temporarily unavailable" alert. The
          // v5 SDK migration in 0.4.3 will re-enable this path.
          await withdrawToPublicBalance({
            client,
            destinationAta: signerWsolAta.toBase58(),
            mint: SOL_MINT,
            amount: withdrawalAmount,
          });

          // 6. Close the wSOL ATA. For wSOL specifically, closing unwraps
          //    the token balance back to native lamports and sends them
          //    (along with the rent reclaim) to the destination — which
          //    we set to the main wallet so funds land where the user
          //    expects them.
          const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
          const closeIx = createCloseAccountInstruction(
            signerWsolAta,
            new PublicKey(mainWalletPubkey),
            signerKp.publicKey,
          );
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          const tx = new Transaction().add(closeIx);
          tx.recentBlockhash = blockhash;
          tx.feePayer = signerKp.publicKey;
          tx.sign(signerKp);
          const closeSig = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
          await connection.confirmTransaction(
            { signature: closeSig, blockhash, lastValidBlockHeight },
            'confirmed',
          );

          // 7. Refresh cached balance to 0n since we just emptied it.
          if (mountedRef.current) {
            setPrivateBalancesByMint((prev) => {
              const next = { ...prev, [SOL_MINT]: 0n };
              cacheBalances(next);
              return next;
            });
          }

          return closeSig;
        })(),
        'Move to public',
      );

      if (mountedRef.current) setStatus('ready');
      return sig;
    } catch (err: any) {
      if (mountedRef.current) {
        setErrorMessage(err?.message ?? 'Move to public failed');
        setStatus('ready');
      }
      throw err;
    }
  }, [ensureClient, cacheBalances]);

  const refreshIncoming = useCallback(async () => {
    try {
      // Wrap the ENTIRE chain (client build + scan) in the timeout, not just
      // the scan. Earlier impl let ensureClient hang on first-time client
      // construction with no timeout protection, which made the button spin
      // forever instead of surfacing the issue.
      const utxos = await withOpTimeout(
        (async () => {
          const { client } = await ensureClient();
          const scan = await scanClaimableUtxosAcrossTrees({ client, maxTreeIndex: 8 });
          return scan.received ?? [];
        })(),
        'Check incoming',
      );
      scannedUtxosRef.current = utxos;
      const totalLamports = (utxos as any[]).reduce<bigint>((acc, u: any) => {
        const amt = u?.amount ?? u?.data?.amount ?? 0n;
        return acc + (typeof amt === 'bigint' ? amt : BigInt(amt ?? 0));
      }, 0n);
      if (mountedRef.current) setIncoming({ count: (utxos as any[]).length, totalLamports });
    } catch (err: any) {
      // Re-throw so the WalletScreen onPress catch can surface a user alert
      // instead of silently swallowing the failure.
      throw err;
    }
  }, [ensureClient]);

  const claimIncoming = useCallback(async () => {
    if (scannedUtxosRef.current.length === 0) return;
    setStatus('busy');
    try {
      const { client } = await ensureClient();
      await withOpTimeout(
        claimReceiverClaimableUtxosToEncryptedBalance({
          client,
          utxos: scannedUtxosRef.current,
        }),
        'Claim incoming',
      );
      // Claims today still aggregate into the SOL bucket (multi-mint UTXO
      // partitioning is Phase C of #38). Refresh ALL mints since a claim may
      // settle balances for any of them server-side.
      const { balances } = await fetchAllPrivateBalances(client);
      if (mountedRef.current) {
        setPrivateBalancesByMint(balances);
        cacheBalances(balances);
        setIncoming({ count: 0, totalLamports: 0n });
        scannedUtxosRef.current = [];
        setStatus('ready');
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setErrorMessage(err?.message ?? 'Claim failed');
        setStatus('ready');
      }
      throw err;
    }
  }, [ensureClient, fetchAllPrivateBalances, cacheBalances]);

  const privateSend = useCallback<UsePrivateModeReturn['privateSend']>(async (args) => {
    const { privateSendFromMain } = await import('../umbra/private-send-from-main');
    if (!clientRef.current || !signerRef.current) {
      await setUp(args.fundSigner);
    }
    if (!clientRef.current || !signerRef.current) throw new Error('Private mode not ready');

    // Resolve mint + amount. Prefer the explicit (amount, mint) pair; fall
    // back to the legacy (lamports) shape for the SOL send path that
    // pre-dates multi-mint. Reject empty/zero amounts up front so we don't
    // hit the SDK with a bad value.
    const mint = args.mint ?? SOL_MINT;
    let amountRaw: bigint;
    if (typeof args.amount === 'bigint') {
      amountRaw = args.amount;
    } else if (typeof args.lamports === 'number' && Number.isFinite(args.lamports)) {
      amountRaw = BigInt(Math.floor(args.lamports));
    } else {
      throw new Error('privateSend requires either `amount` (bigint) or `lamports` (number).');
    }
    if (amountRaw <= 0n) {
      throw new Error('Amount must be greater than zero.');
    }

    setStatus('busy');
    try {
      const result = await privateSendFromMain({
        client: clientRef.current,
        signerAddress: signerRef.current.address,
        destinationAddress: args.destination,
        amountLamports: amountRaw,
        mint,
        onDegradationRequested: args.onDegradationRequested,
      });
      // Refresh only the affected mint's balance (faster than a full sweep)
      // unless the result fell through to the public-fallback path, in
      // which case no encrypted balance changed.
      if (result.mode === 'umbra-encrypted') {
        const { lamports: newBal } = await fetchPrivateBalanceForMint(clientRef.current, mint);
        if (mountedRef.current) {
          setPrivateBalancesByMint((prev) => {
            const next = { ...prev, [mint]: newBal };
            cacheBalances(next);
            return next;
          });
        }
      }
      if (mountedRef.current) setStatus('ready');
      return result;
    } catch (err: any) {
      if (mountedRef.current) {
        setErrorMessage(err?.message ?? 'Private send failed');
        setStatus('ready');
      }
      throw err;
    }
  }, [setUp, cacheBalances]);

  // No auto-poll for incoming claims. The multi-tree RPC scan is heavy
  // enough that even an opt-in interval freezes the JS thread when it fires.
  // The "Check for new payments" button in the private sheet is the ONLY
  // way scanning runs — explicit user action, with a loading state, with a
  // freeze that's expected because they tapped the button.
  //
  // setIncomingPollEnabled is kept as a no-op so existing callers don't break.
  const setIncomingPollEnabled = useCallback((_enabled: boolean) => {
    // Intentionally empty — see comment above. Scanning is button-driven only.
  }, []);

  // All useCallback methods above have stable deps (empty array or
  // other stable callbacks), so their identity never changes across
  // renders. We can stash them in a ref so the consumer-visible return
  // object only re-memoises when REACTIVE state actually changes.
  // This collapses the dep array from 13 items down to 5.
  const methodsRef = useRef({
    refresh, refreshDeep, setIncomingPollEnabled, setUp,
    moveAllToPublic, refreshIncoming, claimIncoming, privateSend,
  });
  methodsRef.current = {
    refresh, refreshDeep, setIncomingPollEnabled, setUp,
    moveAllToPublic, refreshIncoming, claimIncoming, privateSend,
  };

  return useMemo(
    () => ({
      status,
      setupStage,
      privateBalanceLamports,
      privateBalanceSol: Number(privateBalanceLamports) / LAMPORTS_PER_SOL,
      privateBalancesByMint,
      incoming,
      errorMessage,
      ...methodsRef.current,
    }),
    [status, setupStage, privateBalanceLamports, privateBalancesByMint, incoming, errorMessage],
  );
}
