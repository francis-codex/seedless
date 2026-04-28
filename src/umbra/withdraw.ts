// ETA → ATA: unshield encrypted balance back to a public token account.
// Plan reference: docs/umbra-integration-plan.md §6.4

import { getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction } from '@umbra-privacy/sdk';
import { createU64 } from '@umbra-privacy/sdk/utils';
import type { IUmbraClient, WithdrawResult } from '@umbra-privacy/sdk/interfaces';

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
  const { client, destinationAta, mint, amount } = args;

  onProgress?.({ stage: 'building' });
  const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });

  const u64Amount = createU64(amount, 'withdrawAmount');

  onProgress?.({ stage: 'queue-pre' });
  const result = await withdraw(destinationAta as any, mint as any, u64Amount);

  onProgress?.({ stage: 'queue-post', signature: result.queueSignature });

  if (result.callbackSignature) {
    onProgress?.({
      stage: 'callback-post',
      signature: result.callbackSignature,
      status: result.callbackStatus ?? 'unknown',
      elapsedMs: result.callbackElapsedMs,
    });
  }

  onProgress?.({ stage: 'success', result });
  return result;
}
