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

import { getReceiverBurnableStealthPoolNoteIntoETABurnerFunction } from '@umbra-privacy/sdk/burn';
import type {
  BurnStealthPoolNoteIntoETAResult,
  DecryptedStealthPoolNoteData,
} from '@umbra-privacy/sdk/burn';
import type { IUmbraClient } from '@umbra-privacy/sdk';

import { createClaimReceiverZkProver } from './zk/provers';
import { getRelayer } from './relayer';

// v5 renamed the receiver-claimable-utxo model to a "burnable stealth pool
// note" model: the claimer is now getReceiverBurnableStealthPoolNoteIntoETABurnerFunction
// under @umbra-privacy/sdk/burn. Semantics are identical — burn a receiver note
// into the recipient's ETA. The prover interface + fetchBatchMerkleProof dep
// carry over unchanged (confirmed by Adithya, Umbra eng, Jul 7).
type ReceiverBurnableNote = DecryptedStealthPoolNoteData & { kind: 'receiver-burnable' };

export type ClaimProgress =
  | { stage: 'preparing' }
  | { stage: 'claiming'; utxoCount: number }
  | { stage: 'success'; result: BurnStealthPoolNoteIntoETAResult };

export interface ClaimArgs {
  client: IUmbraClient;
  utxos: readonly ReceiverBurnableNote[];
}

export async function claimReceiverClaimableUtxosToEncryptedBalance(
  { client, utxos }: ClaimArgs,
  onProgress?: (e: ClaimProgress) => void,
): Promise<BurnStealthPoolNoteIntoETAResult> {
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
  // v5: the relayer keys are burn-named but the wire protocol kept "claim", so
  // submitClaim/pollClaimStatus/getRelayerAddress rebind straight onto them.
  const burn = getReceiverBurnableStealthPoolNoteIntoETABurnerFunction(
    { client },
    {
      fetchBatchMerkleProof,
      zkProver,
      relayer: {
        submitBurn: relayer.submitClaim.bind(relayer),
        pollBurnStatus: relayer.pollClaimStatus.bind(relayer),
        getRelayerAddress: relayer.getRelayerAddress.bind(relayer),
      },
    },
  );
  onProgress?.({ stage: 'claiming', utxoCount: utxos.length });
  const result = await burn(utxos);
  onProgress?.({ stage: 'success', result });
  return result;
}
