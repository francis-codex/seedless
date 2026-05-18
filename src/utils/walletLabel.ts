// Per-wallet display name storage.
//
// Each connected passkey wallet gets a default label like "Wallet 01" but the
// user can rename it. Names are scoped to the smart-wallet public key so
// every passkey-controlled wallet stays distinct in the drawer.

import * as SecureStore from 'expo-secure-store';

const PREFIX = 'lazor_wallet_label_';

function key(walletPubkey: string): string {
  // Keep the suffix short — SecureStore key length is limited on some
  // platforms. The first 24 chars of a base58 pubkey are unique enough for
  // our purposes (any collision would require an active wallet collision,
  // which is cryptographically infeasible).
  return `${PREFIX}${walletPubkey.slice(0, 24)}`;
}

export const DEFAULT_WALLET_LABEL = 'Wallet 01';

/** Read the label set for a given wallet, falling back to the default. */
export async function getWalletLabel(walletPubkey: string | null | undefined): Promise<string> {
  if (!walletPubkey) return DEFAULT_WALLET_LABEL;
  try {
    const stored = await SecureStore.getItemAsync(key(walletPubkey));
    if (stored && stored.trim().length > 0) return stored;
  } catch {
    // SecureStore failures fall through to default — non-fatal for display.
  }
  return DEFAULT_WALLET_LABEL;
}

/** Persist a new label. Trimmed and length-capped to keep the UI tidy. */
export async function setWalletLabel(walletPubkey: string, label: string): Promise<void> {
  const trimmed = label.trim().slice(0, 40);
  if (!trimmed) {
    // Empty label resets to default by clearing storage.
    await SecureStore.deleteItemAsync(key(walletPubkey)).catch(() => {});
    return;
  }
  await SecureStore.setItemAsync(key(walletPubkey), trimmed);
}
