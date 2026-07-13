// v5 confidential transfer — the unified "send privately to anyone" primitive.
//
// Replaces the old receiver-claimable-note flow's registration gate. v5 exposes
// a single `getTransferorFunction` that fetches the four relevant accounts in
// one RPC call and dispatches across 8 on-chain variants over three binary
// dimensions:
//   sender encryption mode   : network | shared
//   receiver account existence: existing | new   (new => init_if_needed creates
//                                                  the receiver's account, so an
//                                                  UNREGISTERED receiver works)
//   receiver encryption mode : network | shared
//
// Source: the sender's ENCRYPTED balance (ETA) for `mint`. So a full "private
// send from my public wallet" is: deposit ATA->ETA (see deposit.ts) THEN this.
//
// End-state (IMPORTANT / to confirm with Umbra): this delivers into the
// receiver's ENCRYPTED balance, not their plain public ATA. That differs from
// Cal's ETA->ShieldedPool->ATA relay, which lands spendable public SPL in the
// recipient's normal ATA. Pick the primitive per the product intent for
// non-Umbra recipients. See [[cal_relay_pattern_pending_v5]].
//
// Result kinds:
//  - `submitted` (shared-sender variants): SDK ran prepare->build->submit and
//    returns the queue tx signature.
//  - `prepared`  (network-sender variants): SDK stopped at prepare; the caller
//    must build + submit the queue tx out-of-band (via the relayer). That
//    relayer-submit path is the next layer, not yet wired here.

import { getTransferorFunction } from '@umbra-privacy/sdk/transfer';
import type { TransferResult } from '@umbra-privacy/sdk/transfer';
import { createU64 } from '@umbra-privacy/sdk/types';
import type { IUmbraClient } from '@umbra-privacy/sdk';

export interface PrivateTransferArgs {
  client: IUmbraClient;
  /** Any public Solana address — registered with Umbra or not. */
  receiverAddress: string;
  /** SPL mint of the asset being sent. */
  mint: string;
  /** Amount in the mint's smallest unit. */
  amount: bigint;
}

export type PrivateTransferProgress =
  | { stage: 'transferring' }
  | { stage: 'submitted'; signature: string }
  | { stage: 'prepared' };

/**
 * Confidentially transfer from the caller's encrypted balance to any receiver.
 * Handles unregistered receivers via the `*_to_new_*` variants (the SDK creates
 * the receiver's account on the fly). Returns the raw v5 TransferResult so the
 * caller can branch on `submitted` vs `prepared`.
 */
export async function privateTransferToAny(
  { client, receiverAddress, mint, amount }: PrivateTransferArgs,
  onProgress?: (e: PrivateTransferProgress) => void,
): Promise<TransferResult> {
  const transfer = getTransferorFunction({ client });

  onProgress?.({ stage: 'transferring' });
  const result = await transfer({
    receiverAddress: receiverAddress as any,
    mint: mint as any,
    transferAmount: createU64({ value: amount, name: 'transferAmount' }),
  });

  if (result.kind === 'submitted') {
    onProgress?.({ stage: 'submitted', signature: result.signature as unknown as string });
  } else {
    onProgress?.({ stage: 'prepared' });
  }
  return result;
}
