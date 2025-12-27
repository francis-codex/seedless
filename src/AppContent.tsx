import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { HomeScreen } from './screens/HomeScreen';
import { WalletScreen } from './screens/WalletScreen';

/**
 * AppContent - Handles navigation based on wallet connection state
 *
 * Uses the hook's isConnected state for persistence across app restarts.
 * When user reconnects, the session is automatically restored.
 */
export function AppContent() {
  const { isConnected, isLoading } = useWallet();

  // Show loading while checking for persisted session
  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (isConnected) {
    return <WalletScreen onDisconnect={() => {}} />;
  }

  return <HomeScreen onConnected={() => {}} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
