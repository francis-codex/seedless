// Burner ↔ Umbra bridge: makes a burner Ed25519 keypair the on-chain Umbra
// signer + derives a deterministic master seed from the burner key.
//
// Why this exists (Phase 4):
// - Burners already are Ed25519 keypairs, so they slot into IUmbraSigner
//   natively via createSignerFromPrivateKeyBytes — no LazorKit gymnastics.
// - Each burner's encrypted balance is fully self-contained: master seed is
//   Keccak-512 over (burnerSecretKey || domain). Reproducible from the
//   burner key alone; no passkey involved.
// - First private send lazily registers the burner with Umbra (3-tx
//   register flow). Subsequent sends just create UTXOs.
//
// Plan reference: docs/umbra-integration-plan.md §6 (private send flow).
//
// Devnet caveat: WSOL only. The SDK auto-wraps native devnet SOL when you
// pass SOL_MINT.

import { Buffer } from 'buffer';
import { keccak_512 } from '@noble/hashes/sha3';
import {
  createSignerFromPrivateKeyBytes,
  getUserRegistrationFunction,
} from '@umbra-privacy/sdk';
import type { IUmbraSigner } from '@umbra-privacy/sdk/interfaces';
import { assertMasterSeed, type MasterSeed } from '@umbra-privacy/sdk/types';

import { LAMPORTS_PER_SOL } from '@solana/web3.js';

import { buildUmbraClient } from './client';
import {
  checkRecipientUmbraStatus,
  createReceiverClaimableFromPublicBalance,
} from './utxo';
import { createUserRegistrationProver } from './zk/provers/register';
import { getBurnerKeypair, sendFromBurner } from '../utils/burner';
import { UMBRA_TEST_MINT_DEVNET } from '../constants';

const BURNER_SEED_DOMAIN = 'umbra.privacy/burner-master-seed/v1';

function deriveBurnerMasterSeed(burnerSecretKey: Uint8Array): MasterSeed {
  const domain = Buffer.from(BURNER_SEED_DOMAIN, 'utf8');
  const concat = new Uint8Array(burnerSecretKey.byteLength + domain.byteLength);
  concat.set(burnerSecretKey, 0);
  concat.set(domain, burnerSecretKey.byteLength);
  const seed = keccak_512(concat) as Uint8Array;
  assertMasterSeed(seed);
  return seed as MasterSeed;
}

function buildBurnerMasterSeedStorage(burnerSecretKey: Uint8Array) {
  const seed = deriveBurnerMasterSeed(burnerSecretKey);
  return {
    load: async () => ({ exists: true as const, seed }),
    store: async () => ({ success: true as const }),
    generate: async () => seed,
  };
}

async function buildBurnerSignerAndClient(burnerId: string) {
  const keypair = await getBurnerKeypair(burnerId);
  if (!keypair) throw new Error(`Burner ${burnerId} not found in secure storage.`);
  const signer: IUmbraSigner = await createSignerFromPrivateKeyBytes(keypair.secretKey);
  const masterSeedStorage = buildBurnerMasterSeedStorage(keypair.secretKey);
  const client = await buildUmbraClient({ signer, masterSeedStorage });
  return { keypair, signer, client };
}

export type PrivateSendStage =
  | 'preparing'
  | 'checking-recipient'
  | 'registering-burner'
  | 'register-step'
  | 'creating-utxo'
  | 'fallback-burner-transfer'
  | 'success';

export type PrivateSendMode = 'umbra-encrypted' | 'burner-fallback';

export interface PrivateSendProgress {
  stage: PrivateSendStage;
  detail?: string;
  signature?: string;
  mode?: PrivateSendMode;
}

// Why a degraded send happens — surfaced to the caller so the UI can decide
// how loudly to ask for consent. RPC failures are scarier than a confirmed
// "recipient unregistered" because they could mean we got it wrong.
export type DegradationReason =
  | 'recipient-unregistered-confirmed' // pre-flight succeeded; recipient definitely lacks X25519 key
  | 'recipient-unregistered-from-sdk'  // pre-flight was unknown; SDK rejected with receiver-not-registered
  | 'pre-flight-rpc-error';            // pre-flight RPC itself failed; recipient status truly unknown

export interface DegradationContext {
  reason: DegradationReason;
  recipient: string;
  amountLamports: bigint;
  rpcErrorDetail?: string;
}

// Caller decides whether to permit a privacy degradation. Returning false
// aborts the send. Default policy (when not provided): never degrade.
//
// MAINNET-CRITICAL: when this fires, the chosen alternative is a plain SOL
// transfer that publishes the amount on chain. The UI MUST prompt the user
// before consenting on real funds.
export type DegradationConsentFn = (ctx: DegradationContext) => Promise<boolean>;

export interface PrivateSendArgs {
  burnerId: string;
  destinationAddress: string;
  amountLamports: bigint;
  mint?: string;
  onDegradationRequested?: DegradationConsentFn;
}

export interface PrivateSendResult {
  mode: PrivateSendMode;
  burnerAddress: string;
  destinationAddress: string;
  registrationSignatures: string[];
  createSignature?: string;
  fallbackSignature?: string;
}

