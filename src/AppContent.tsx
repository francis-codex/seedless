import React, { useState, useEffect } from 'react';
import {
  View,
  ActivityIndicator,
  StyleSheet,
  BackHandler,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { HomeScreen } from './screens/HomeScreen';
import { WalletScreen } from './screens/WalletScreen';
import { SwapScreen } from './screens/SwapScreen';
import { StealthScreen } from './screens/StealthScreen';
import { BurnerScreen } from './screens/BurnerScreen';
import { UmbraDebugScreen } from './screens/UmbraDebugScreen';
// IkaScreen kept for post-mainnet demos; hidden from this build
// import { IkaScreen } from './screens/IkaScreen';
import { colors } from './theme';

type Screen = 'wallet' | 'swap' | 'stealth' | 'burner' | 'umbradebug' | 'ika';

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
        <ActivityIndicator size="small" color={colors.text} />
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
            onUmbraDebug={() => setCurrentScreen('umbradebug')}
          />
        </View>
        {effectiveScreen === 'swap' && <View style={styles.overlay}><SwapScreen onBack={() => setCurrentScreen('wallet')} /></View>}
        {effectiveScreen === 'stealth' && <View style={styles.overlay}><StealthScreen onBack={() => setCurrentScreen('wallet')} /></View>}
        {effectiveScreen === 'burner' && <View style={styles.overlay}><BurnerScreen onBack={() => setCurrentScreen('wallet')} /></View>}
        {effectiveScreen === 'umbradebug' && <View style={styles.overlay}><UmbraDebugScreen onBack={() => setCurrentScreen('wallet')} /></View>}
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
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
  },
});

