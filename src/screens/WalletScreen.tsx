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
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import * as Linking from 'expo-linking';
import { SOLANA_RPC_URL, USDC_MINT, SEED_MINT, SOL_MINT, SEED_DECIMALS, CLUSTER_SIMULATION, IS_DEVNET, MIN_SOL_FOR_TX, QUICK_AMOUNTS, getTxExplorerUrl, isValidSolanaAddress } from '../constants';
import {
  ActiveSession,
  clearSession as clearStoredSession,
  computeExpiresAtSlot,
  generateSessionKeypair,
  getActiveSession,
  storeSession,
} from '../utils/session';
import { colors, radii, spacing, typography } from '../theme';
import {
  Pill,
  ActionButton,
  Icon,
  TokenLogo,
  TokenRow,
  WalletHeader,
  ScreenHeader,
  BottomNav,
  PrimaryButton,
  NavTab,
} from '../components/ui';

interface WalletScreenProps {
  onDisconnect: () => void;
  onSwap?: () => void;
  onStealth?: () => void;
  onBurner?: () => void;
  onBags?: () => void;
  onLaunch?: () => void;
  onAuthorities?: () => void;
  onUmbraDebug?: () => void;
  onIka?: () => void;
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

export function WalletScreen({ onDisconnect, onSwap, onStealth, onBurner, onBags, onLaunch, onAuthorities, onUmbraDebug, onIka }: WalletScreenProps) {
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
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tokens' | 'tools'>('tokens');
  const [navTab, setNavTab] = useState<NavTab>('wallet');

  const walletIdRef = useRef<string | null>(null);
  const walletId = smartWalletPubkey?.toBase58();
  walletIdRef.current = walletId ?? null;

  // Balance state — default to 0 so UI never shows "—"
  const [solBalance, setSolBalance] = useState<number>(0);
  const [usdcBalance, setUsdcBalance] = useState<number>(0);
  const [seedBalance, setSeedBalance] = useState<number>(0);
  const [prices, setPrices] = useState<{ sol: number; usdc: number; seed: number }>({ sol: 0, usdc: 1, seed: 0 });
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
      const ata = await getAssociatedTokenAddress(usdcMint, walletPubkey, true);
      const tokenAccount = await getAccount(connection, ata);
      setUsdcBalance(Number(tokenAccount.amount) / 1_000_000);
    } catch {
      setUsdcBalance(0);
    }

    // Fetch SEED balance
    try {
      const seedMint = new PublicKey(SEED_MINT);
      const ata = await getAssociatedTokenAddress(seedMint, walletPubkey, true);
      const tokenAccount = await getAccount(connection, ata);
      setSeedBalance(Number(tokenAccount.amount) / Math.pow(10, SEED_DECIMALS));
    } catch {
      setSeedBalance(0);
    }

