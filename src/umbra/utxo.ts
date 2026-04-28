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
    if (result.state === 'non_existent') {
      return { registered: false, hasX25519: false };
    }
    return {
      registered: true,
      hasX25519: !!(result.data as any)?.isX25519PubkeyRegistered,
    };
  } catch (err: any) {
    return {
      registered: false,
      hasX25519: false,
      unknown: true,
      unknownReason: String(err?.message ?? err),
    };
  }
}
