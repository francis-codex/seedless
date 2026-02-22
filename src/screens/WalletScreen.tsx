import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import * as LocalAuthentication from 'expo-local-authentication';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import * as Linking from 'expo-linking';
import { SOLANA_RPC_URL, USDC_MINT, CLUSTER_SIMULATION, IS_DEVNET } from '../constants';

interface WalletScreenProps {
  onDisconnect: () => void;
  onSwap?: () => void;
  onStealth?: () => void;
  onBurner?: () => void;
  onPaywall?: () => void;
}


// WalletScreen - Main wallet interface after connection

// Default: Gasless transactions (paymaster sponsors fees)
// Optional: Pay fees in SOL (traditional)

// Create connection once - disable automatic retry on rate limit to prevent spam
const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
});

export function WalletScreen({ onDisconnect, onSwap, onStealth, onBurner, onPaywall }: WalletScreenProps) {
  const { smartWalletPubkey, disconnect, signAndSendTransaction, isSigning } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Balance state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Guards to prevent infinite fetch loop
  const isFetchingRef = useRef(false);
  const hasFetchedRef = useRef(false);
  const lastWalletRef = useRef<string | null>(null);

  // Privacy state - hides balances from shoulder surfers
  const [isPrivateMode, setIsPrivateMode] = useState(true); // Default to hidden

  // Toggle privacy mode with biometric auth to reveal
  const togglePrivacyMode = async () => {
    if (isPrivateMode) {
      // Revealing balances - require biometric auth
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        // No biometrics available, just toggle
        setIsPrivateMode(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to reveal balances',
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        setIsPrivateMode(false);
      }
    } else {
      // Hiding balances - no auth needed
      setIsPrivateMode(true);
    }
  };

  // Fetch wallet balances - with strict guards to prevent loops
  const doFetchBalances = async (walletPubkey: PublicKey) => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      return;
    }
    isFetchingRef.current = true;
    setIsLoadingBalance(true);
    setBalanceError(null);

    try {
      // Fetch SOL balance
      const solLamports = await connection.getBalance(walletPubkey);
      setSolBalance(solLamports / LAMPORTS_PER_SOL);

      // Fetch USDC balance
      try {
        const usdcMint = new PublicKey(USDC_MINT);
        const ata = await getAssociatedTokenAddress(usdcMint, walletPubkey);
        const tokenAccount = await getAccount(connection, ata);
        setUsdcBalance(Number(tokenAccount.amount) / 1_000_000);
      } catch {
        setUsdcBalance(0);
      }
      hasFetchedRef.current = true;
    } catch (error: any) {
      // Only log once, not spam
      if (!hasFetchedRef.current) {
        console.error('Failed to fetch balances:', error);
      }
      if (error?.message?.includes('429')) {
        setBalanceError('Rate limited - tap Refresh');
      } else {
        setBalanceError('Failed to load balance');
      }
    } finally {
      setIsLoadingBalance(false);
      isFetchingRef.current = false;
    }
  };

  // Manual refresh handler
  const handleRefresh = () => {
    if (smartWalletPubkey && !isFetchingRef.current) {
      doFetchBalances(smartWalletPubkey);
    }
  };

  // Fetch balances ONCE on mount when wallet is available
  useEffect(() => {
    if (!smartWalletPubkey) return;

    const walletStr = smartWalletPubkey.toString();

    // Only fetch if wallet changed or never fetched
    if (lastWalletRef.current !== walletStr) {
      lastWalletRef.current = walletStr;
      hasFetchedRef.current = false;
      doFetchBalances(smartWalletPubkey);
    }
  }, [smartWalletPubkey]);

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

    // Validate recipient address
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      Alert.alert('Invalid address', 'Enter a valid Solana wallet address');
      return;
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount greater than 0');
      return;
    }

    // Check balance before sending
    if (solBalance !== null && parsedAmount > solBalance) {
      Alert.alert('Insufficient balance', `You only have ${solBalance.toFixed(4)} SOL`);
      return;
    }

    setIsSending(true);
    try {
      const lamports = Math.round(parsedAmount * LAMPORTS_PER_SOL);

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
            clusterSimulation: CLUSTER_SIMULATION as 'mainnet' | 'devnet',
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
      handleRefresh();
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
          <View style={styles.balanceActions}>
            <TouchableOpacity
              onPress={togglePrivacyMode}
              style={styles.privacyToggle}
            >
              <Text style={styles.privacyToggleText}>
                {isPrivateMode ? 'Show' : 'Hide'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleRefresh} disabled={isLoadingBalance}>
              <Text style={styles.refreshText}>{isLoadingBalance ? 'Loading...' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmount}>
            {isPrivateMode ? '••••••' : (solBalance !== null ? solBalance.toFixed(4) : '—')}
          </Text>
          <Text style={styles.balanceToken}>SOL</Text>
        </View>

        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmountSecondary}>
            {isPrivateMode ? '••••••' : (usdcBalance !== null ? usdcBalance.toFixed(2) : '—')}
          </Text>
          <Text style={styles.balanceTokenSecondary}>USDC</Text>
        </View>

        {isPrivateMode && (
          <Text style={styles.privateModeHint}>Tap "Show" and authenticate to reveal</Text>
        )}
      </View>

      <View style={styles.statusBar}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Gasless mode</Text>
      </View>

      {/* Swap Button - Mainnet Only */}
      {onSwap && (
        <TouchableOpacity style={styles.swapButton} onPress={onSwap} activeOpacity={0.8}>
          <Text style={styles.swapButtonText}>Swap Tokens</Text>
          <Text style={styles.swapButtonSubtext}>{IS_DEVNET ? 'Mainnet only' : 'SOL ↔ USDC - Gasless'}</Text>
        </TouchableOpacity>
      )}

      {/* Privacy Features */}
      <View style={styles.privacySection}>
        <Text style={styles.privacySectionTitle}>Privacy Features</Text>
        <View style={styles.privacyButtons}>
          {onStealth && (
            <TouchableOpacity style={styles.privacyButton} onPress={onStealth} activeOpacity={0.8}>
              <Text style={styles.privacyButtonText}>Stealth</Text>
              <Text style={styles.privacyButtonSub}>Private receiving</Text>
            </TouchableOpacity>
          )}
          {onBurner && (
            <TouchableOpacity style={styles.privacyButton} onPress={onBurner} activeOpacity={0.8}>
              <Text style={styles.privacyButtonText}>Burners</Text>
              <Text style={styles.privacyButtonSub}>Isolated wallets</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* X402 Paywall Demo */}
      {onPaywall && (
        <TouchableOpacity style={styles.paywallButton} onPress={onPaywall} activeOpacity={0.8}>
          <Text style={styles.paywallButtonText}>X402 Paywall</Text>
          <Text style={styles.paywallButtonSub}>Pay-per-view content demo</Text>
        </TouchableOpacity>
      )}

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
  balanceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  privacyToggle: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#333',
    borderRadius: 6,
  },
  privacyToggleText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  refreshText: {
    fontSize: 13,
    color: '#666',
  },
  privateModeHint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
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
  swapButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 8,
  },
  swapButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  swapButtonSubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 4,
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
  privacySection: {
    marginTop: 16,
    marginBottom: 8,
  },
  privacySectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  privacyButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  privacyButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
  },
  privacyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  privacyButtonSub: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  paywallButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  paywallButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  paywallButtonSub: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
});
