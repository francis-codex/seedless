// Multi-wallet state hook.
//
// Wraps the SecureStore list and exposes:
//   - the rehydrated list of known wallets (oldest-first)
//   - which entry is currently active (matched against LazorKit's store)
//   - actions: refresh, switchTo, forget
//
// Add-wallet is intentionally NOT here — the connect() call lives on the
// screen so the redirect URL + biometric error mapping stays co-located
// with the rest of the connect flow. After a successful connect, screens
// should call refresh() to pick up the new entry.

import { useCallback, useEffect, useState } from 'react';
import {
  useWallet,
  useWalletStore,
  type WalletInfo,
} from '@lazorkit/wallet-mobile-adapter';
import {
  addKnownWallet,
  getKnownWallets,
  removeKnownWallet,
} from '../utils/walletList';

export interface KnownWalletsState {
  /** All wallets this device has ever connected. Oldest-first. */
  wallets: WalletInfo[];
  /** smartWallet pubkey of the currently active wallet, or null. */
  activeSmartWallet: string | null;
  /** Reload the list from SecureStore. Call after a successful connect. */
  refresh: () => Promise<void>;
  /** Activate a previously connected wallet without firing the portal. */
  switchTo: (wallet: WalletInfo) => void;
  /** Drop a wallet from the known list. If it's active, also disconnect. */
  forget: (smartWallet: string) => Promise<void>;
  /** Persist a freshly connected wallet. Idempotent. */
  remember: (wallet: WalletInfo) => Promise<void>;
}

export function useKnownWallets(): KnownWalletsState {
  const { smartWalletPubkey } = useWallet();
  const setWallet = useWalletStore((s) => s.setWallet);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);

  const refresh = useCallback(async () => {
    const list = await getKnownWallets();
    setWallets(list);
  }, []);

  // Hydrate on mount + whenever the active wallet changes, so the drawer
  // reflects any wallet that was just added via a connect() flow without
  // the caller needing to remember to refresh.
  useEffect(() => {
    refresh();
  }, [refresh, smartWalletPubkey?.toBase58()]);

  const switchTo = useCallback(
    (wallet: WalletInfo) => {
      // SDK's setWallet hot-swaps the active wallet without going through
      // the portal. The caller is responsible for clearing any
      // wallet-scoped session/cache state — see WalletScreen.tsx.
      setWallet(wallet);
    },
    [setWallet],
  );

  const remember = useCallback(
    async (wallet: WalletInfo) => {
      await addKnownWallet(wallet);
      await refresh();
    },
    [refresh],
  );

  const forget = useCallback(
    async (smartWallet: string) => {
      await removeKnownWallet(smartWallet);
      await refresh();
    },
    [refresh],
  );

  return {
    wallets,
    activeSmartWallet: smartWalletPubkey?.toBase58() ?? null,
    refresh,
    switchTo,
    forget,
    remember,
  };
}
