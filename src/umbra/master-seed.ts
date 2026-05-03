// Master-seed helpers retained for backwards-compat with the UI's optional
// "passkey master seed" path. The active flow (throwaway burner signer) does
// NOT use these — the SDK derives the master seed natively from
// signer.signMessage. Kept here so a future LazorKit/ed25519 integration can
// re-introduce the passkey-bound seed without re-deriving the helpers.

import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';

export interface PasskeySignResult {
  signature: string;
  signedPayload: string;
}

export type PasskeySignFn = (canonical: string) => Promise<PasskeySignResult>;

const STORAGE_PREFIX = 'umbra_master_seed_v1_';

export async function clearCachedMasterSeed(vaultPubkey: string): Promise<void> {
  await SecureStore.deleteItemAsync(`${STORAGE_PREFIX}${vaultPubkey}`);
}

// Re-export so existing imports continue to compile; the function is a no-op
// stub for the cleared-up master-seed flow.
export function buildCanonicalMessage(vaultPubkey: string): string {
  return `umbra.privacy/master-seed/v1\nwallet:${vaultPubkey}`;
}

void Buffer; // retained for downstream consumers that re-import from this module
