// ATA → ETA: shield public balance into an Encrypted Token Account.
// Plan reference: docs/umbra-integration-plan.md §6.3
//
// Devnet caveat (Apr 27 2026, per Umbra TG): only WSOL mint is supported on devnet.
// Pass mint = SOL_MINT (So11111111111111111111111111111111111111112) — the SDK
// auto-wraps native devnet SOL behind the scenes.

import { getATAIntoETADirectDepositorFunction } from '@umbra-privacy/sdk/deposit';
import { createU64 } from '@umbra-privacy/sdk/types';
import type { DepositResult } from '@umbra-privacy/sdk/shared';
import type { IUmbraClient } from '@umbra-privacy/sdk';

export interface DepositArgs {
  client: IUmbraClient;
  destinationAddress: string;
  mint: string;
  amount: bigint;
}

export type DepositProgress =
  | { stage: 'building' }
  | { stage: 'queue-pre' }
  | { stage: 'queue-post'; signature: string }
  | { stage: 'callback-pre' }
  | { stage: 'callback-post'; signature: string; status: string; elapsedMs?: number }
  | { stage: 'success'; result: DepositResult };

export type DepositProgressCallback = (event: DepositProgress) => void;

export async function depositToEncryptedBalance(
  args: DepositArgs,
  onProgress?: DepositProgressCallback,
): Promise<DepositResult> {
  const { client, destinationAddress, mint, amount } = args;

  onProgress?.({ stage: 'building' });
  const deposit = getATAIntoETADirectDepositorFunction({ client });

  const u64Amount = createU64({ value: amount, name: 'depositAmount' });

  onProgress?.({ stage: 'queue-pre' });
  const result = await deposit(destinationAddress as any, mint as any, u64Amount);

  onProgress?.({ stage: 'queue-post', signature: result.queueSignature });

  // v5: the flat callbackSignature/callbackStatus/callbackElapsedMs fields were
  // collapsed into a single optional CallbackOutcome (status + optional
  // signature + elapsedMs). signature is only present on the "finalized" status.
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
