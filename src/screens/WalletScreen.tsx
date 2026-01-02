import React, { useState, useEffect, useCallback } from 'react';
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
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import * as Linking from 'expo-linking';
import { SOLANA_RPC_URL, USDC_MINT } from '../constants';

interface WalletScreenProps {
  onDisconnect: () => void;
}

/**
 * WalletScreen - Main wallet interface after connection
 *
 * Default: Gasless transactions (paymaster sponsors fees)
 * Optional: Pay fees in SOL (traditional)
 */
// Create connection once
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

export function WalletScreen({ onDisconnect }: WalletScreenProps) {
  const { smartWalletPubkey, disconnect, signAndSendTransaction, isSigning } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Balance state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Fetch wallet balances
  const fetchBalances = useCallback(async () => {
    if (!smartWalletPubkey) return;

    setIsLoadingBalance(true);
    try {
      // Fetch SOL balance
      const solLamports = await connection.getBalance(smartWalletPubkey);
      setSolBalance(solLamports / LAMPORTS_PER_SOL);

      // Fetch USDC balance
      try {
        const usdcMint = new PublicKey(USDC_MINT);
        const ata = await getAssociatedTokenAddress(usdcMint, smartWalletPubkey);
        const tokenAccount = await getAccount(connection, ata);
        // USDC has 6 decimals
        setUsdcBalance(Number(tokenAccount.amount) / 1_000_000);
      } catch {
        // No USDC account = 0 balance
        setUsdcBalance(0);
      }
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [smartWalletPubkey]);

  // Fetch balances on mount and when wallet changes
  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

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
      // Refresh balances after successful send
      fetchBalances();
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
        <TouchableOpacity
          onPress={async () => {
            await Clipboard.setStringAsync(fullAddress);
            Alert.alert('Copied', 'Address copied to clipboard');
          }}
          activeOpacity={0.6}
        >
          <Text style={styles.address}>{shortAddress}</Text>
          <Text style={styles.viewFull}>Tap to copy</Text>
        </TouchableOpacity>
      </View>

      {/* Balance Display */}
      <View style={styles.balanceSection}>
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <TouchableOpacity onPress={fetchBalances} disabled={isLoadingBalance}>
            <Text style={styles.refreshText}>{isLoadingBalance ? 'Loading...' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmount}>
            {solBalance !== null ? solBalance.toFixed(4) : '—'}
          </Text>
          <Text style={styles.balanceToken}>SOL</Text>
        </View>

        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmountSecondary}>
            {usdcBalance !== null ? usdcBalance.toFixed(2) : '—'}
          </Text>
          <Text style={styles.balanceTokenSecondary}>USDC</Text>
        </View>
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
  balanceSection: {
    backgroundColor: '#000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceLabel: {
    fontSize: 13,
    color: '#999',
  },
  refreshText: {
    fontSize: 13,
    color: '#666',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    marginRight: 8,
  },
  balanceToken: {
    fontSize: 18,
    fontWeight: '500',
    color: '#999',
  },
  balanceAmountSecondary: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginRight: 6,
  },
  balanceTokenSecondary: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
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
