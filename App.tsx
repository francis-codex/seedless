import React from 'react';
import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LazorProvider } from './src/providers/LazorProvider';
import { AppContent } from './src/AppContent';

LogBox.ignoreLogs([
  'ws error',
  'Attempted to import the module',
]);

export default function App() {
  return (
    <SafeAreaProvider>
      <LazorProvider>
        <StatusBar style="dark" />
        <AppContent />
      </LazorProvider>
    </SafeAreaProvider>
  );
}
