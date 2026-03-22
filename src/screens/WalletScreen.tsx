import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import * as Linking from 'expo-linking';
import { SOLANA_RPC_URL, USDC_MINT, CLUSTER_SIMULATION, IS_DEVNET, MIN_SOL_FOR_TX } from '../constants';

interface WalletScreenProps {
  onDisconnect: () => void;
  onSwap?: () => void;
  onStealth?: () => void;
  onBurner?: () => void;
  onBags?: () => void;
  onLaunch?: () => void;
}


// WalletScreen - Main wallet interface after connection

// Default: Gasless transactions (paymaster sponsors fees)
// Optional: Pay fees in SOL (traditional)

// Create connection once - disable automatic retry on rate limit to prevent spam
const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
});

export function WalletScreen({ onDisconnect, onSwap, onStealth, onBurner, onBags, onLaunch }: WalletScreenProps) {
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

  // Devnet SOL airdrop — uses public Solana faucet (per-wallet limit, not per-project)
  const [isAirdropping, setIsAirdropping] = useState(false);
  const handleAirdrop = async () => {
    if (!smartWalletPubkey || !IS_DEVNET) return;
    setIsAirdropping(true);
    try {
      const devnetConnection = new Connection('https://api.devnet.solana.com', 'confirmed');
      const sig = await devnetConnection.requestAirdrop(smartWalletPubkey, 1 * LAMPORTS_PER_SOL);
      await devnetConnection.confirmTransaction(sig, 'confirmed');
      Alert.alert('Airdrop Success', '1 SOL added to your wallet');
      setTimeout(() => handleRefresh(), 2000);
    } catch (error: any) {
      console.error('Airdrop failed:', error);
      Alert.alert(
        'Airdrop Failed',
        'The devnet faucet is busy. Copy your wallet address and get SOL manually at faucet.solana.com, or share your address in the Seedless TG group and we\'ll send you some.',
      );
    } finally {
      setIsAirdropping(false);
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

  const fullAddress = useMemo(() => smartWalletPubkey?.toString() || '', [smartWalletPubkey]);
  const shortAddress = useMemo(() =>
    fullAddress ? `${fullAddress.slice(0, 4)}...${fullAddress.slice(-4)}` : '',
    [fullAddress]
  );

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    onDisconnect();
  }, [disconnect, onDisconnect]);

  const handleSend = useCallback(async () => {
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

    // Check balance before sending — account for rent-exempt minimum
    if (solBalance !== null) {
      if (parsedAmount > solBalance) {
        Alert.alert('Insufficient balance', `You only have ${solBalance.toFixed(4)} SOL`);
        return;
      }
      if (parsedAmount > solBalance - MIN_SOL_FOR_TX) {
        Alert.alert('Insufficient balance', `You need to keep at least ${MIN_SOL_FOR_TX} SOL for rent. Max you can send: ${(solBalance - MIN_SOL_FOR_TX).toFixed(4)} SOL`);
        return;
      }
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
      // Refresh balances after successful send (delay for RPC to reflect changes)
      setTimeout(() => handleRefresh(), 2000);
    } catch (error: any) {
      console.error('Transfer failed:', error);
      const msg = error.message || 'Transaction failed';
      // Parse known LazorKit/Solana errors into friendly messages
      let friendly = msg;
      if (msg.includes('0x2')) {
        friendly = 'Insufficient funds. Make sure you have enough SOL to cover the amount plus rent.';
      } else if (msg.includes('0x1783') || msg.includes('TransactionTooOld')) {
        friendly = 'Transaction expired. The signing took too long. Please try again.';
      } else if (msg.includes('0x7d6') || msg.includes('ConstraintSeeds')) {
        friendly = 'Wallet setup error. Try disconnecting and reconnecting your wallet.';
      } else if (msg.includes('33 bytes')) {
        friendly = 'Passkey error. Make sure biometrics (fingerprint or Face ID) are set up on your device.';
      }
      Alert.alert('Failed', friendly);
    } finally {
      setIsSending(false);
    }
  }, [smartWalletPubkey, recipient, amount, solBalance, signAndSendTransaction]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={isLoadingBalance} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet</Text>
        <TouchableOpacity onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </TouchableOpacity>
      </View>

      {IS_DEVNET && (
        <View style={styles.devnetBanner}>
          <Text style={styles.devnetBannerText}>DEVNET BETA</Text>
          <Text style={styles.devnetBannerSub}>Test tokens only - not real funds</Text>
        </View>
      )}

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

      {IS_DEVNET && (
        <TouchableOpacity
          style={[styles.airdropButton, isAirdropping && styles.sendButtonDisabled]}
          onPress={handleAirdrop}
          disabled={isAirdropping}
          activeOpacity={0.8}
        >
          {isAirdropping ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.airdropButtonText}>Airdrop 1 SOL (Devnet)</Text>
          )}
        </TouchableOpacity>
      )}

      <View style={styles.statusBar}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>Gasless mode</Text>
      </View>

      {/* Swap Button - Mainnet Only */}
      {onSwap && !IS_DEVNET && (
        <TouchableOpacity style={styles.swapButton} onPress={onSwap} activeOpacity={0.8}>
          <Text style={styles.swapButtonText}>Swap Tokens</Text>
          <Text style={styles.swapButtonSubtext}>SOL ↔ USDC - Gasless</Text>
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

      {/* SEED Rewards - Bags.fm Fee Sharing (Mainnet Only) */}
      {onBags && !IS_DEVNET && (
        <TouchableOpacity style={styles.bagsButton} onPress={onBags} activeOpacity={0.8}>
          <Text style={styles.bagsButtonText}>SEED Rewards</Text>
          <Text style={styles.bagsButtonSub}>Fee sharing + claim earnings</Text>
        </TouchableOpacity>
      )}

      {/* Launch Token via Bags (Mainnet Only) */}
      {onLaunch && !IS_DEVNET && (
        <TouchableOpacity style={styles.launchTokenButton} onPress={onLaunch} activeOpacity={0.8}>
          <Text style={styles.launchTokenButtonText}>Launch Token</Text>
          <Text style={styles.launchTokenButtonSub}>Create + list on Bags.fm</Text>
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
        <View style={styles.amountRow}>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="0.00"
            placeholderTextColor="#999"
            value={amount}
            onChangeText={(text) => setAmount(text.replace(',', '.'))}
            keyboardType="decimal-pad"
          />
          <TouchableOpacity
            style={styles.maxButton}
            onPress={() => {
              if (solBalance !== null && solBalance > MIN_SOL_FOR_TX) {
                setAmount((solBalance - MIN_SOL_FOR_TX).toFixed(4));
              }
            }}
            activeOpacity={0.6}
          >
            <Text style={styles.maxButtonText}>Max</Text>
          </TouchableOpacity>
        </View>

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
    </KeyboardAvoidingView>
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
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountInput: {
    flex: 1,
    marginBottom: 16,
  },
  maxButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#000',
    borderRadius: 8,
    marginBottom: 16,
  },
  maxButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
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
  launchTokenButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  launchTokenButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  launchTokenButtonSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  bagsButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  bagsButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  bagsButtonSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  devnetBanner: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  devnetBannerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e',
  },
  devnetBannerSub: {
    fontSize: 12,
    color: '#b45309',
    marginTop: 2,
  },
  airdropButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  airdropButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
