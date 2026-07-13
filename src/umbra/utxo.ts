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

import { getATAIntoReceiverBurnableStealthPoolNoteCreatorFunction } from '@umbra-privacy/sdk/deposit';
import { getBurnableStealthPoolNoteScannerFunction } from '@umbra-privacy/sdk/burn';
import { getUserAccountQuerierFunction } from '@umbra-privacy/sdk/query';
import { createU64 } from '@umbra-privacy/sdk/types';
import type { CreateUtxoFromPublicBalanceResult } from '@umbra-privacy/sdk/shared';
import type { ScannedStealthPoolNoteResult } from '@umbra-privacy/sdk/burn';
import type { IUmbraClient } from '@umbra-privacy/sdk';

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

  const create = getATAIntoReceiverBurnableStealthPoolNoteCreatorFunction(
    { client },
    { zkProver: zkProver as any },
  );

  onProgress?.({ stage: 'creating' });
  const result = await create({
    amount: createU64({ value: amount, name: 'utxoAmount' }),
    destinationAddress: destinationAddress as any,
    mint: mint as any,
  });

  onProgress?.({ stage: 'success', result });
  return result;
}

// v5: the scanner is store-backed and zero-arg. scan() decrypts every visible
// note across all trees in a single call, persists the decrypted notes into
// client.utxoDataStore, and returns the four buckets plus scannedTrees. The old
// per-tree index looping (getClaimableUtxoScannerFunction with tree/insertion
// args) is gone — confirmed by Adithya (Umbra eng, Jul 7).
export async function scanClaimableUtxos(
  client: IUmbraClient,
): Promise<ScannedStealthPoolNoteResult> {
  const scan = getBurnableStealthPoolNoteScannerFunction({ client });
  return scan();
}

// Back-compat wrapper: keeps the exact shape the private-mode hook consumes,
// now backed by the single v5 zero-arg scan. `maxTreeIndex` is ignored (the
// scanner sweeps all trees itself) but retained so existing callers don't need
// to change. Buckets are unchanged: selfBurnable / received / publicSelfBurnable
// / publicReceived.
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
  const { client } = args;
  const r = (await scanClaimableUtxos(client)) as any;
  const selfBurnable = (r.selfBurnable ?? []) as any[];
  const received = (r.received ?? []) as any[];
  const publicSelfBurnable = (r.publicSelfBurnable ?? []) as any[];
  const publicReceived = (r.publicReceived ?? []) as any[];
  const scannedTrees = Array.isArray(r.scannedTrees) ? r.scannedTrees : [];
  return {
    selfBurnable,
    received,
    publicSelfBurnable,
    publicReceived,
    treesScanned: scannedTrees.length,
    perTree: [
      {
        treeIndex: 0,
        counts: `${selfBurnable.length}sb/${received.length}r/${publicSelfBurnable.length}psb/${publicReceived.length}pr`,
      },
    ],
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
