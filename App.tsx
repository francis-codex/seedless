import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { LazorProvider } from './src/providers/LazorProvider';
import { AppContent } from './src/AppContent';


 // Lazor Wallet Starter
 
// A React Native starter template demonstrating:
// - Passkey-based wallet authentication (no seed phrase)
// - Gasless transactions via Kora paymaster
 
  // Built with LazorKit SDK for Solana
 
export default function App() {
  return (
    <LazorProvider>
      <StatusBar style="dark" />
      <AppContent />
    </LazorProvider>
  );
}
