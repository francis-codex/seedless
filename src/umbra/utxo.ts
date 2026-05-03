// Receiver-claimable UTXO flow: create + scan today; claim wired in a later
// pass once we wire relayer + batch-merkle-proof deps from the indexer.
// Plan reference: docs/umbra-integration-plan.md §6.5–§6.7
//
// Devnet caveat (Apr 27 2026): only WSOL mint supported on devnet — pass
// SOL_MINT and the SDK auto-wraps native SOL.
//
// Claim status:
// - `getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction` requires
//   `{ zkProver, fetchBatchMerkleProof, relayer }`. We have the prover. The
//   merkle fetcher and relayer wiring is the next pass — we'll build a single
//   `umbra/relayer.ts` + `umbra/indexer.ts` that constructs both from
//   UMBRA_RELAYER_URL / UMBRA_INDEXER_URL constants.
// - Direct claim-to-public-ATA helper is missing in the SDK (Cal: "I'll add
//   it ASAP"). Workaround when wired: claim into ETA, then withdraw to ATA.

import {
  getClaimableUtxoScannerFunction,
  getPublicBalanceToReceiverClaimableUtxoCreatorFunction,
  getUserAccountQuerierFunction,
} from '@umbra-privacy/sdk';
import { createU32, createU64 } from '@umbra-privacy/sdk/utils';
import type {
  CreateUtxoFromPublicBalanceResult,
  IUmbraClient,
  ScannedUtxoResult,
} from '@umbra-privacy/sdk/interfaces';

import { createCreateUtxoFromPublicBalanceWithReceiverUnlockerZkProver } from './zk/provers';

export interface CreateReceiverUtxoArgs {
  client: IUmbraClient;
  destinationAddress: string;
  mint: string;
  amount: bigint;
}

export type CreateUtxoProgress =
  | { stage: 'prover-ready' }
  | { stage: 'creating' }
  | { stage: 'success'; result: CreateUtxoFromPublicBalanceResult };

export async function createReceiverClaimableFromPublicBalance(
  args: CreateReceiverUtxoArgs,
  onProgress?: (e: CreateUtxoProgress) => void,
): Promise<CreateUtxoFromPublicBalanceResult> {
  const { client, destinationAddress, mint, amount } = args;
  const zkProver = createCreateUtxoFromPublicBalanceWithReceiverUnlockerZkProver();
  onProgress?.({ stage: 'prover-ready' });

  const create = getPublicBalanceToReceiverClaimableUtxoCreatorFunction({ client }, { zkProver });

  onProgress?.({ stage: 'creating' });
  const result = await create({
    amount: createU64(amount, 'utxoAmount'),
    destinationAddress: destinationAddress as any,
    mint: mint as any,
  });

  onProgress?.({ stage: 'success', result });
  return result;
}

export interface ScanArgs {
  client: IUmbraClient;
  treeIndex: number | bigint;
  startInsertionIndex?: number | bigint;
  endInsertionIndex?: number | bigint;
}

// U32 in the SDK is a branded bigint — assertU32 throws on non-bigint inputs.
const toU32 = (v: number | bigint) => createU32(typeof v === 'bigint' ? v : BigInt(v));

export async function scanClaimableUtxos(args: ScanArgs): Promise<ScannedUtxoResult> {
  const { client, treeIndex, startInsertionIndex = 0, endInsertionIndex } = args;
  const scan = getClaimableUtxoScannerFunction({ client });
  return scan(
    toU32(treeIndex),
    toU32(startInsertionIndex),
    endInsertionIndex !== undefined ? toU32(endInsertionIndex) : undefined,
  );
}

