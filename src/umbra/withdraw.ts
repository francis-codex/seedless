// ETA → ATA: unshield encrypted balance back to a public token account.
// Plan reference: docs/umbra-integration-plan.md §6.4

import { getETAIntoATAWithdrawerFunction } from '@umbra-privacy/sdk/withdrawal';
import { createU64 } from '@umbra-privacy/sdk/types';
import type { WithdrawResult } from '@umbra-privacy/sdk/shared';
import type { IUmbraClient } from '@umbra-privacy/sdk';

export interface WithdrawArgs {
  client: IUmbraClient;
  destinationAta: string;
  mint: string;
  amount: bigint;
}

export type WithdrawProgress =
  | { stage: 'building' }
  | { stage: 'queue-pre' }
  | { stage: 'queue-post'; signature: string }
  | { stage: 'callback-post'; signature: string; status: string; elapsedMs?: number }
  | { stage: 'success'; result: WithdrawResult };

export type WithdrawProgressCallback = (event: WithdrawProgress) => void;

export async function withdrawToPublicBalance(
  args: WithdrawArgs,
  onProgress?: WithdrawProgressCallback,
): Promise<WithdrawResult> {
  // v5: the withdrawer signature dropped its leading destinationAta param —
  // it now resolves the caller's canonical ATA internally as
  // (mint, amount, options?). destinationAta stays on WithdrawArgs for caller
  // compatibility but is no longer forwarded.
  const { client, mint, amount } = args;

  onProgress?.({ stage: 'building' });
  const withdraw = getETAIntoATAWithdrawerFunction({ client });

  const u64Amount = createU64({ value: amount, name: 'withdrawAmount' });

  onProgress?.({ stage: 'queue-pre' });
  const result = await withdraw(mint as any, u64Amount);

  onProgress?.({ stage: 'queue-post', signature: result.queueSignature });

  // v5: callback info is now a single optional CallbackOutcome; signature only
  // exists on the "finalized" status.
  const cb = result.callback;
  if (cb) {
    onProgress?.({
      stage: 'callback-post',
      signature: cb.status === 'finalized' ? (cb.signature ?? '') : '',
      status: cb.status,
      elapsedMs: cb.elapsedMs,
    });
  }

  onProgress?.({ stage: 'success', result });
  return result;
}
