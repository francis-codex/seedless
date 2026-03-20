import React, { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { HomeScreen } from './screens/HomeScreen';
import { WalletScreen } from './screens/WalletScreen';
import { SwapScreen } from './screens/SwapScreen';
import { StealthScreen } from './screens/StealthScreen';
import { BurnerScreen } from './screens/BurnerScreen';
import { BagsScreen } from './screens/BagsScreen';
import { LaunchScreen } from './screens/LaunchScreen';
import { IS_DEVNET } from './constants';

type Screen = 'wallet' | 'swap' | 'stealth' | 'burner' | 'bags' | 'launch';

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

  // Show loading while checking for persisted session
  if (isLoading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingTitle}>Seedless</Text>
        <ActivityIndicator size="small" color="#000" style={{ marginTop: 16 }} />
      </View>
    );
  }

  if (isConnected) {
    // Determine effective screen — block mainnet-only screens on devnet
    const effectiveScreen = (IS_DEVNET && (currentScreen === 'swap' || currentScreen === 'bags' || currentScreen === 'launch'))
      ? 'wallet'
      : currentScreen;

    switch (effectiveScreen) {
      case 'swap':
        return <SwapScreen onBack={() => setCurrentScreen('wallet')} />;
      case 'stealth':
        return <StealthScreen onBack={() => setCurrentScreen('wallet')} />;
      case 'burner':
        return <BurnerScreen onBack={() => setCurrentScreen('wallet')} />;
      case 'bags':
        return <BagsScreen onBack={() => setCurrentScreen('wallet')} />;
      case 'launch':
        return <LaunchScreen onBack={() => setCurrentScreen('wallet')} />;
      default:
        return (
          <WalletScreen
            onDisconnect={() => setCurrentScreen('wallet')}
            onSwap={() => setCurrentScreen('swap')}
            onStealth={() => setCurrentScreen('stealth')}
            onBurner={() => setCurrentScreen('burner')}
            onBags={() => setCurrentScreen('bags')}
            onLaunch={() => setCurrentScreen('launch')}
          />
        );
    }
  }

  return <HomeScreen onConnected={() => { }} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingTitle: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: '#000',
    letterSpacing: -0.5,
  },
});