// Devnet's mixer tree 0 has been around for weeks and may be full or
// past-cursor relative to a freshly created UTXO. The SDK doesn't expose a
// "current tree index" querier yet, so iterate a small range and merge.
// 8 trees × 2^20 leaves is plenty of headroom for the demo window.
// SDK v4 returns: { selfBurnable, received, publicSelfBurnable, publicReceived }.
// Pre-v4 used { ephemeral, receiver, publicEphemeral, publicReceiver }.
// We were reading the old field names → every scan looked empty even though
// the SDK was decrypting UTXOs successfully.
export async function scanClaimableUtxosAcrossTrees(args: {
  client: IUmbraClient;
  maxTreeIndex?: number;
}): Promise<{
  selfBurnable: any[];
  received: any[];
  publicSelfBurnable: any[];
  publicReceived: any[];
  treesScanned: number;
  perTree: Array<{ treeIndex: number; counts: string }>;
}> {
  const { client, maxTreeIndex = 7 } = args;
  const indices = Array.from({ length: maxTreeIndex + 1 }, (_, i) => i);

  // Parallel sweep. The previous serial loop paid 8× the round-trip latency
  // for what is effectively 8 independent reads. Errors on empty/non-existent
  // trees are demoted to zero-count entries instead of breaking the sweep —
  // a single missing tree shouldn't blind us to populated higher trees.
  const settled = await Promise.all(
    indices.map(async (t) => {
      try {
        const r = (await scanClaimableUtxos({ client, treeIndex: t })) as any;
        return {
          treeIndex: t,
          selfBurnable: (r.selfBurnable ?? []) as any[],
          received: (r.received ?? []) as any[],
          publicSelfBurnable: (r.publicSelfBurnable ?? []) as any[],
          publicReceived: (r.publicReceived ?? []) as any[],
          ok: true as const,
        };
      } catch (err: any) {
        const msg = String(err?.message ?? err).toLowerCase();
        const expected = msg.includes('not found') || msg.includes('out of range') || msg.includes('does not exist');
        if (!expected) console.warn(`[umbra] scan tree ${t} failed:`, err?.message ?? err);
        return {
          treeIndex: t,
          selfBurnable: [] as any[],
          received: [] as any[],
          publicSelfBurnable: [] as any[],
          publicReceived: [] as any[],
          ok: false as const,
        };
      }
    }),
  );

  const selfBurnable: any[] = [];
  const received: any[] = [];
  const publicSelfBurnable: any[] = [];
  const publicReceived: any[] = [];
  const perTree: Array<{ treeIndex: number; counts: string }> = [];

  for (const s of settled) {
    perTree.push({
      treeIndex: s.treeIndex,
      counts: `${s.selfBurnable.length}sb/${s.received.length}r/${s.publicSelfBurnable.length}psb/${s.publicReceived.length}pr`,
    });
    selfBurnable.push(...s.selfBurnable);
    received.push(...s.received);
    publicSelfBurnable.push(...s.publicSelfBurnable);
    publicReceived.push(...s.publicReceived);
  }

  return {
    selfBurnable,
    received,
    publicSelfBurnable,
    publicReceived,
    treesScanned: perTree.length,
    perTree,
  };
}

// Pre-flight check for "is this address able to receive an encrypted UTXO?"
// Receiver-claimable UTXOs encrypt to the recipient's X25519 viewing key,
// which only exists on chain if they ran Umbra registration. If we skip this
// check the SDK throws `Receiver is not registered` deep in the create flow.
//
// This is a fundamental constraint of any encrypted-balance protocol (Zcash,
// Aztec, Umbra) — not an Umbra bug.
export interface RecipientUmbraStatus {
  registered: boolean;
  hasX25519: boolean;
  // True when the RPC pre-flight failed (e.g. Helius -32401 on
  // getMultipleAccounts). Caller should attempt the encrypted path anyway
  // and rely on the SDK's "Receiver is not registered" error as the
  // authoritative fallback trigger.
  unknown?: boolean;
  unknownReason?: string;
}

export async function checkRecipientUmbraStatus(
  client: IUmbraClient,
  recipientAddress: string,
): Promise<RecipientUmbraStatus> {
  try {
    const query = getUserAccountQuerierFunction({ client });
    const result = await query(recipientAddress as any);
    const anyResult = result as any;
    console.log('[umbra] recipient query', recipientAddress, {
      state: result.state,
      data: anyResult.data,
    });
    if (result.state === 'non_existent') {
      return { registered: false, hasX25519: false };
    }
    const data = anyResult.data;
    // Don't trust the boolean flag alone — a half-registered account can show
    // isUserAccountX25519KeyRegistered: true while x25519PublicKey is 32 zero
    // bytes (step 1 ran, step 2 didn't). And don't trust !!data.x25519PublicKey
    // either: a Uint8Array is truthy regardless of contents.
    const keyBytes: Uint8Array | number[] | undefined =
      data?.x25519PublicKey ?? data?.x25519Pubkey ?? data?.confidentialKey;
    const keyIsNonZero = !!keyBytes && Array.from(keyBytes as any).some((b: any) => b !== 0);
    const isUserCommitmentRegistered = !!data?.isUserCommitmentRegistered;
    const hasX25519 = keyIsNonZero && isUserCommitmentRegistered;
    return { registered: true, hasX25519 };
  } catch (err: any) {
    return {
      registered: false,
      hasX25519: false,
      unknown: true,
      unknownReason: String(err?.message ?? err),
    };
  }
}
