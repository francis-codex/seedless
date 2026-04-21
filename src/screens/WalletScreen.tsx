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
import { SOLANA_RPC_URL, USDC_MINT, SEED_MINT, SEED_DECIMALS, CLUSTER_SIMULATION, IS_DEVNET, MIN_SOL_FOR_TX, QUICK_AMOUNTS, getTxExplorerUrl, isValidSolanaAddress } from '../constants';
import {
  ActiveSession,
  clearSession as clearStoredSession,
  computeExpiresAtSlot,
  generateSessionKeypair,
  getActiveSession,
  storeSession,
} from '../utils/session';

interface WalletScreenProps {
  onDisconnect: () => void;
  onSwap?: () => void;
  onStealth?: () => void;
  onBurner?: () => void;
  onBags?: () => void;
  onLaunch?: () => void;
  onAuthorities?: () => void;
}

const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
});

// Fallback public RPC for balance fetching when Helius is rate-limited
const fallbackConnection = new Connection(
  IS_DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com',
  { commitment: 'confirmed' },
);

export function WalletScreen({ onDisconnect, onSwap, onStealth, onBurner, onBags, onLaunch, onAuthorities }: WalletScreenProps) {
  const {
    smartWalletPubkey,
    disconnect,
    isSigning,
    createSession,
    signAndSendWithSession,
    revokeSession,
    transferSol,
  } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [isSessionBusy, setIsSessionBusy] = useState(false);

  const walletIdRef = useRef<string | null>(null);
  const walletId = smartWalletPubkey?.toBase58();
  walletIdRef.current = walletId ?? null;

  // Balance state — default to 0 so UI never shows "—"
  const [solBalance, setSolBalance] = useState<number>(0);
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [seedBalance, setSeedBalance] = useState<number>(0);
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

    // Fetch SOL balance — try Helius first, fallback to public RPC
    try {
      const solLamports = await connection.getBalance(walletPubkey);
      setSolBalance(solLamports / LAMPORTS_PER_SOL);
    } catch {
      try {
        const solLamports = await fallbackConnection.getBalance(walletPubkey);
        setSolBalance(solLamports / LAMPORTS_PER_SOL);
      } catch (error: any) {
        if (!hasFetchedRef.current) {
          console.error('Failed to fetch SOL balance:', error);
        }
        setBalanceError('Failed to load balance - tap Refresh');
      }
    }

    // Fetch USDC balance independently
    try {
      const usdcMint = new PublicKey(USDC_MINT);
      const ata = await getAssociatedTokenAddress(usdcMint, walletPubkey);
      const tokenAccount = await getAccount(connection, ata);
      setUsdcBalance(Number(tokenAccount.amount) / 1_000_000);
    } catch {
      setUsdcBalance(0);
    }

    // Fetch SEED balance
    try {
      const seedMint = new PublicKey(SEED_MINT);
      const ata = await getAssociatedTokenAddress(seedMint, walletPubkey);
      const tokenAccount = await getAccount(connection, ata);
      setSeedBalance(Number(tokenAccount.amount) / Math.pow(10, SEED_DECIMALS));
    } catch {
      setSeedBalance(0);
    }

    hasFetchedRef.current = true;
    setIsLoadingBalance(false);
    isFetchingRef.current = false;
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

  // Load an existing session (if any) when the wallet changes
  useEffect(() => {
    let cancelled = false;
    if (!walletId) {
      setActiveSession(null);
      return;
    }
    getActiveSession(walletId).then((session) => {
      if (!cancelled) setActiveSession(session);
    }).catch(() => {
      if (!cancelled) setActiveSession(null);
    });
    return () => { cancelled = true; };
  }, [walletId]);

  const handleStartSession = useCallback(async () => {
    if (!walletId) return;
    setIsSessionBusy(true);
    try {
      const sessionKeypair = generateSessionKeypair();
      const expiresAtSlot = await computeExpiresAtSlot();
      const redirectUrl = Linking.createURL('sign-callback');

      const result = await createSession(
        { sessionKey: sessionKeypair.publicKey, expiresAtSlot },
        { redirectUrl },
      );

      await storeSession(walletId, sessionKeypair, result.sessionPda, expiresAtSlot);
      const fresh = await getActiveSession(walletId);
      setActiveSession(fresh);
      Alert.alert('Fast Send enabled', 'Next ~30 minutes of sends won\'t need Face ID.');
    } catch (error: any) {
      console.error('Session create failed:', error);
      const msg: string = error?.message || '';
      const friendly = msg.includes('0x2')
        ? 'Fast Send needs a wallet created under the v2 program. Create a fresh wallet to try it.'
        : msg || 'Please try again.';
      Alert.alert('Could not start session', friendly);
    } finally {
      setIsSessionBusy(false);
    }
  }, [walletId, createSession]);

  const handleEndSession = useCallback(async () => {
    if (!walletId || !activeSession) return;
    setIsSessionBusy(true);
    try {
      const redirectUrl = Linking.createURL('sign-callback');
      try {
        await revokeSession({ sessionPda: activeSession.sessionPda }, { redirectUrl });
      } catch (err) {
        // Revoke requires passkey; if user cancels, still clear local state so
        // we don't try to reuse a session we've marked dead.
        console.warn('revokeSession failed, clearing local state', err);
      }
      await clearStoredSession(walletId);
      setActiveSession(null);
    } finally {
      setIsSessionBusy(false);
    }
  }, [walletId, activeSession, revokeSession]);

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
    if (!isValidSolanaAddress(recipient.trim())) {
      Alert.alert('Invalid address', 'Enter a valid Solana wallet address');
      return;
    }
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient.trim());
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

    // Block send if balance hasn't loaded yet
    if (!hasFetchedRef.current) {
      Alert.alert('Balance not loaded', 'Please wait for your balance to load or tap Refresh before sending.');
      return;
    }

    // Check balance before sending — account for rent-exempt minimum
    if (parsedAmount > solBalance) {
      Alert.alert('Insufficient balance', `You only have ${solBalance.toFixed(4)} SOL`);
      return;
    }
    if (parsedAmount > solBalance - MIN_SOL_FOR_TX) {
      Alert.alert('Insufficient balance', `You need to keep at least ${MIN_SOL_FOR_TX} SOL for rent. Max you can send: ${(solBalance - MIN_SOL_FOR_TX).toFixed(4)} SOL`);
      return;
    }

    setIsSending(true);
    try {
      const lamports = Math.round(parsedAmount * LAMPORTS_PER_SOL);
      const redirectUrl = Linking.createURL('sign-callback');
      const txOpts = {
        clusterSimulation: CLUSTER_SIMULATION as 'mainnet' | 'devnet',
      };

      // Re-check the session right before sending so we don't try to use one
      // that just expired between screen mount and tap.
      const session = walletId ? await getActiveSession(walletId) : null;
      if (walletId && !session && activeSession) setActiveSession(null);

      let signature: string;

      if (session) {
        // Fast path: ed25519-signed locally, no passkey prompt.
        signature = await signAndSendWithSession({
          sessionKeypair: session.sessionKeypair,
          sessionPda: session.sessionPda,
          instructions: [
            SystemProgram.transfer({
              fromPubkey: smartWalletPubkey,
              toPubkey: recipientPubkey,
              lamports,
            }),
          ],
          transactionOptions: txOpts,
        });
      } else {
        // Slow path: passkey-prompted transfer via the v2 convenience method.
        signature = await transferSol(
          {
            recipient: recipientPubkey,
            lamports,
            transactionOptions: txOpts,
          },
          { redirectUrl },
        );
      }

      Alert.alert(
        'Transaction Successful',
        `Sent ${parsedAmount} SOL successfully.\n\nTx: ${signature.slice(0, 20)}...`,
        [
          { text: 'OK' },
          { text: 'View on Explorer', onPress: () => Linking.openURL(getTxExplorerUrl(signature)) },
        ]
      );
      setRecipient('');
      setAmount('');
      // Refresh balances after successful send (delay for RPC to reflect changes)
      setTimeout(() => handleRefresh(), 2000);
    } catch (error: any) {
      console.error('Transfer failed:', error);
      const msg = error.message || 'Transaction failed';
      // If the session looked valid client-side but the chain rejected it
      // (expired, revoked, limit hit), drop it so the next send falls back
      // to the passkey path instead of looping the same failure.
      if (activeSession && /session|SessionExpired|SessionInactive|unauthorized/i.test(msg)) {
        if (walletId) await clearStoredSession(walletId);
        setActiveSession(null);
      }
      // Parse known LazorKit/Solana errors into friendly messages
      let friendly = msg;
      if (msg.includes('Transaction too large') || msg.includes('1232')) {
        friendly = 'Transaction too large. Try sending a smaller amount or contact support.';
      } else if (msg.includes('0x1') || msg.includes('insufficient lamports')) {
        friendly = 'Insufficient balance for this transaction. Make sure you have enough SOL.';
      } else if (msg.includes('0x2')) {
        friendly = 'This wallet was created on an older program version that the new session/transfer flow cannot drive. Connect a new wallet to test, then we can migrate this one.';
      } else if (msg.includes('0x1783') || msg.includes('TransactionTooOld')) {
        friendly = 'Transaction expired. The signing took too long. Please try again.';
      } else if (msg.includes('0x7d6') || msg.includes('ConstraintSeeds')) {
        friendly = 'Wallet setup error. Try disconnecting and reconnecting your wallet.';
      } else if (msg.includes('33 bytes')) {
        friendly = 'Passkey error. Make sure biometrics (fingerprint or Face ID) are set up on your device.';
      } else if (msg.includes('timed out') || msg.includes('not allowed') || msg.includes('webauthn')) {
        friendly = 'Authentication timed out or was cancelled. Please try again.';
      } else if (msg.includes('Simulation failed') || msg.includes('simulation failed')) {
        friendly = 'Transaction simulation failed. Check your balance and try again.';
      }
      Alert.alert('Failed', friendly);
    } finally {
      setIsSending(false);
    }
  }, [smartWalletPubkey, walletId, recipient, amount, solBalance, activeSession, signAndSendWithSession, transferSol]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            {isPrivateMode ? '••••••' : solBalance.toFixed(4)}
          </Text>
          <Text style={styles.balanceToken}>SOL</Text>
        </View>

        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmountSecondary}>
            {isPrivateMode ? '••••••' : usdcBalance.toFixed(2)}
          </Text>
          <Text style={styles.balanceTokenSecondary}>USDC</Text>
        </View>

        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmountSecondary}>
            {isPrivateMode ? '••••••' : seedBalance.toFixed(2)}
          </Text>
          <Text style={styles.balanceTokenSecondary}>SEED</Text>
        </View>

        {isPrivateMode && (
          <Text style={styles.privateModeHint}>Tap "Show" and authenticate to reveal</Text>
        )}

        {balanceError && !isPrivateMode && (
          <Text style={styles.balanceErrorText}>{balanceError}</Text>
        )}
      </View>

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
        {onAuthorities && (
          <TouchableOpacity style={styles.devicesButton} onPress={onAuthorities} activeOpacity={0.8}>
            <Text style={styles.devicesButtonText}>Devices</Text>
            <Text style={styles.devicesButtonSub}>Add or remove signers</Text>
          </TouchableOpacity>
        )}
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
        <View style={styles.formTitleRow}>
          <Text style={styles.formTitle}>Send SOL</Text>
          <View style={styles.fastSendBadge}>
            <View style={[styles.fastSendDot, activeSession ? styles.fastSendDotOn : styles.fastSendDotOff]} />
            <Text style={styles.fastSendBadgeText}>
              {activeSession
                ? `Fast Send · ${Math.max(1, Math.round(activeSession.remainingMs / 60000))}m`
                : 'Fast Send off'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.fastSendToggle, isSessionBusy && styles.fastSendToggleDisabled]}
          onPress={activeSession ? handleEndSession : handleStartSession}
          disabled={isSessionBusy || !smartWalletPubkey}
          activeOpacity={0.7}
        >
          {isSessionBusy ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Text style={styles.fastSendToggleText}>
              {activeSession ? 'End Fast Send' : 'Enable Fast Send (one Face ID)'}
            </Text>
          )}
        </TouchableOpacity>

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

        <View style={styles.quickAmountRow}>
          {QUICK_AMOUNTS.map((qa) => (
            <TouchableOpacity
              key={qa}
              style={styles.quickAmountButton}
              onPress={() => setAmount(String(qa))}
              activeOpacity={0.6}
            >
              <Text style={styles.quickAmountText}>{qa} SOL</Text>
            </TouchableOpacity>
          ))}
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
    paddingBottom: 100,
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
  balanceErrorText: {
    fontSize: 12,
    color: '#f87171',
    marginTop: 8,
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
  },
  formTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  fastSendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#f3f3f3',
  },
  fastSendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  fastSendDotOn: {
    backgroundColor: '#16a34a',
  },
  fastSendDotOff: {
    backgroundColor: '#bbb',
  },
  fastSendBadgeText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  fastSendToggle: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  fastSendToggleDisabled: {
    opacity: 0.6,
  },
  fastSendToggleText: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
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
  quickAmountRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
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
  devicesButton: {
    marginTop: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
  },
  devicesButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  devicesButtonSub: {
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
});
