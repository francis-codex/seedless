// ATA → ETA: shield public balance into an Encrypted Token Account.
// Plan reference: docs/umbra-integration-plan.md §6.3
//
// Devnet caveat (Apr 27 2026, per Umbra TG): only WSOL mint is supported on devnet.
// Pass mint = SOL_MINT (So11111111111111111111111111111111111111112) — the SDK
// auto-wraps native devnet SOL behind the scenes.

import { getPublicBalanceToEncryptedBalanceDirectDepositorFunction } from '@umbra-privacy/sdk';
import { createOptionalData32, createU64 } from '@umbra-privacy/sdk/utils';
import type { DepositResult, IUmbraClient } from '@umbra-privacy/sdk/interfaces';

export interface DepositArgs {
  client: IUmbraClient;
  destinationAddress: string;
  mint: string;
  amount: bigint;
  optionalData?: Uint8Array;
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
  const { client, destinationAddress, mint, amount, optionalData } = args;

  onProgress?.({ stage: 'building' });
  const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });

  const u64Amount = createU64(amount, 'depositAmount');
  const opt = optionalData ? createOptionalData32(optionalData) : undefined;

  onProgress?.({ stage: 'queue-pre' });
  const result = await deposit(
    destinationAddress as any,
    mint as any,
    u64Amount,
    opt ? { optionalData: opt } : undefined,
  );

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
