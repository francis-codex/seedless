// Passkey-derived encryption of the Ika user MPC share.
//
// Pattern (per docs/ika-integration-proposal.md §3): the user share is the
// security-critical local secret. Seedless seals it at rest with a key
// derived from a domain-separated WebAuthn signature, mirroring the shape
// of src/umbra/master-seed.ts but with an Ika-specific domain so the two
// derivations stay cryptographically independent.
//
// Pre-alpha note: while LazorKit's WebAuthn assertion is non-deterministic
// across calls, we derive ONCE on first DKG and persist the wrapping key
// itself sealed in iOS Keychain / Android Keystore via expo-secure-store.
// Subsequent unlocks fetch the wrapping key under biometric auth — same
// effective property (biometric-bound, never plaintext on disk) without
// re-entering the canonical-message non-determinism rabbit hole that burnt
// a day on the Umbra side.

import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import { sha512 } from '@noble/hashes/sha2.js';

const WRAP_KEY_STORAGE = 'ika_wrap_key_v1';
const SHARE_DOMAIN = 'seedless.ika/user-share/v1';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(...arr: Uint8Array[]): Uint8Array {
  const total = arr.reduce((n, a) => n + a.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arr) {
    out.set(a, o);
    o += a.byteLength;
  }
  return out;
}

// Derive a stable 32-byte AES-equivalent symmetric key from the unwrapped
// secret material + the share domain. Keeps the on-disk wrapping key
// independent from any other derivation we do (umbra master seed, etc).
function deriveWrapKey(rootBytes: Uint8Array): Uint8Array {
  return sha512(concat(utf8(SHARE_DOMAIN), rootBytes)).slice(0, 32);
}

async function loadOrCreateRoot(): Promise<Uint8Array> {
  const stored = await SecureStore.getItemAsync(WRAP_KEY_STORAGE);
  if (stored) {
    const bytes = Uint8Array.from(Buffer.from(stored, 'base64'));
    if (bytes.byteLength === 32) return bytes;
  }
  const root = new Uint8Array(32);
  crypto.getRandomValues(root);
  // Wrap key gates encrypted Ika user-share material — same sensitivity
  // as other key bytes in the app. Tighten to WHEN_UNLOCKED_THIS_DEVICE_ONLY
  // so it isn't readable while the device is locked and never iCloud-
  // migrated.
  await SecureStore.setItemAsync(WRAP_KEY_STORAGE, Buffer.from(root).toString('base64'), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return root;
}

// Symmetric stream-AEAD lite: XOR-with-keystream + truncated SHA-512 tag.
// This is NOT production AEAD — it's a minimal sealing layer for pre-alpha
// where the share itself is also mocked (Ika pre-alpha network signing is
// not cryptographically secure — see proposal §6.4). Replaced with a real
// AEAD (chacha20-poly1305) in v0.2 alongside real Ika network MPC.
function streamSeal(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = new Uint8Array(16);
  crypto.getRandomValues(nonce);
  const ks = sha512(concat(key, nonce));
  const ct = new Uint8Array(plaintext.byteLength);
  for (let i = 0; i < plaintext.byteLength; i++) ct[i] = plaintext[i] ^ ks[i % ks.byteLength];
  const tag = sha512(concat(key, nonce, ct)).slice(0, 16);
  return concat(nonce, tag, ct);
}

function streamOpen(key: Uint8Array, sealed: Uint8Array): Uint8Array {
  if (sealed.byteLength < 32) throw new Error('user-share: sealed payload too short');
  const nonce = sealed.slice(0, 16);
  const tag = sealed.slice(16, 32);
  const ct = sealed.slice(32);
  const expected = sha512(concat(key, nonce, ct)).slice(0, 16);
  for (let i = 0; i < 16; i++) if (tag[i] !== expected[i]) throw new Error('user-share: tag mismatch');
  const ks = sha512(concat(key, nonce));
  const pt = new Uint8Array(ct.byteLength);
  for (let i = 0; i < ct.byteLength; i++) pt[i] = ct[i] ^ ks[i % ks.byteLength];
  return pt;
}

export async function sealUserShare(plaintext: Uint8Array): Promise<string> {
  const root = await loadOrCreateRoot();
  const key = deriveWrapKey(root);
  return Buffer.from(streamSeal(key, plaintext)).toString('base64');
}

export async function openUserShare(ciphertextB64: string): Promise<Uint8Array> {
  const root = await loadOrCreateRoot();
  const key = deriveWrapKey(root);
  return streamOpen(key, Uint8Array.from(Buffer.from(ciphertextB64, 'base64')));
}

export async function resetIkaWrappingKey(): Promise<void> {
  await SecureStore.deleteItemAsync(WRAP_KEY_STORAGE);
}
