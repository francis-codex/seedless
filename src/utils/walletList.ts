// Known-wallets persistence for multi-wallet support.
//
// LazorKit's useWalletStore only tracks the ACTIVE wallet — the SDK doesn't
// remember which wallets the user has previously connected on this device.
// We mirror every successful connect into SecureStore so the drawer can
// show a switcher and tap-to-activate any prior wallet without re-firing
// the portal flow.

import * as SecureStore from 'expo-secure-store';
import type { WalletInfo } from '@lazorkit/wallet-mobile-adapter';

const STORAGE_KEY = 'seedless_known_wallets_v1';

function safeParse(raw: string | null): WalletInfo[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is WalletInfo =>
        w &&
        typeof w === 'object' &&
        typeof w.smartWallet === 'string' &&
        typeof w.credentialId === 'string',
    );
  } catch {
    return [];
  }
}

/** Read every wallet this device has ever connected. Order = oldest-first. */
export async function getKnownWallets(): Promise<WalletInfo[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    return safeParse(raw);
  } catch {
    return [];
  }
}

async function writeKnownWallets(wallets: WalletInfo[]): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(wallets));
}

/**
 * Idempotent insert keyed on smartWallet pubkey. If the wallet already
 * exists we refresh the entry in-place (covers cases where credentialId
 * or device metadata rotated). The active wallet always lands at the end
 * of the list so most-recently-used floats down — drawer UI is free to
 * sort however it wants.
 */
export async function addKnownWallet(wallet: WalletInfo): Promise<void> {
  const existing = await getKnownWallets();
  const filtered = existing.filter((w) => w.smartWallet !== wallet.smartWallet);
  filtered.push(wallet);
  await writeKnownWallets(filtered);
}

/** Drop a wallet from the list. No-op if the smartWallet isn't found. */
export async function removeKnownWallet(smartWallet: string): Promise<void> {
  const existing = await getKnownWallets();
  const next = existing.filter((w) => w.smartWallet !== smartWallet);
  if (next.length === existing.length) return;
  await writeKnownWallets(next);
}

/** Nuke the entire list. Used on full sign-out flows. */
export async function clearKnownWallets(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
}

/** Convenience: is this wallet already known to the device? */
export async function hasKnownWallet(smartWallet: string): Promise<boolean> {
  const all = await getKnownWallets();
  return all.some((w) => w.smartWallet === smartWallet);
}