    // Fetch USD prices from Jupiter Lite API (no auth needed)
    try {
      const ids = [SOL_MINT, USDC_MINT, SEED_MINT].join(',');
      const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${ids}`);
      if (res.ok) {
        const data = await res.json();
        setPrices({
          sol: data?.[SOL_MINT]?.usdPrice ?? 0,
          usdc: data?.[USDC_MINT]?.usdPrice ?? 1,
          seed: data?.[SEED_MINT]?.usdPrice ?? 0,
        });
      }
    } catch {
      // keep last known prices
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

  const handleCopyAddress = useCallback(async () => {
    if (!fullAddress) return;
    await Clipboard.setStringAsync(fullAddress);
    Alert.alert('Copied', 'Address copied to clipboard');
  }, [fullAddress]);

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
      setSendModalOpen(false);
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

  // ============================================================
  // Render — visual layer only (Wells UI). All logic is above.
  // ============================================================

  const totalUsd = solBalance * prices.sol + usdcBalance * prices.usdc + seedBalance * prices.seed;

  // Token list for the Tokens tab
  const tokens = useMemo(() => {
    const list = [];
    if (seedBalance > 0 || prices.seed > 0) {
      list.push({
        symbol: 'SEED',
        name: 'Seedless',
        balance: `${seedBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} SEED`,
        usdValue: `$${(seedBalance * prices.seed).toFixed(2)}`,
        changePct: null,
      });
    }
    list.push({
      symbol: 'SOL',
      name: 'Solana',
      balance: `${solBalance.toFixed(4)} SOL`,
      usdValue: `$${(solBalance * prices.sol).toFixed(2)}`,
      changePct: null,
    });
    list.push({
      symbol: 'USDC',
      name: 'USDC',
      balance: `${usdcBalance.toFixed(2)} USDC`,
      usdValue: `$${(usdcBalance * prices.usdc).toFixed(2)}`,
      changePct: null,
    });
    return list;
  }, [solBalance, usdcBalance, seedBalance, prices]);

  const renderToolsTab = () => (
    <View style={styles.toolsCol}>
      {onStealth && (
        <ToolRow
          title="Stealth"
          subtitle="Receive privately via stealth addresses"
          iconName="shield"
          onPress={onStealth}
        />
      )}
      {onBurner && (
        <ToolRow
          title="Burners"
          subtitle="Isolated single-use wallets"
          iconName="lightning"
          onPress={onBurner}
        />
      )}
      {onUmbraDebug && (
        <ToolRow
          title="Privacy Setup"
          subtitle="Register for Umbra private receiving"
          iconName="lock"
          onPress={onUmbraDebug}
        />
      )}
      {onAuthorities && (
        <ToolRow
          title="Devices"
          subtitle="Add or remove signers"
          iconName="settings"
          onPress={onAuthorities}
        />
      )}
      {onIka && (
        <ToolRow
          title="Multi-chain"
          subtitle="Sign Ethereum from your passkey via Ika"
          iconName="lightning"
          onPress={onIka}
        />
      )}
      {onBags && (
        <ToolRow
          title="SEED Rewards"
          subtitle="Fee sharing & claim earnings"
          iconName="check"
          onPress={onBags}
        />
      )}
      {onLaunch && (
        <ToolRow
          title="Launch Token"
          subtitle="Create + list on Bags.fm"
          iconName="plus"
          onPress={onLaunch}
        />
      )}
      <ToolRow
        title="Disconnect"
        subtitle="Sign out of this wallet"
        iconName="close"
        onPress={handleDisconnect}
        danger
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoadingBalance} onRefresh={handleRefresh} tintColor={colors.text} />
            }
          >
            <WalletHeader
              walletName="Wallet 01"
              truncatedAddress={shortAddress || '...'}
              onProfilePress={handleCopyAddress}
              rightIcon={isPrivateMode ? 'eyeOff' : 'eye'}
              onRightPress={togglePrivacyMode}
            />

            {IS_DEVNET && (
              <View style={styles.devnetBanner}>
                <Pill label="DEVNET BETA" variant="warning" size="md" />
                <Text style={styles.devnetSub}>Test tokens only — not real funds</Text>
              </View>
            )}

            {/* Balance hero */}
            <View style={styles.heroSection}>
              <Text style={styles.heroBalance}>
                {isPrivateMode ? '••••' : `$${totalUsd.toFixed(2)}`}
              </Text>
              <View style={styles.heroSub}>
                {balanceError && !isPrivateMode ? (
                  <Pill label={balanceError} variant="danger" />
                ) : isLoadingBalance && !hasFetchedRef.current ? (
                  <ActivityIndicator color={colors.textMuted} size="small" />
                ) : (
                  <Pill
                    label={isPrivateMode ? 'Tap eye to reveal' : 'Mainnet beta'}
                    variant={isPrivateMode ? 'neutral' : 'success'}
                  />
                )}
              </View>
            </View>

            {/* Action row */}
            <View style={styles.actionRow}>
              <ActionButton
                icon={<Icon name="send" size={22} color={colors.text} />}
                label="Send"
                onPress={() => setSendModalOpen(true)}
              />
              <ActionButton
                icon={<Icon name="swap" size={22} color={colors.text} />}
                label="Swap"
                onPress={onSwap}
                disabled={!onSwap}
              />
              <ActionButton
                icon={<Icon name="qr" size={22} color={colors.text} />}
                label="Receive"
                onPress={() => setReceiveModalOpen(true)}
              />
              <ActionButton
                icon={<Icon name="scan" size={22} color={colors.text} />}
                label="Scan"
                onPress={() => Alert.alert('Coming soon', 'QR scanning ships in v0.5')}
              />
            </View>

            {/* Tabs */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveTab('tokens')}
                style={[styles.tab, activeTab === 'tokens' && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === 'tokens' && styles.tabTextActive]}>Tokens</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveTab('tools')}
                style={[styles.tab, activeTab === 'tools' && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === 'tools' && styles.tabTextActive]}>Tools</Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'tokens' ? (
              <View style={styles.tokenList}>
                {tokens.map((t) => (
                  <TokenRow
                    key={t.symbol}
                    symbol={t.symbol}
                    name={t.name}
                    balance={isPrivateMode ? '••••' : t.balance}
                    usdValue={isPrivateMode ? '••••' : t.usdValue}
                    changePct={t.changePct}
                  />
                ))}
              </View>
            ) : (
              renderToolsTab()
            )}
          </ScrollView>

          <BottomNav
            active={navTab}
            onChange={(t) => {
              if (t === 'wallet') setNavTab(t);
              else if (t === 'settings') setActiveTab('tools');
              else Alert.alert('Coming soon', 'Discover ships in v0.5');
            }}
          />
        </View>

        {/* Send Modal */}
        <Modal
          visible={sendModalOpen}
          animationType="slide"
          transparent={false}
          presentationStyle="pageSheet"
          onRequestClose={() => setSendModalOpen(false)}
        >
          <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScreenHeader title="Send" onClose={() => setSendModalOpen(false)} />
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.fastSendRow}>
                  <View style={styles.fastSendLeft}>
                    <View
                      style={[
                        styles.fastDot,
                        { backgroundColor: activeSession ? colors.successText : colors.textSubtle },
                      ]}
                    />
                    <Text style={styles.fastSendLabel}>
                      {activeSession
                        ? `Fast Send · ${Math.max(1, Math.round(activeSession.remainingMs / 60000))}m left`
                        : 'Fast Send off'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={activeSession ? handleEndSession : handleStartSession}
                    disabled={isSessionBusy || !smartWalletPubkey}
                    style={styles.fastSendBtn}
                  >
                    {isSessionBusy ? (
                      <ActivityIndicator color={colors.text} size="small" />
                    ) : (
                      <Text style={styles.fastSendBtnText}>
                        {activeSession ? 'End' : 'Enable'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={styles.fieldLabel}>To</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Recipient address"
                  placeholderTextColor={colors.textSubtle}
                  value={recipient}
                  onChangeText={setRecipient}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <Text style={styles.fieldLabel}>Amount</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="0.00 SOL"
                    placeholderTextColor={colors.textSubtle}
                    value={amount}
                    onChangeText={(text) => setAmount(text.replace(',', '.'))}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.maxBtn}
                    onPress={() => {
                      if (solBalance !== null && solBalance > MIN_SOL_FOR_TX) {
                        const usable = Math.floor((solBalance - MIN_SOL_FOR_TX) * 10000) / 10000;
                        setAmount(usable.toFixed(4));
                      }
                    }}
                  >
                    <Text style={styles.maxBtnText}>Max</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.quickRow}>
                  {QUICK_AMOUNTS.map((qa) => (
                    <TouchableOpacity
                      key={qa}
                      activeOpacity={0.7}
                      style={styles.quickBtn}
                      onPress={() => setAmount(String(qa))}
                    >
                      <Text style={styles.quickBtnText}>{qa} SOL</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ marginTop: spacing.xxl }}>
                  <PrimaryButton
                    label={isSending ? 'Sending...' : 'Send SOL'}
                    onPress={handleSend}
                    loading={isSending}
                    fullWidth
                  />
                </View>

                <Text style={styles.helperText}>
                  No SOL needed for fees · Paymaster sponsors gas · Instant confirmation
                </Text>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>

        {/* Receive Modal */}
        <Modal
          visible={receiveModalOpen}
          animationType="slide"
          transparent={false}
          presentationStyle="pageSheet"
          onRequestClose={() => setReceiveModalOpen(false)}
        >
          <SafeAreaView style={styles.safe}>
            <ScreenHeader title="Receive" onClose={() => setReceiveModalOpen(false)} />
            <View style={styles.receiveBody}>
              <Text style={styles.receiveLabel}>Your address</Text>
              <View style={styles.addressCard}>
                <Text style={styles.addressText}>{fullAddress}</Text>
              </View>
              <PrimaryButton
                label="Copy address"
                onPress={handleCopyAddress}
                icon={<Icon name="copy" size={18} color={colors.white} />}
                fullWidth
                style={{ marginTop: spacing.xl }}
              />
              <Text style={styles.helperText}>
                Send SOL or any SPL token to this address from any Solana wallet.
              </Text>
            </View>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Internal tools-tab row component
function ToolRow({
  title,
  subtitle,
  iconName,
  onPress,
  danger,
}: {
  title: string;
  subtitle: string;
  iconName: any;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.toolRow}>
      <View style={[styles.toolIcon, danger && { backgroundColor: colors.dangerBg }]}>
        <Icon name={iconName} size={20} color={danger ? colors.dangerText : colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toolTitle, danger && { color: colors.dangerText }]}>{title}</Text>
        <Text style={styles.toolSub}>{subtitle}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textSubtle} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: spacing.xxxl,
  },

  devnetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  devnetSub: {
    ...typography.caption,
    flexShrink: 1,
  },

  heroSection: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  heroBalance: {
    ...typography.display,
  },
  heroSub: {
    marginTop: spacing.sm,
  },

  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xxxl,
  },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tab: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  tabActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    ...typography.heading,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.text,
  },

  tokenList: {
    paddingHorizontal: spacing.xl,
  },

  toolsCol: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
  },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTitle: {
    ...typography.heading,
  },
  toolSub: {
    ...typography.caption,
    marginTop: 2,
  },

  // Modals
  modalContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  fastSendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.xl,
  },
  fastSendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fastSendLabel: {
    ...typography.body,
  },
  fastSendBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radii.pill,
  },
  fastSendBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  fieldLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.md,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  maxBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 18,
    backgroundColor: colors.text,
    borderRadius: radii.md,
  },
  maxBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.white,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  quickBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  helperText: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xl,
  },

  receiveBody: {
    padding: spacing.xl,
  },
  receiveLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  addressCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.md,
  },
  addressText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 22,
  },
});
