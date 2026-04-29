// Receive-side: scan for claimable UTXOs sent to me, then claim them into my
// encrypted balance via the Umbra relayer.
//
// "Me" here means the Umbra signer attached to the client — the throwaway
// Ed25519 + passkey-derived master seed combo (Phase 3) for the main wallet,
// or a burner keypair (Phase 4) for burner identities.
//
// Round-trip: sender uses `createReceiverClaimableFromPublicBalance` (utxo.ts),
// recipient calls `claimReceiverClaimableUtxosToEncryptedBalance` (this file)
// to sweep them into their ETA. From the ETA they can withdraw to their
// public ATA via the existing withdraw flow.

import {
  getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction,
} from '@umbra-privacy/sdk';
import type {
  ClaimUtxoIntoEncryptedBalanceResult,
  IUmbraClient,
  ScannedUtxoData,
} from '@umbra-privacy/sdk/interfaces';

import { createClaimReceiverZkProver } from './zk/provers';
import { getRelayer } from './relayer';

export type ClaimProgress =
  | { stage: 'preparing' }
  | { stage: 'claiming'; utxoCount: number }
  | { stage: 'success'; result: ClaimUtxoIntoEncryptedBalanceResult };

export interface ClaimArgs {
  client: IUmbraClient;
  utxos: readonly ScannedUtxoData[];
}

export async function claimReceiverClaimableUtxosToEncryptedBalance(
  { client, utxos }: ClaimArgs,
  onProgress?: (e: ClaimProgress) => void,
): Promise<ClaimUtxoIntoEncryptedBalanceResult> {
  if (utxos.length === 0) {
    throw new Error('No claimable UTXOs to claim.');
  }
  onProgress?.({ stage: 'preparing' });
  const zkProver = createClaimReceiverZkProver();
  const relayer = getRelayer();
  // The client carries a `fetchBatchMerkleProof` constructed from the
  // indexer endpoint at client-build time — reuse it instead of constructing
  // our own. Fall back loudly if it's missing (would mean indexerApiEndpoint
  // wasn't set when the client was built — a misconfig).
  const fetchBatchMerkleProof = (client as any).fetchBatchMerkleProof;
  if (typeof fetchBatchMerkleProof !== 'function') {
    throw new Error(
      'Umbra client missing fetchBatchMerkleProof — check that indexerApiEndpoint is set in buildUmbraClient.',
    );
  }
  const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
    { client },
    { zkProver, relayer, fetchBatchMerkleProof },
  );
  onProgress?.({ stage: 'claiming', utxoCount: utxos.length });
  const result = await claim(utxos);
  onProgress?.({ stage: 'success', result });
  return result;
}
