// Private send originating from the main wallet's Umbra signer.
//
// Mirrors burner-bridge.privateSendFromBurner but the sender is the user's
// throwaway Ed25519 signer (one per device, stored in SecureStore) instead
// of a burner keypair. The recipient still follows the encrypted-UTXO path:
// `createReceiverClaimableFromPublicBalance` shifts SOL from the signer's
// encrypted balance into a UTXO addressable by the recipient's X25519 key.
//
// Degradation policy: if the recipient isn't registered with Umbra, we ask
// the caller (UI) to confirm a fallback. Unlike the burner flow, there is
// NO automatic public-send fallback here — the caller decides what to do
// instead. For MVP we throw `PrivateSendDegradationDeclined` and let the UI
// either abort or route the send through the normal public flow.

import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import type { IUmbraClient } from '@umbra-privacy/sdk';

import { SOL_MINT } from '../constants';
import { checkRecipientUmbraStatus, createReceiverClaimableFromPublicBalance } from './utxo';

export type PrivateSendFromMainDegradationReason =
  | 'recipient-unregistered-confirmed'
  | 'recipient-unregistered-from-sdk'
  | 'pre-flight-rpc-error';

export interface PrivateSendFromMainDegradationContext {
  reason: PrivateSendFromMainDegradationReason;
  recipient: string;
  amountLamports: bigint;
}

export type PrivateSendFromMainDegradationConsentFn = (
  ctx: PrivateSendFromMainDegradationContext,
) => Promise<boolean>;

export class PrivateSendFromMainDeclined extends Error {
  constructor(public readonly context: PrivateSendFromMainDegradationContext) {
    super(`Private send aborted: recipient unregistered + user declined fallback (${context.reason}).`);
    this.name = 'PrivateSendFromMainDeclined';
  }
}

export interface PrivateSendFromMainArgs {
  client: IUmbraClient;
  signerAddress: string;
  destinationAddress: string;
  amountLamports: bigint;
  mint?: string;
  onDegradationRequested?: (info: { reason: string; recipient: string }) => Promise<boolean>;
}

export interface PrivateSendFromMainResult {
  mode: 'umbra-encrypted' | 'fallback-public';
  signature: string;
}

export async function privateSendFromMain(
  args: PrivateSendFromMainArgs,
): Promise<PrivateSendFromMainResult> {
  const { client, destinationAddress, amountLamports, onDegradationRequested } = args;
  const mint = args.mint ?? SOL_MINT;

  // Validate the destination is a real Solana address before doing any RPC
  // work. Without this, a typo'd address would silently hit the recipient
  // registration check, fall through to the unknown-recipient degradation
  // prompt, and confuse the user into thinking a real wallet just isn't
  // registered with umbra.
  try {
    // PublicKey constructor throws on invalid base58 / wrong byte length.
    new PublicKey(destinationAddress);
  } catch {
    throw new Error('Invalid recipient address. Double-check the address and try again.');
  }

  // 1. Recipient registration check
  const recipientStatus = await checkRecipientUmbraStatus(client, destinationAddress);

  const askDegradation = async (reason: PrivateSendFromMainDegradationReason) => {
    const ctx: PrivateSendFromMainDegradationContext = {
      reason,
      recipient: destinationAddress,
      amountLamports,
    };
    const consented = onDegradationRequested
      ? await onDegradationRequested({ reason, recipient: destinationAddress })
      : false;
    if (!consented) throw new PrivateSendFromMainDeclined(ctx);
  };

  if (recipientStatus.unknown) {
    // Pre-flight RPC failed — refuse to proceed silently. The caller's UI
    // should surface a "we can't verify recipient is private — send anyway?"
    // prompt before we route this through a public transfer.
    await askDegradation('pre-flight-rpc-error');
    // If consent given, the caller is responsible for the public-fallback
    // route. We return a sentinel so the caller knows the encrypted path
    // was NOT taken.
    return { mode: 'fallback-public', signature: '' };
  }
  if (!recipientStatus.hasX25519) {
    await askDegradation('recipient-unregistered-confirmed');
    return { mode: 'fallback-public', signature: '' };
  }

  // 2. Recipient is registered → encrypted UTXO path
  try {
    const result = await createReceiverClaimableFromPublicBalance({
      client,
      destinationAddress,
      mint,
      amount: amountLamports,
    });
    const sig: string =
      (result as any)?.signature ?? (result as any)?.queueSignature ?? '';
    return { mode: 'umbra-encrypted', signature: sig };
  } catch (err: any) {
    const rawMessage = String(err?.message ?? err).toLowerCase();
    const isReceiverProblem =
      rawMessage.includes('receiver is not registered') || rawMessage.includes('receiver not registered');
    if (isReceiverProblem) {
      await askDegradation('recipient-unregistered-from-sdk');
      return { mode: 'fallback-public', signature: '' };
    }
    throw err;
  }
}

// Helper: format lamports → SOL display number with sane precision for UI.
export function lamportsToSolDisplay(lamports: bigint, fractionDigits = 4): string {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(fractionDigits);
}
