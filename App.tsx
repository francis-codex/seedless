import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { LazorProvider } from './src/providers/LazorProvider';
import { AppContent } from './src/AppContent';


// Seedless Wallet - Passkey-native Solana wallet

export default function App() {
  return (
    <LazorProvider>
      <StatusBar style="dark" />
      <AppContent />
    </LazorProvider>
  );
}
