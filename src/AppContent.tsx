import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, BackHandler, SafeAreaView, StatusBar } from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { HomeScreen } from './screens/HomeScreen';
import { WalletScreen } from './screens/WalletScreen';
import { SwapScreen } from './screens/SwapScreen';
import { StealthScreen } from './screens/StealthScreen';
import { BurnerScreen } from './screens/BurnerScreen';
import { AuthoritiesScreen } from './screens/AuthoritiesScreen';
import { UmbraDebugScreen } from './screens/UmbraDebugScreen';
import { IkaScreen } from './screens/IkaScreen';
import { colors, typography, spacing } from './theme';
import { Icon } from './components/ui';

type Screen = 'wallet' | 'swap' | 'stealth' | 'burner' | 'bags' | 'launch' | 'authorities' | 'umbradebug' | 'ika';

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
  const { isConnected, isLoading } = useWallet();
  const [currentScreen, setCurrentScreen] = useState<Screen>('wallet');

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

  // Show loading while checking for persisted session
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loading}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <View style={styles.loadingMark}>
          <Icon name="shield" size={32} color={colors.white} strokeWidth={2.4} />
        </View>
        <Text style={styles.loadingTitle}>Seedless</Text>
        <Text style={styles.loadingSub}>passkey wallet on Solana</Text>
        <ActivityIndicator size="small" color={colors.text} style={{ marginTop: 24 }} />
      </SafeAreaView>
    );
  }

  if (isConnected) {
    const effectiveScreen = currentScreen;

    // Keep WalletScreen mounted to preserve balance state and avoid refetching
    // Other screens overlay on top — when they go back, WalletScreen is instant
    return (
      <>
        <View style={{ display: effectiveScreen === 'wallet' ? 'flex' : 'none', flex: 1 }}>
          <WalletScreen
            onDisconnect={() => setCurrentScreen('wallet')}
            onSwap={() => setCurrentScreen('swap')}
            onStealth={() => setCurrentScreen('stealth')}
            onBurner={() => setCurrentScreen('burner')}
            onAuthorities={() => setCurrentScreen('authorities')}
            onUmbraDebug={() => setCurrentScreen('umbradebug')}
            onIka={() => setCurrentScreen('ika')}
          />
        </View>
        {effectiveScreen === 'swap' && <View style={styles.overlay}><SwapScreen onBack={() => setCurrentScreen('wallet')} /></View>}
        {effectiveScreen === 'stealth' && <View style={styles.overlay}><StealthScreen onBack={() => setCurrentScreen('wallet')} /></View>}
        {effectiveScreen === 'burner' && <View style={styles.overlay}><BurnerScreen onBack={() => setCurrentScreen('wallet')} /></View>}
        {effectiveScreen === 'authorities' && <View style={styles.overlay}><AuthoritiesScreen onBack={() => setCurrentScreen('wallet')} /></View>}
        {effectiveScreen === 'umbradebug' && <View style={styles.overlay}><UmbraDebugScreen onBack={() => setCurrentScreen('wallet')} /></View>}
        {effectiveScreen === 'ika' && <View style={styles.overlay}><IkaScreen onBack={() => setCurrentScreen('wallet')} /></View>}
      </>
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
  loadingMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  loadingTitle: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -0.8,
  },
  loadingSub: {
    ...typography.caption,
    marginTop: 4,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
});

