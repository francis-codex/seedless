import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { armLock, clearLockArm, consumeLockArm, isLockEnabled } from './utils/walletLock';
import { fetchLatestSignature, fetchTxHistory, TxRecord } from './utils/txHistory';
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

const LAST_SEEN_SIG_KEY_PREFIX = 'tx_last_seen_sig:';
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
  const [toast, setToast] = useState<{ visible: boolean; message: string; title?: string; iconName?: 'arrowDown' | 'check' | 'swap' }>({
    visible: false,
    message: '',
  });

  // Trigger a success/info toast from any child screen. Mirrors the
  // incoming-receive toast so send + swap confirmations live in the same
  // banner instead of OS Alert dialogs.
  const showToast = useCallback((title: string, message: string, iconName: 'check' | 'swap' = 'check') => {
    setToast({ visible: true, message, title, iconName });
  }, []);

  // Memoized navigation callbacks. Inline arrow functions in JSX props
  // give every WalletScreen render a fresh prop identity, which torpedoes
  // any downstream React.memo / useCallback. Stable refs here mean the
  // wallet tree re-renders only when its own state changes.
  const goWallet = useCallback(() => setCurrentScreen('wallet'), []);
  const goSwap = useCallback(() => setCurrentScreen('swap'), []);
  const goStealth = useCallback(() => setCurrentScreen('stealth'), []);
  const goBurner = useCallback(() => setCurrentScreen('burner'), []);
  const goHistory = useCallback(() => setCurrentScreen('history'), []);
  const goSettings = useCallback(() => setCurrentScreen('settings'), []);
  const goAddressBook = useCallback(() => setCurrentScreen('addressBook'), []);
  const handleUserRefresh = useCallback(() => {
    if (tickRef.current) tickRef.current();
  }, []);
  const handleToastDismiss = useCallback(() => {
    setToast((t) => ({ ...t, visible: false }));
  }, []);
  const handleToastPress = goHistory;
  const handleLockUnlock = useCallback(async () => {
    await clearLockArm();
    setLocked(false);
  }, []);
  const handleBottomNavChange = useCallback((t: NavTab) => {
    if (t === 'swap') setCurrentScreen('swap');
    else if (t === 'settings') setCurrentScreen('settings');
    else setCurrentScreen('wallet');
  }, []);
  // Bump each time an incoming receive is detected so WalletScreen can
  // refetch balances and flip out of the cold-wallet empty state.
  const [incomingNonce, setIncomingNonce] = useState(0);
  // Holds the current poll tick fn so WalletScreen can trigger it on pull-
  // to-refresh. Without this, toast lagged balance update by up to 20s
  // (poll interval) — user saw balance change, toast fired much later.
  const tickRef = useRef<(() => Promise<void>) | null>(null);
  // Tracks the most recent time a screen kicked off a portal/passkey flow
  // (LazorKit's portal.lazor.sh opens in an external browser/webview, which
  // looks like the app backgrounding). The lock effect uses this to skip
  // arm + challenge during that window so testers don't see a second
  // biometric prompt on top of the LazorKit one. Cleared after 60s.
  const portalFlowStartedAt = useRef<number | null>(null);
  const markPortalFlow = useCallback(() => {
    portalFlowStartedAt.current = Date.now();
  }, []);
  const isInPortalFlow = useCallback(() => {
    const t = portalFlowStartedAt.current;
    if (t == null) return false;
    if (Date.now() - t > 60_000) {
      portalFlowStartedAt.current = null;
      return false;
    }
    return true;
  }, []);

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

    // Initial-mount check. If the app was force-quit while the lock was
    // armed (e.g. tester canceled the biometric prompt then killed the
    // app — the bypass we patched Jun 22), the armed key survives because
    // consumeLockArm no longer deletes it. We re-evaluate on every mount
    // so a cold-start after a cancel still challenges the user.
    let cancelled = false;
    (async () => {
      const shouldChallenge = await consumeLockArm();
      if (!cancelled && shouldChallenge) setLocked(true);
    })();

    const handleChange = async (state: AppStateStatus) => {
      // Skip lock arm + challenge while a portal/passkey flow is in
      // progress — the LazorKit redirect looks like backgrounding and
      // would otherwise drop a second biometric on top of the passkey
      // prompt (tester report Jun 23).
      if (isInPortalFlow()) return;
      if (state === 'background' || state === 'inactive') {
        const enabled = await isLockEnabled();
        if (enabled) await armLock();
      } else if (state === 'active') {
        const shouldChallenge = await consumeLockArm();
        if (shouldChallenge) setLocked(true);
      }
    };

    const sub = AppState.addEventListener('change', handleChange);
    return () => { cancelled = true; sub.remove(); };
  }, [isConnected]);

  // Incoming tx poll — diff getSignaturesForAddress against last-seen sig and
  // surface a toast when a new "receive" lands. No native push, no server.
  // Closes the loop tester E asked for ("notifications when receiving").
  // Background push requires expo-notifications + APNs/FCM + server infra
  // and is tracked as a separate task; this is the in-foreground version.
  useEffect(() => {
    if (!isConnected || !smartWalletPubkey || locked) return;
    const owner = smartWalletPubkey;
    // Per-wallet key so switching wallets doesn't surface another wallet's
    // last-seen sig as "new" for this one. Multi-wallet bug surfaced Jun 22.
    const lastSeenKey = `${LAST_SEEN_SIG_KEY_PREFIX}${owner.toBase58()}`;
    let cancelled = false;

    const tick = async () => {
      try {
        // Cheap probe first: just the latest signature. Skips the heavy
        // parsed-tx call when nothing has changed since lastSeen, which is
        // the common case and was the source of Alchemy 429s (we were
        // parsing 5 sigs every 20s for no reason).
        const latestSig = await fetchLatestSignature(owner);
        if (cancelled || !latestSig) return;
        const lastSeen = await SecureStore.getItemAsync(lastSeenKey);
        if (!lastSeen) {
          // First run — seed without firing a toast, so app open doesn't
          // surface old activity as "incoming".
          await SecureStore.setItemAsync(lastSeenKey, latestSig);
          return;
        }
        if (latestSig === lastSeen) return;

        // Something new — now pay for the parsed-tx fetch to classify it.
        const records = await fetchTxHistory(owner, { limit: 5 });
        if (cancelled || records.length === 0) return;

        // Find the newest receive in the unseen prefix.
        const unseen: TxRecord[] = [];
        for (const r of records) {
          if (r.signature === lastSeen) break;
          unseen.push(r);
        }
        const incoming = unseen.find(
          (r) => r.kind === 'receive' && r.status === 'success',
        );
        await SecureStore.setItemAsync(lastSeenKey, records[0].signature);
        if (incoming) {
          const amount = incoming.splDelta
            ? `${incoming.splDelta.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${incoming.splDelta.symbol ?? 'SPL'}`
            : `${incoming.solDelta.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL`;
          setToast({ visible: true, message: `You received ${amount}` });
          setIncomingNonce((n) => n + 1);
        }
      } catch {
        // Polling is best-effort. Silent on errors so we don't spam toasts
        // when the RPC blips.
      }
    };

    tickRef.current = tick;
    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      tickRef.current = null;
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
              onDisconnect={goWallet}
              onSwap={goSwap}
              onStealth={goStealth}
              onBurner={goBurner}
              onHistory={goHistory}
              incomingNonce={incomingNonce}
              onUserRefresh={handleUserRefresh}
              onShowToast={showToast}
              onPortalFlow={markPortalFlow}
            />
          </View>
          {effectiveScreen === 'swap' && <View style={styles.overlay}><SwapScreen onBack={goWallet} onShowToast={showToast} onPortalFlow={markPortalFlow} /></View>}
          {effectiveScreen === 'stealth' && <View style={styles.overlay}><StealthScreen onBack={goWallet} /></View>}
          {effectiveScreen === 'burner' && <View style={styles.overlay}><BurnerScreen onBack={goWallet} /></View>}
          {effectiveScreen === 'settings' && <View style={styles.overlay}><SettingsScreen onBack={goWallet} onOpenAddressBook={goAddressBook} /></View>}
          {effectiveScreen === 'addressBook' && <View style={styles.overlay}><AddressBookScreen onBack={goSettings} /></View>}
          {effectiveScreen === 'history' && <View style={styles.overlay}><HistoryScreen onBack={goWallet} /></View>}
        </View>
        <IncomingToast
          visible={toast.visible}
          message={toast.message}
          title={toast.title}
          iconName={toast.iconName}
          onDismiss={handleToastDismiss}
          onPress={handleToastPress}
        />
        {locked && (
          <View style={styles.lockOverlay}>
            <LockOverlay onUnlock={handleLockUnlock} />
          </View>
        )}
        <BottomNav
          active={navActive}
          onChange={handleBottomNavChange}
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