// Idempotent registration — re-running on an already-registered signer is
// safe; the SDK skips steps whose on-chain state already exists.
async function ensureBurnerRegistered(
  client: Awaited<ReturnType<typeof buildBurnerSignerAndClient>>['client'],
  onProgress?: (e: PrivateSendProgress) => void,
): Promise<string[]> {
  onProgress?.({ stage: 'registering-burner' });
  const zkProver = await createUserRegistrationProver();
  const register = getUserRegistrationFunction({ client }, { zkProver });
  const signatures = await register({
    confidential: true,
    anonymous: false, // private send only needs confidential mode (X25519 key)
    callbacks: {
      userAccountInitialisation: {
        pre: async () => onProgress?.({ stage: 'register-step', detail: '1/2 user account init' }),
        post: async (_tx, signature) => onProgress?.({
          stage: 'register-step', detail: '1/2 user account init confirmed', signature,
        }),
      },
      registerX25519PublicKey: {
        pre: async () => onProgress?.({ stage: 'register-step', detail: '2/2 X25519 confidential key' }),
        post: async (_tx, signature) => onProgress?.({
          stage: 'register-step', detail: '2/2 X25519 confidential key confirmed', signature,
        }),
      },
    },
  });
  return [...signatures];
}

export class PrivateSendDegradationDeclined extends Error {
  constructor(public readonly context: DegradationContext) {
    super(`Private send aborted: user declined fallback (${context.reason}).`);
    this.name = 'PrivateSendDegradationDeclined';
  }
}

export async function privateSendFromBurner(
  args: PrivateSendArgs,
  onProgress?: (e: PrivateSendProgress) => void,
): Promise<PrivateSendResult> {
  const { burnerId, destinationAddress, amountLamports, onDegradationRequested } = args;
  const mint = args.mint ?? UMBRA_TEST_MINT_DEVNET;

  onProgress?.({ stage: 'preparing' });
  const { keypair, client } = await buildBurnerSignerAndClient(burnerId);

  onProgress?.({ stage: 'checking-recipient' });
  const recipientStatus = await checkRecipientUmbraStatus(client, destinationAddress);

  // Degradation gate — every path that demotes encrypted → plain MUST go
  // through here. Default policy is "abort," not "silently degrade."
  // Mainnet-critical: a private send must never become a public transfer
  // without the user explicitly consenting on this exact attempt.
  const requestDegradationConsent = async (reason: DegradationReason): Promise<void> => {
    const ctx: DegradationContext = {
      reason,
      recipient: destinationAddress,
      amountLamports,
      rpcErrorDetail: recipientStatus.unknown ? recipientStatus.unknownReason : undefined,
    };
    const consented = onDegradationRequested ? await onDegradationRequested(ctx) : false;
    if (!consented) throw new PrivateSendDegradationDeclined(ctx);
  };

  const fallbackToBurnerTransfer = async (): Promise<PrivateSendResult> => {
    onProgress?.({ stage: 'fallback-burner-transfer', mode: 'burner-fallback' });
    const amountSol = Number(amountLamports) / LAMPORTS_PER_SOL;
    const fallbackSignature = await sendFromBurner(burnerId, destinationAddress, amountSol);
    onProgress?.({ stage: 'success', signature: fallbackSignature, mode: 'burner-fallback' });
    return {
      mode: 'burner-fallback',
      burnerAddress: keypair.publicKey.toBase58(),
      destinationAddress,
      registrationSignatures: [],
      fallbackSignature,
    };
  };

  if (!recipientStatus.unknown && !recipientStatus.hasX25519) {
    await requestDegradationConsent('recipient-unregistered-confirmed');
    return fallbackToBurnerTransfer();
  }

  // Pre-flight register the sender (burner). The SDK throws a generic
  // "Transaction simulation failed" when the signer's user account doesn't
  // exist on chain — too vague to distinguish from real failures, so we
  // ensure registration up-front instead of guessing from error messages.
  // ensureBurnerRegistered is idempotent; the SDK skips already-confirmed
  // steps so re-running is cheap.
  let registrationSignatures: string[] = [];
  const senderStatus = await checkRecipientUmbraStatus(client, keypair.publicKey.toBase58());
  if (!senderStatus.hasX25519) {
    registrationSignatures = await ensureBurnerRegistered(client, onProgress);
  }

  // Recipient is Umbra-registered → encrypted-UTXO path.
  let createResult: any;
  try {
    onProgress?.({ stage: 'creating-utxo', mode: 'umbra-encrypted' });
    createResult = await createReceiverClaimableFromPublicBalance({
      client,
      destinationAddress,
      mint,
      amount: amountLamports,
    });
  } catch (err: any) {
    const rawMessage = String(err?.message ?? err);
    const message = rawMessage.toLowerCase();
    const isReceiverProblem = message.includes('receiver is not registered')
      || message.includes('receiver not registered');
    if (isReceiverProblem) {
      const reason: DegradationReason = recipientStatus.unknown
        ? 'pre-flight-rpc-error'
        : 'recipient-unregistered-from-sdk';
      await requestDegradationConsent(reason);
      return fallbackToBurnerTransfer();
    }
    throw err;
  }

  const createSignature = createResult?.signature ?? createResult?.queueSignature;
  onProgress?.({ stage: 'success', signature: createSignature, mode: 'umbra-encrypted' });

  return {
    mode: 'umbra-encrypted',
    burnerAddress: keypair.publicKey.toBase58(),
    destinationAddress,
    registrationSignatures,
    createSignature,
  };
}
