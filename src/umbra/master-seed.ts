// Passkey-derived Umbra master seed + SecureStore persistence.
//
// The Umbra SDK normally generates the master seed by asking
// signer.signMessage(canonical) and hashing the result. LazorKit's smart
// wallet does not implement Ed25519 message signing — it signs via secp256r1
// passkey + WebAuthn. We bridge by overriding `masterSeedStorage.generate`
// on the Umbra client (the escape hatch Cal documented in the Apr 27 TG dump
// — see memory: umbra_devnet_constraints_apr27.md).
//
// Stability: WebAuthn passkey ECDSA is not guaranteed to be deterministic.
// We derive ONCE per (device, smart wallet) and persist the resulting
// 64-byte MasterSeed in SecureStore. Subsequent runs read from cache. Losing
// the SecureStore entry == losing access to the encrypted balance until
// Umbra ships a recovery flow.
//
// Plan reference: docs/umbra-integration-plan.md §5.3 (the escape hatch).

import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import { keccak_512 } from '@noble/hashes/sha3';
import { assertMasterSeed, type MasterSeed } from '@umbra-privacy/sdk/types';
import type { GetUmbraClientDeps } from '@umbra-privacy/sdk';

// SecureStore on iOS only accepts alphanumeric + . - _ in keys.
const STORAGE_PREFIX = 'umbra_master_seed_v1_';
const CANONICAL_DOMAIN = 'umbra.privacy/master-seed/v1';

export interface PasskeySignResult {
  signature: string;       // base64 WebAuthn signature
  signedPayload: string;   // base64 / serialized WebAuthn payload
}

export type PasskeySignFn = (canonical: string) => Promise<PasskeySignResult>;

export function buildCanonicalMessage(vaultPubkey: string): string {
  return `${CANONICAL_DOMAIN}\nwallet:${vaultPubkey}`;
}

function storageKey(vaultPubkey: string): string {
  return `${STORAGE_PREFIX}${vaultPubkey}`;
}

async function loadCachedSeed(vaultPubkey: string): Promise<MasterSeed | null> {
  const cached = await SecureStore.getItemAsync(storageKey(vaultPubkey));
  if (!cached) return null;
  const bytes = Uint8Array.from(Buffer.from(cached, 'base64'));
  if (bytes.byteLength !== 64) return null;
  assertMasterSeed(bytes);
  return bytes;
}

async function persistSeed(vaultPubkey: string, seed: MasterSeed): Promise<void> {
  await SecureStore.setItemAsync(
    storageKey(vaultPubkey),
    Buffer.from(seed).toString('base64'),
  );
}

export async function clearCachedMasterSeed(vaultPubkey: string): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey(vaultPubkey));
}

export interface DeriveArgs {
  vaultPubkey: string;
  signMessage: PasskeySignFn;
}

export async function getOrCreateMasterSeed({ vaultPubkey, signMessage }: DeriveArgs): Promise<MasterSeed> {
  const cached = await loadCachedSeed(vaultPubkey);
  if (cached) return cached;

  const canonical = buildCanonicalMessage(vaultPubkey);
  const result = await signMessage(canonical);

  // Derive 64-byte MasterSeed via Keccak-512 over (sig || payload || canonical).
  // Including canonical fixes domain separation; including payload binds to
  // the exact WebAuthn challenge the passkey saw; including signature provides
  // entropy from the passkey's ECDSA nonce.
  const sigBytes = Buffer.from(result.signature, 'base64');
  const payloadBytes = Buffer.from(result.signedPayload, 'base64');
  const domainBytes = Buffer.from(canonical, 'utf8');

  const concat = new Uint8Array(sigBytes.byteLength + payloadBytes.byteLength + domainBytes.byteLength);
  concat.set(sigBytes, 0);
  concat.set(payloadBytes, sigBytes.byteLength);
  concat.set(domainBytes, sigBytes.byteLength + payloadBytes.byteLength);

  const seed = keccak_512(concat) as Uint8Array;
  assertMasterSeed(seed);
  await persistSeed(vaultPubkey, seed as MasterSeed);
  return seed as MasterSeed;
}

// Builds a `masterSeedStorage` deps object for `getUmbraClient` that bypasses
// signer.signMessage entirely. Load reads from SecureStore; generate triggers
// a passkey signature on first use; store is a no-op since generate already
// persists.
export function buildMasterSeedStorage({ vaultPubkey, signMessage }: DeriveArgs): NonNullable<GetUmbraClientDeps['masterSeedStorage']> {
  return {
    load: async () => {
      const seed = await loadCachedSeed(vaultPubkey);
      return seed ? { exists: true, seed } : { exists: false };
    },
    store: async (seed: MasterSeed) => {
      try {
        await persistSeed(vaultPubkey, seed);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: String(err?.message ?? err) };
      }
    },
    generate: async () => {
      return getOrCreateMasterSeed({ vaultPubkey, signMessage });
    },
  };
}
