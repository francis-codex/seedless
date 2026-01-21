import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { HomeScreen } from './screens/HomeScreen';
import { WalletScreen } from './screens/WalletScreen';
import { SwapScreen } from './screens/SwapScreen';
import { StealthScreen } from './screens/StealthScreen';
import { BurnerScreen } from './screens/BurnerScreen';
import { PaywallScreen } from './screens/PaywallScreen';

type Screen = 'wallet' | 'swap' | 'stealth' | 'burner' | 'paywall';

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
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (isConnected) {
    switch (currentScreen) {
      case 'swap':
        return <SwapScreen onBack={() => setCurrentScreen('wallet')} />;
      case 'stealth':
        return <StealthScreen onBack={() => setCurrentScreen('wallet')} />;
      case 'burner':
        return <BurnerScreen onBack={() => setCurrentScreen('wallet')} />;
      case 'paywall':
        return <PaywallScreen onBack={() => setCurrentScreen('wallet')} />;
      default:
        return (
          <WalletScreen
            onDisconnect={() => setCurrentScreen('wallet')}
            onSwap={() => setCurrentScreen('swap')}
            onStealth={() => setCurrentScreen('stealth')}
            onBurner={() => setCurrentScreen('burner')}
            onPaywall={() => setCurrentScreen('paywall')}
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
});

