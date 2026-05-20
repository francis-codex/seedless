// One-shot private mode setup orchestrator.
//
// Wraps the throwaway-signer + registration flow into a single high-level
// `ensurePrivateModeReady` call that the UI invokes when it wants to be sure
// the user is registered and ready to receive/send privately.
//
// First-time flow (granma path):
//   1. Load or create throwaway Ed25519 signer in SecureStore.
//   2. Build Umbra client against that signer.
//   3. Read signer's on-chain SOL balance.
//   4. If under threshold → caller funds the signer via main wallet, then
//      `ensurePrivateModeReady` resumes registration.
//   5. Run 3-step registration (idempotent).
//
// Returns the live signer + client so the caller can immediately do
// deposit / withdraw / private-send without rebuilding state.

import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC_URL } from '../constants';
import { buildUmbraClient } from './client';
import {
  runHelloWorldRegistration,
  getStoredSignerAndClient,
} from './registration';
import { checkRecipientUmbraStatus } from './utxo';

// Minimum SOL the signer needs on-chain before registration + a first deposit
// can succeed. Covers 3 registration txs (~0.005), ATA rent (~0.0015), wSOL
// rent (~0.002), and one private send (~0.01). Round up for safety.
export const PRIVATE_MODE_MIN_FUND_SOL = 0.02;
export const PRIVATE_MODE_MIN_FUND_LAMPORTS = Math.floor(PRIVATE_MODE_MIN_FUND_SOL * LAMPORTS_PER_SOL);

export type SetupStage =
  | { stage: 'loading-signer' }
  | { stage: 'signer-ready'; address: string }
  | { stage: 'checking-fund'; address: string }
  | { stage: 'needs-fund'; address: string; currentLamports: number }
  | { stage: 'funding' }
  | { stage: 'registering' }
  | { stage: 'register-step'; step: number; total: number }
  | { stage: 'ready' };

export type SetupProgressCallback = (event: SetupStage) => void;

// Caller hook: when the signer is underfunded, the setup pauses and asks the
// caller to send `PRIVATE_MODE_MIN_FUND_LAMPORTS` lamports from the main
// wallet to the signer's address. The caller's function is responsible for
// the passkey prompt + tx confirmation. Return the tx signature on success.
export type FundSignerFn = (signerAddress: string, lamports: number) => Promise<string>;

export interface EnsurePrivateModeReadyArgs {
  fundSigner: FundSignerFn;
  onProgress?: SetupProgressCallback;
}

async function getOrLoadSigner() {
  // getStoredSignerAndClient throws if no signer is in storage — in that case
  // we kick off the throwaway flow which creates one. Either branch ends with
  // {signer, client}.
  try {
    return await getStoredSignerAndClient();
  } catch {
    // runHelloWorldRegistration both creates the signer AND registers it.
    // For now we only use it to materialise the signer; the actual register
    // path below handles re-running if needed.
    // Calling registration directly here is fine because the registration
    // helper is idempotent — re-running on a fresh signer is the normal path.
    return null;
  }
}

async function getSignerLamports(address: string): Promise<number> {
  try {
    const conn = new Connection(SOLANA_RPC_URL, 'confirmed');
    return await conn.getBalance(new PublicKey(address));
  } catch {
    // RPC hiccup — treat as 0 so we conservatively re-fund rather than skip.
    return 0;
  }
}

export async function ensurePrivateModeReady(
  args: EnsurePrivateModeReadyArgs,
): Promise<Awaited<ReturnType<typeof getStoredSignerAndClient>>> {
  const { fundSigner, onProgress } = args;

  onProgress?.({ stage: 'loading-signer' });
  let signerClient = await getOrLoadSigner();

  // No signer in storage — bootstrap it via the registration helper.
  // runHelloWorldRegistration writes to SecureStore on first run; afterwards
  // getStoredSignerAndClient is reusable.
  if (!signerClient) {
    onProgress?.({ stage: 'registering' });
    const result = await runHelloWorldRegistration((evt) => {
      if (evt.stage === 'signer-created') {
        onProgress?.({ stage: 'signer-ready', address: evt.address });
      }
      if (evt.stage === 'step-post') {
        // Map SDK step names to our 1-based step counter.
        const stepMap: Record<string, number> = {
          userAccountInitialisation: 1,
          registerX25519PublicKey: 2,
          registerUserForAnonymousUsage: 3,
        };
        onProgress?.({ stage: 'register-step', step: stepMap[evt.step] ?? 0, total: 3 });
      }
    });
    onProgress?.({ stage: 'ready' });
    return { signer: result.signer, client: result.client };
  }

  const { signer, client } = signerClient;
  onProgress?.({ stage: 'signer-ready', address: signer.address });

  // Verify on-chain funding before any heavy lifting.
  onProgress?.({ stage: 'checking-fund', address: signer.address });
  const lamports = await getSignerLamports(signer.address);

  if (lamports < PRIVATE_MODE_MIN_FUND_LAMPORTS) {
    onProgress?.({ stage: 'needs-fund', address: signer.address, currentLamports: lamports });
    onProgress?.({ stage: 'funding' });
    const topUp = PRIVATE_MODE_MIN_FUND_LAMPORTS - lamports;
    await fundSigner(signer.address, topUp);
    // Wait briefly for the chain to reflect the new balance before continuing.
    // 1500ms is a pragmatic floor — Solana confirmed slots are ~400ms, but the
    // primary RPC's getBalance cache can lag a slot or two.
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Now check registration status. If already registered we skip the 3-step
  // run entirely; runHelloWorldRegistration is idempotent but calling it on an
  // already-registered signer still costs 3 simulation roundtrips.
  const status = await checkRecipientUmbraStatus(client, signer.address);
  if (status.hasX25519) {
    onProgress?.({ stage: 'ready' });
    return { signer, client };
  }

  onProgress?.({ stage: 'registering' });
  await runHelloWorldRegistration((evt) => {
    if (evt.stage === 'step-post') {
      const stepMap: Record<string, number> = {
        userAccountInitialisation: 1,
        registerX25519PublicKey: 2,
        registerUserForAnonymousUsage: 3,
      };
      onProgress?.({ stage: 'register-step', step: stepMap[evt.step] ?? 0, total: 3 });
    }
  });

  onProgress?.({ stage: 'ready' });
  return { signer, client };
}
