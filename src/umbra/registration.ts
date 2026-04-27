import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import { getPublicKeyAsync } from '@noble/ed25519';
import {
  createSignerFromPrivateKeyBytes,
  getUserRegistrationFunction,
} from '@umbra-privacy/sdk';
import type { IUmbraSigner } from '@umbra-privacy/sdk/interfaces';

import { buildUmbraClient } from './client';
import { buildMasterSeedStorage, type PasskeySignFn } from './master-seed';
import { createUserRegistrationProver } from './zk/provers/register';

const SIGNER_STORAGE_KEY = 'umbra_throwaway_signer_v1';

export type RegistrationStep =
  | 'userAccountInitialisation'
  | 'registerX25519PublicKey'
  | 'registerUserForAnonymousUsage';

export type RegistrationProgress =
  | { stage: 'signer-created'; address: string; reused: boolean }
  | { stage: 'client-built' }
  | { stage: 'prover-ready' }
  | { stage: 'registering' }
  | { stage: 'step-pre'; step: RegistrationStep }
  | { stage: 'step-post'; step: RegistrationStep; signature: string }
  | { stage: 'success'; signatures: readonly string[] };

export type ProgressCallback = (event: RegistrationProgress) => void;

export async function getStoredSignerAndClient(opts?: {
  passkeyMasterSeed?: { vaultPubkey: string; signMessage: PasskeySignFn };
}) {
  const stored = await SecureStore.getItemAsync(SIGNER_STORAGE_KEY);
  if (!stored) throw new Error('No throwaway signer in secure storage — run hello-world registration first.');
  const bytes = Uint8Array.from(Buffer.from(stored, 'base64'));
  if (bytes.byteLength !== 64) throw new Error('Stored signer key is malformed.');
  const signer: IUmbraSigner = await createSignerFromPrivateKeyBytes(bytes);
  const masterSeedStorage = opts?.passkeyMasterSeed
    ? buildMasterSeedStorage(opts.passkeyMasterSeed)
    : undefined;
  const client = await buildUmbraClient({ signer, masterSeedStorage });
  return { signer, client };
}

async function loadOrCreateSignerBytes(): Promise<{ bytes: Uint8Array; reused: boolean }> {
  const stored = await SecureStore.getItemAsync(SIGNER_STORAGE_KEY);
  if (stored) {
    const bytes = Uint8Array.from(Buffer.from(stored, 'base64'));
    if (bytes.byteLength === 64) return { bytes, reused: true };
  }
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const pub = await getPublicKeyAsync(secret);
  const bytes = new Uint8Array(64);
  bytes.set(secret, 0);
  bytes.set(pub, 32);
  await SecureStore.setItemAsync(SIGNER_STORAGE_KEY, Buffer.from(bytes).toString('base64'));
  return { bytes, reused: false };
}

export async function resetThrowawaySigner() {
  await SecureStore.deleteItemAsync(SIGNER_STORAGE_KEY);
}

function stepCallbacks(step: RegistrationStep, onProgress?: ProgressCallback) {
  return {
    pre: async () => {
      onProgress?.({ stage: 'step-pre', step });
    },
    post: async (_tx: unknown, signature: string) => {
      onProgress?.({ stage: 'step-post', step, signature });
    },
  };
}

export interface HelloWorldArgs {
  // When provided, master seed is derived from a passkey signature over a
  // canonical message and persisted in SecureStore. The encrypted balance
  // becomes bound to the user's smart wallet identity even though the on-chain
  // payer is still the throwaway Ed25519 signer.
  passkeyMasterSeed?: {
    vaultPubkey: string;
    signMessage: PasskeySignFn;
  };
}

export async function runHelloWorldRegistration(
  onProgress?: ProgressCallback,
  args?: HelloWorldArgs,
) {
  const { bytes, reused } = await loadOrCreateSignerBytes();
  const signer: IUmbraSigner = await createSignerFromPrivateKeyBytes(bytes);
  onProgress?.({ stage: 'signer-created', address: signer.address, reused });

  const masterSeedStorage = args?.passkeyMasterSeed
    ? buildMasterSeedStorage(args.passkeyMasterSeed)
    : undefined;
  const client = await buildUmbraClient({ signer, masterSeedStorage });
  onProgress?.({ stage: 'client-built' });

  const zkProver = await createUserRegistrationProver();
  onProgress?.({ stage: 'prover-ready' });

  const register = getUserRegistrationFunction({ client }, { zkProver });

  onProgress?.({ stage: 'registering' });
  const signatures = await register({
    confidential: true,
    anonymous: true,
    callbacks: {
      userAccountInitialisation: stepCallbacks('userAccountInitialisation', onProgress),
      registerX25519PublicKey: stepCallbacks('registerX25519PublicKey', onProgress),
      registerUserForAnonymousUsage: stepCallbacks('registerUserForAnonymousUsage', onProgress),
    },
  });

  onProgress?.({ stage: 'success', signatures });
  return { signer, client, signatures };
}
