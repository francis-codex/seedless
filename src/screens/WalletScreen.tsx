import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as Linking from 'expo-linking';

interface WalletScreenProps {
  onDisconnect: () => void;
}

/**
 * WalletScreen - Main wallet interface after connection
 *
 * Default: Gasless transactions (paymaster sponsors fees)
 * Optional: Pay fees in SOL (traditional)
 */
export function WalletScreen({ onDisconnect }: WalletScreenProps) {
  const { smartWalletPubkey, disconnect, signAndSendTransaction, isSigning } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  const shortAddress = smartWalletPubkey
    ? `${smartWalletPubkey.toString().slice(0, 4)}...${smartWalletPubkey.toString().slice(-4)}`
    : '';

  const fullAddress = smartWalletPubkey?.toString() || '';

  const handleDisconnect = async () => {
    await disconnect();
    onDisconnect();
  };

  const handleSend = async () => {
    if (!smartWalletPubkey || !recipient || !amount) {
      Alert.alert('Missing fields', 'Enter recipient and amount');
      return;
    }

    setIsSending(true);
    try {
      const recipientPubkey = new PublicKey(recipient);
      const lamports = parseFloat(amount) * LAMPORTS_PER_SOL;

      // Create transfer instruction
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: smartWalletPubkey,
        toPubkey: recipientPubkey,
        lamports,
      });

      // Create redirect URL for signing callback
      const redirectUrl = Linking.createURL('sign-callback');

      // Gasless by default - paymaster covers the fee
      const signature = await signAndSendTransaction(
        {
          instructions: [transferInstruction],
          transactionOptions: {
            clusterSimulation: 'mainnet', // Using mainnet RPC
            // feeToken not set = gasless (paymaster sponsors)
          },
        },
        {
          redirectUrl,
          onSuccess: () => {
            Alert.alert('Sent', 'Transaction confirmed');
          },
          onFail: (error) => {
            Alert.alert('Failed', error.message);
          },
        }
      );

      Alert.alert('Sent', `Signature: ${signature.slice(0, 16)}...`);
      setRecipient('');
      setAmount('');
    } catch (error: any) {
      console.error('Transfer failed:', error);
      Alert.alert('Failed', error.message || 'Transaction failed');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet</Text>
        <TouchableOpacity onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.addressSection}>
        <Text style={styles.addressLabel}>Address</Text>
        <Text style={styles.address}>{shortAddress}</Text>
        <TouchableOpacity
          onPress={() => Alert.alert('Address', fullAddress)}
          activeOpacity={0.6}
        >
          <Text style={styles.viewFull}>View full address</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusBar}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Gasless mode</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.formSection}>
        <Text style={styles.formTitle}>Send SOL</Text>

        <Text style={styles.label}>To</Text>
        <TextInput
          style={styles.input}
          placeholder="Recipient address"
          placeholderTextColor="#999"
          value={recipient}
          onChangeText={setRecipient}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Amount</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor="#999"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        <TouchableOpacity
          style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={isSending}
          activeOpacity={0.8}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How it works</Text>
        <Text style={styles.infoItem}>No SOL needed for fees</Text>
        <Text style={styles.infoItem}>Paymaster sponsors transactions</Text>
        <Text style={styles.infoItem}>Instant confirmation</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
  },
  disconnectText: {
    fontSize: 15,
    color: '#666',
  },
  addressSection: {
    marginBottom: 24,
  },
  addressLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 4,
  },
  address: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  viewFull: {
    fontSize: 14,
    color: '#666',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 24,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
    marginRight: 10,
  },
  statusText: {
    fontSize: 14,
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5e5',
    marginBottom: 24,
  },
  formSection: {
    marginBottom: 32,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 16,
    fontSize: 16,
    color: '#000',
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
  sendButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  infoItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
});
