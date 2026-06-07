import React, { useState, useEffect } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  BackHandler,
  StatusBar,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWallet, useWalletStore } from '@lazorkit/wallet-mobile-adapter';
import { addKnownWallet, hasKnownWallet } from './utils/walletList';
import { HomeScreen } from './screens/HomeScreen';
import { WalletScreen } from './screens/WalletScreen';
import { SwapScreen } from './screens/SwapScreen';
import { StealthScreen } from './screens/StealthScreen';
import { BurnerScreen } from './screens/BurnerScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AddressBookScreen } from './screens/AddressBookScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { LockOverlay } from './components/LockOverlay';
import { IncomingToast } from './components/IncomingToast';
import { armLock, consumeLockArm, isLockEnabled } from './utils/walletLock';
import { fetchTxHistory, TxRecord } from './utils/txHistory';
import * as SecureStore from 'expo-secure-store';
import { PublicKey } from '@solana/web3.js';
// UmbraDebugScreen is archived under src/screens/_archive and intentionally
// not wired into navigation. Code stays for reference / future debugging
// sessions; the user-facing private mode lives in WalletScreen's mini sheet.
// IkaScreen kept for post-mainnet demos; hidden from this build
// import { IkaScreen } from './screens/IkaScreen';
import { BottomNav, type NavTab } from './components/ui';
import { colors } from './theme';

type Screen = 'wallet' | 'swap' | 'stealth' | 'burner' | 'settings' | 'addressBook' | 'history' | 'ika';

const LAST_SEEN_SIG_KEY = 'tx_last_seen_sig';
const POLL_INTERVAL_MS = 20_000;

// Navigation state for tracking screen transitions
export type NavigationState = {
  current: Screen;
  previous: Screen | null;
};

// Default screen when wallet connects
const DEFAULT_SCREEN: Screen = 'wallet';

// AppContent - Handles navigation based on wallet connection state
// Uses the hook's isConnected state for persistence across app restarts
// When user reconnects, the session is automatically restored

