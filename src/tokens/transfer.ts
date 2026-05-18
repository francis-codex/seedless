// Build transaction instructions for transferring any token in the registry.
//
// Handles:
//   - Native SOL → SystemProgram.transfer
//   - SPL tokens (USDC, SEED, etc) → spl-token TransferChecked + ATA creation
//     for the recipient if missing
//
// Returns a flat list of instructions ready to drop into a LazorKit session
// signAndSend or a passkey-prompted transferSol-equivalent.
//
// Kora compatibility: every program touched here (SystemProgram, Token, ATA)
// is whitelisted on the LazorKit paymaster, so gasless transfers work end to
// end. The ATA creation step costs ~0.002 SOL rent which Kora sponsors when
// signing the tx as fee payer.

import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';

import type { Token } from './registry';

export interface BuildTransferInput {
  /** Token being transferred (from the registry). */
  token: Token;
  /** Sender's main wallet public key (LazorKit smart wallet for our app). */
  fromOwner: PublicKey;
  /** Recipient's main wallet public key. */
  toOwner: PublicKey;
  /** Raw amount in smallest units (already scaled by token.decimals). */
  amount: bigint;
  /** Connection used to check whether the recipient already has an ATA. */
  connection: Connection;
  /** Public key that pays for the recipient ATA rent if we need to create it.
   * For gasless transfers, this is the Kora paymaster pubkey. The Kora
   * relayer rewrites the fee payer at sign time, so this can be the sender as
   * a fallback when the tx will not be sponsored. */
  ataPayer: PublicKey;
}

export interface BuildTransferResult {
  instructions: TransactionInstruction[];
  /** True if the build added an ATA-creation instruction for the recipient. */
  createsRecipientAta: boolean;
}

export async function buildTransferInstructions(
  input: BuildTransferInput,
): Promise<BuildTransferResult> {
  const { token, fromOwner, toOwner, amount, connection, ataPayer } = input;

  if (token.isNative) {
    return {
      instructions: [
        SystemProgram.transfer({
          fromPubkey: fromOwner,
          toPubkey: toOwner,
          lamports: Number(amount),
        }),
      ],
      createsRecipientAta: false,
    };
  }

  const mint = new PublicKey(token.mint);
  const fromAta = await getAssociatedTokenAddress(mint, fromOwner, true);
  const toAta = await getAssociatedTokenAddress(mint, toOwner, true);

  const instructions: TransactionInstruction[] = [];

  // Only create the recipient ATA if it doesn't already exist. Skipping this
  // when it exists is what keeps gasless transfers cheap and idempotent.
  const recipientAtaInfo = await connection.getAccountInfo(toAta);
  const createsRecipientAta = !recipientAtaInfo;
  if (createsRecipientAta) {
    instructions.push(
      createAssociatedTokenAccountInstruction(ataPayer, toAta, toOwner, mint),
    );
  }

  // Use TransferChecked over Transfer — encodes the decimals so an incorrect
  // amount fails fast on chain instead of moving the wrong-decimal value.
  instructions.push(
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      fromOwner,
      amount,
      token.decimals,
    ),
  );

  return { instructions, createsRecipientAta };
}
