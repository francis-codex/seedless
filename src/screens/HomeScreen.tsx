import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import * as Linking from 'expo-linking';

interface HomeScreenProps {
  onConnected: () => void;
}

/**
 * HomeScreen - Entry point for authentication
 *
 * Triggers passkey flow via biometric authentication
 * (FaceID/TouchID) to create or access a smart wallet.
 */
export function HomeScreen({ onConnected }: HomeScreenProps) {
  const { connect, isConnecting } = useWallet();

  const handleConnect = async () => {
    try {
      // Create deep link URL for callback after passkey auth
      const redirectUrl = Linking.createURL('callback');

      await connect({
        redirectUrl,
        onSuccess: () => {
          onConnected();
        },
        onFail: (error) => {
          Alert.alert('Connection Failed', error.message);
        },
      });
    } catch (error: any) {
      console.error('Connection failed:', error);
      Alert.alert('Error', error.message || 'Failed to connect');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Lazor</Text>
        <Text style={styles.subtitle}>Wallet</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.tagline}>
          No seed phrase.{'\n'}
          No extension.{'\n'}
          No gas fees.
        </Text>

        <View style={styles.features}>
          <Text style={styles.featureText}>Passkey authentication</Text>
          <View style={styles.divider} />
          <Text style={styles.featureText}>Gasless transactions</Text>
          <View style={styles.divider} />
          <Text style={styles.featureText}>Smart wallet</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, isConnecting && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={isConnecting}
          activeOpacity={0.8}
        >
          {isConnecting ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.buttonText}>Connect</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.poweredBy}>
          Powered by LazorKit + Kora
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  header: {
    marginBottom: 48,
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#000',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 48,
    fontWeight: '300',
    color: '#000',
    letterSpacing: -1,
    marginTop: -8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  tagline: {
    fontSize: 28,
    fontWeight: '500',
    color: '#000',
    lineHeight: 38,
    marginBottom: 48,
  },
  features: {
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    paddingTop: 24,
  },
  featureText: {
    fontSize: 16,
    color: '#666',
    paddingVertical: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5e5',
  },
  footer: {
    paddingTop: 24,
  },
  button: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#333',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  poweredBy: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
    fontSize: 13,
  },
});