export function AppContent() {
  const { isConnected, isLoading, smartWalletPubkey } = useWallet();
  const activeWallet = useWalletStore((s) => s.wallet);

  // Pre-multi-wallet users have an active LazorKit wallet but no entry in
  // our known-wallets list. Seed it once on mount so the drawer switcher
  // sees the original wallet without requiring a re-connect.
  useEffect(() => {
    if (!isConnected || !activeWallet) return;
    let cancelled = false;
    (async () => {
      const already = await hasKnownWallet(activeWallet.smartWallet);
      if (cancelled || already) return;
      await addKnownWallet(activeWallet).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [isConnected, activeWallet?.smartWallet]);
  const [currentScreen, setCurrentScreen] = useState<Screen>('wallet');
  const [locked, setLocked] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: '',
  });

  // Android back button — go back to wallet instead of exiting app
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isConnected && currentScreen !== 'wallet') {
        setCurrentScreen('wallet');
        return true; // Prevent default (exit app)
      }
      return false; // Let default behavior happen (exit app from wallet/home)
    });
    return () => handler.remove();
  }, [isConnected, currentScreen]);

  // Wallet lock: arm on background, challenge on foreground if the timeout
  // elapsed while away. No-op when the user hasn't enabled the lock in
  // settings. We never lock if the wallet isn't connected — locking the
  // HomeScreen would just confuse first-time users.
  useEffect(() => {
    if (!isConnected) return;

    // If the user toggled the lock on while in foreground, treat the
    // wallet as currently unlocked (they just authenticated to the OS to
    // turn it on). Subsequent backgrounding will arm the lock.

    const handleChange = async (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        const enabled = await isLockEnabled();
        if (enabled) await armLock();
      } else if (state === 'active') {
        const shouldChallenge = await consumeLockArm();
        if (shouldChallenge) setLocked(true);
      }
    };

    const sub = AppState.addEventListener('change', handleChange);
    return () => sub.remove();
  }, [isConnected]);

  // Incoming tx poll — diff getSignaturesForAddress against last-seen sig and
  // surface a toast when a new "receive" lands. No native push, no server.
  // Closes the loop tester E asked for ("notifications when receiving").
  // Background push requires expo-notifications + APNs/FCM + server infra
  // and is tracked as a separate task; this is the in-foreground version.
  useEffect(() => {
    if (!isConnected || !smartWalletPubkey || locked) return;
    const owner = smartWalletPubkey;
    let cancelled = false;

    const tick = async () => {
      try {
        const records = await fetchTxHistory(owner, { limit: 5 });
        if (cancelled || records.length === 0) return;
        const lastSeen = await SecureStore.getItemAsync(LAST_SEEN_SIG_KEY);
        const latest = records[0];
        if (!lastSeen) {
          // First run — seed without firing a toast, so app open doesn't
          // surface old activity as "incoming".
          await SecureStore.setItemAsync(LAST_SEEN_SIG_KEY, latest.signature);
          return;
        }
        if (latest.signature === lastSeen) return;

        // Find the newest receive in the unseen prefix.
        const unseen: TxRecord[] = [];
        for (const r of records) {
          if (r.signature === lastSeen) break;
          unseen.push(r);
        }
        const incoming = unseen.find(
          (r) => r.kind === 'receive' && r.status === 'success',
        );
        await SecureStore.setItemAsync(LAST_SEEN_SIG_KEY, latest.signature);
        if (incoming) {
          const amount = incoming.splDelta
            ? `${incoming.splDelta.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${incoming.splDelta.symbol ?? 'SPL'}`
            : `${incoming.solDelta.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
          setToast({ visible: true, message: `You received ${amount}` });
        }
      } catch {
        // Polling is best-effort. Silent on errors so we don't spam toasts
        // when the RPC blips.
      }
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isConnected, smartWalletPubkey, locked]);

  // Show loading while checking for persisted session
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loading}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <ActivityIndicator size="small" color={colors.text} />
      </SafeAreaView>
    );
  }

  if (isConnected) {
    const effectiveScreen = currentScreen;

    // BottomNav active state is derived from the current screen. Sub-screens
    // (stealth, burner, umbradebug) belong under the wallet tab — only swap
    // gets its own tab indicator.
    const navActive: NavTab =
      effectiveScreen === 'swap'
        ? 'swap'
        : effectiveScreen === 'settings' || effectiveScreen === 'addressBook'
          ? 'settings'
          : 'wallet';

    // Keep WalletScreen mounted to preserve balance state and avoid refetching
    // Other screens overlay on top — when they go back, WalletScreen is instant.
    // The BottomNav lives outside the overlay so it persists across all
    // wallet-mode screens (was the May 13 tester report about "bottom menu
    // disappearing on swap").
    return (
      <View style={styles.shell}>
        <View style={styles.screenArea}>
          <View style={{ display: effectiveScreen === 'wallet' ? 'flex' : 'none', flex: 1 }}>
            <WalletScreen
              onDisconnect={() => setCurrentScreen('wallet')}
              onSwap={() => setCurrentScreen('swap')}
              onStealth={() => setCurrentScreen('stealth')}
              onBurner={() => setCurrentScreen('burner')}
              onHistory={() => setCurrentScreen('history')}
            />
          </View>
          {effectiveScreen === 'swap' && <View style={styles.overlay}><SwapScreen onBack={() => setCurrentScreen('wallet')} /></View>}
          {effectiveScreen === 'stealth' && <View style={styles.overlay}><StealthScreen onBack={() => setCurrentScreen('wallet')} /></View>}
          {effectiveScreen === 'burner' && <View style={styles.overlay}><BurnerScreen onBack={() => setCurrentScreen('wallet')} /></View>}
          {effectiveScreen === 'settings' && <View style={styles.overlay}><SettingsScreen onBack={() => setCurrentScreen('wallet')} onOpenAddressBook={() => setCurrentScreen('addressBook')} /></View>}
          {effectiveScreen === 'addressBook' && <View style={styles.overlay}><AddressBookScreen onBack={() => setCurrentScreen('settings')} /></View>}
          {effectiveScreen === 'history' && <View style={styles.overlay}><HistoryScreen onBack={() => setCurrentScreen('wallet')} /></View>}
        </View>
        <IncomingToast
          visible={toast.visible}
          message={toast.message}
          onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
          onPress={() => setCurrentScreen('history')}
        />
        {locked && (
          <View style={styles.lockOverlay}>
            <LockOverlay onUnlock={() => setLocked(false)} />
          </View>
        )}
        <BottomNav
          active={navActive}
          onChange={(t) => {
            if (t === 'swap') setCurrentScreen('swap');
            else if (t === 'settings') setCurrentScreen('settings');
            else setCurrentScreen('wallet');
          }}
        />
      </View>
    );
  }

  return <HomeScreen onConnected={() => { }} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenArea: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 100,
  },
});

