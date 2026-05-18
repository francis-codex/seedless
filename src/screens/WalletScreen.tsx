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
  StatusBar,
  Image,
} from 'react-native';

const BRAND_LOGO = require('../../assets/icon.png');
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import QRCode from 'react-native-qrcode-svg';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import * as Linking from 'expo-linking';
import { SOLANA_RPC_URL, USDC_MINT, SEED_MINT, SOL_MINT, SEED_DECIMALS, CLUSTER_SIMULATION, IS_DEVNET, MIN_SOL_FOR_TX, QUICK_AMOUNTS, getTxExplorerUrl, isValidSolanaAddress } from '../constants';
import {
  SUPPORTED_TOKENS,
  TOKEN_REGISTRY,
  type Token,
  type TokenSymbol,
  uiAmountToRaw,
} from '../tokens/registry';
import { buildTransferInstructions } from '../tokens/transfer';
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

export function WalletScreen({ onDisconnect, onSwap, onStealth, onBurner, onUmbraDebug, onIka }: WalletScreenProps) {
  const {
    smartWalletPubkey,
    disconnect,
    isSigning,
    createSession,
    signAndSendWithSession,
    signAndSendTransaction,
    revokeSession,
    transferSol,
  } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedTokenSymbol, setSelectedTokenSymbol] = useState<TokenSymbol>('SOL');
  const selectedToken: Token = TOKEN_REGISTRY[selectedTokenSymbol];
  const [isSending, setIsSending] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [isSessionBusy, setIsSessionBusy] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  // Drain mode: when true, MAX fills with the full balance (no rent buffer
  // for SOL). Toggled by tapping MAX a second time within 2s. Resets when the
  // modal closes or the token switches.
  const [drainMode, setDrainMode] = useState(false);
  const maxTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tokens' | 'tools'>('tokens');
  const [navTab, setNavTab] = useState<NavTab>('wallet');
  const [priceChange24h, setPriceChange24h] = useState<{ sol: number | null; usdc: number | null }>({ sol: null, usdc: null });

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

    // Fetch 24h change for SOL + USDC from CoinGecko free tier (SEED isn't listed)
    try {
      const cg = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=usd&include_24hr_change=true',
      );
      if (cg.ok) {
        const data = await cg.json();
        setPriceChange24h({
          sol: typeof data?.solana?.usd_24h_change === 'number' ? data.solana.usd_24h_change : null,
          usdc: typeof data?.['usd-coin']?.usd_24h_change === 'number' ? data['usd-coin'].usd_24h_change : null,
        });
      }
    } catch {
      // keep last known change
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

  // Map a token symbol back to its current UI balance. We keep this inline so
  // the send-flow validation reads against the same numbers the UI shows.
  const balanceForToken = useCallback((token: Token): number => {
    switch (token.symbol) {
      case 'SOL': return solBalance;
      case 'USDC': return usdcBalance;
      case 'SEED': return seedBalance;
      default: return 0;
    }
  }, [solBalance, usdcBalance, seedBalance]);

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

    // Validate amount (against the SELECTED token's decimals + UI shape)
    const rawAmount = uiAmountToRaw(amount, selectedToken);
    if (rawAmount === null) {
      Alert.alert('Invalid amount', 'Enter a valid amount greater than 0');
      return;
    }
    const parsedAmount = Number(rawAmount) / Math.pow(10, selectedToken.decimals);

    // Block send if balance hasn't loaded yet
    if (!hasFetchedRef.current) {
      Alert.alert('Balance not loaded', 'Please wait for your balance to load or tap Refresh before sending.');
      return;
    }

    // Per-token balance validation. SOL has a rent-exempt floor on top so we
    // don't drain the wallet to zero — SPL transfers don't have that floor on
    // the SPL balance itself, but the SENDER still needs a small SOL buffer
    // for the LazorKit smart-wallet rent (Kora sponsors gas).
    const tokenBalance = balanceForToken(selectedToken);
    if (parsedAmount > tokenBalance) {
      Alert.alert('Insufficient balance', `You only have ${tokenBalance.toFixed(selectedToken.decimals === 6 ? 2 : 4)} ${selectedToken.symbol}`);
      return;
    }
    if (selectedToken.isNative) {
      if (!drainMode && parsedAmount > tokenBalance - MIN_SOL_FOR_TX) {
        Alert.alert('Insufficient balance', `You need to keep at least ${MIN_SOL_FOR_TX} SOL for rent. Max you can send: ${(tokenBalance - MIN_SOL_FOR_TX).toFixed(4)} SOL.\n\nTap MAX twice to drain the wallet completely.`);
        return;
      }
      if (drainMode) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Drain wallet?',
            `This will send your entire SOL balance (${tokenBalance.toFixed(4)} SOL) and leave the account at zero. It may go dormant and need to be re-funded to use again.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Drain', style: 'destructive', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!confirmed) return;
      }
    } else if (solBalance < MIN_SOL_FOR_TX) {
      // SPL transfer still touches the sender's wallet for the smart-wallet
      // program; if the wallet itself is below rent-exempt we can't safely
      // route the tx.
      Alert.alert('Need a little SOL', `Send a small amount of SOL (~${MIN_SOL_FOR_TX} SOL) to keep your wallet active before sending tokens.`);
      return;
    }

    setIsSending(true);
    try {
      const redirectUrl = Linking.createURL('sign-callback');
      const txOpts = {
        clusterSimulation: CLUSTER_SIMULATION as 'mainnet' | 'devnet',
      };

      // Re-check the session right before sending so we don't try to use one
      // that just expired between screen mount and tap.
      const session = walletId ? await getActiveSession(walletId) : null;
      if (walletId && !session && activeSession) setActiveSession(null);

      // Build instructions once. The transfer helper handles SOL vs SPL
      // (including ATA creation for the recipient if missing). The ATA payer
      // is set to the sender so the build succeeds even when Kora isn't
      // available — Kora rewrites the fee payer at sign time when it
      // sponsors the tx.
      const { instructions } = await buildTransferInstructions({
        token: selectedToken,
        fromOwner: smartWalletPubkey,
        toOwner: recipientPubkey,
        amount: rawAmount,
        connection,
        ataPayer: smartWalletPubkey,
      });

      let signature: string;
      if (session) {
        // Fast path: ed25519-signed locally, no passkey prompt. Same path
        // for every token — LazorKit's session signer is token-agnostic.
        signature = await signAndSendWithSession({
          sessionKeypair: session.sessionKeypair,
          sessionPda: session.sessionPda,
          instructions,
          transactionOptions: txOpts,
        });
      } else if (selectedToken.isNative) {
        // Slow path for SOL: keep the v2 convenience method so the existing
        // production flow doesn't regress for the most common case.
        signature = await transferSol(
          {
            recipient: recipientPubkey,
            lamports: Number(rawAmount),
            transactionOptions: txOpts,
          },
          { redirectUrl },
        );
      } else {
        // Slow path for SPL: passkey-prompted, generic instructions.
        signature = await signAndSendTransaction(
          {
            instructions,
            transactionOptions: txOpts,
          },
          { redirectUrl },
        );
      }

      const displayAmount = parsedAmount.toLocaleString(undefined, {
        maximumFractionDigits: selectedToken.decimals === 6 ? 2 : 4,
      });
      Alert.alert(
        'Transaction Successful',
        `Sent ${displayAmount} ${selectedToken.symbol} successfully.\n\nTx: ${signature.slice(0, 20)}...`,
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
        friendly = selectedToken.isNative
          ? 'Insufficient balance for this transaction. Make sure you have enough SOL.'
          : `Insufficient balance for this transaction. You need enough ${selectedToken.symbol} to send plus a small SOL buffer for fees.`;
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
        friendly = `Transaction simulation failed. Check your ${selectedToken.symbol} balance and try again.`;
      } else if (msg.toLowerCase().includes('account_not_found') || msg.toLowerCase().includes('could not find account')) {
        friendly = `Your ${selectedToken.symbol} token account is missing. Receive any amount of ${selectedToken.symbol} first to create it, then try sending.`;
      }
      Alert.alert('Failed', friendly);
    } finally {
      setIsSending(false);
    }
  }, [
    smartWalletPubkey, walletId, recipient, amount, selectedToken, drainMode, solBalance,
    activeSession, signAndSendWithSession, signAndSendTransaction, transferSol,
    balanceForToken,
  ]);

  // ============================================================
  // Render — visual layer only (Wells UI). All logic is above.
  // ============================================================

  const totalUsd = solBalance * prices.sol + usdcBalance * prices.usdc + seedBalance * prices.seed;

  // Token list for the Tokens tab — hide zero-balance tokens
  const tokens = useMemo(() => {
    const fmtPrice = (p: number) => (p >= 1 ? `$${p.toFixed(2)}` : `$${p.toFixed(4)}`);
    const list: Array<{
      symbol: string;
      name: string;
      balance: string;
      usdValue: string;
      price: string;
      changePct: number | null;
    }> = [];
    if (solBalance > 0) {
      list.push({
        symbol: 'SOL',
        name: 'Solana',
        balance: `${solBalance.toFixed(4)} SOL`,
        usdValue: `$${(solBalance * prices.sol).toFixed(2)}`,
        price: fmtPrice(prices.sol),
        changePct: priceChange24h.sol,
      });
    }
    if (usdcBalance > 0) {
      list.push({
        symbol: 'USDC',
        name: 'USD Coin',
        balance: `${usdcBalance.toFixed(2)} USDC`,
        usdValue: `$${(usdcBalance * prices.usdc).toFixed(2)}`,
        price: fmtPrice(prices.usdc),
        changePct: priceChange24h.usdc,
      });
    }
    if (seedBalance > 0) {
      list.push({
        symbol: 'SEED',
        name: 'Seedless',
        balance: `${seedBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} SEED`,
        usdValue: `$${(seedBalance * prices.seed).toFixed(2)}`,
        price: prices.seed > 0 ? fmtPrice(prices.seed) : '—',
        changePct: null,
      });
    }
    return list;
  }, [solBalance, usdcBalance, seedBalance, prices, priceChange24h]);

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
          title="Private mode"
          subtitle="Send and receive privately on Solana"
          iconName="lock"
          onPress={onUmbraDebug}
        />
      )}
      {/* Multi-chain (Ika) — hidden until Ika ships mainnet; re-enable for demos */}
      {false && onIka && (
        <ToolRow
          title="Multi-chain"
          subtitle="Sign Ethereum from your passkey via Ika"
          iconName="lightning"
          onPress={onIka!}
        />
      )}
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
              onMenuPress={() => setDrawerOpen(true)}
              onScanPress={() => Alert.alert('Coming soon', 'QR scanning ships in v0.5')}
            />

            {IS_DEVNET && (
              <View style={styles.devnetBanner}>
                <Pill label="DEVNET BETA" variant="warning" size="md" />
              </View>
            )}

            {/* Balance hero — tap to toggle hide/show */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={togglePrivacyMode}
              style={styles.heroSection}
            >
              <Text style={styles.heroBalance}>
                {isPrivateMode ? '••••' : `$${totalUsd.toFixed(2)}`}
              </Text>
              {balanceError && !isPrivateMode ? (
                <Text style={styles.heroError}>{balanceError}</Text>
              ) : isLoadingBalance && !hasFetchedRef.current ? (
                <ActivityIndicator color={colors.textMuted} size="small" style={{ marginTop: spacing.sm }} />
              ) : null}
            </TouchableOpacity>

            {/* Action row — Send + Receive only (bigger, Jupiter-style) */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.bigAction}
                onPress={() => setSendModalOpen(true)}
              >
                <Icon name="send" size={22} color={colors.text} strokeWidth={2} />
                <Text style={styles.bigActionLabel}>Send</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.bigAction}
                onPress={() => setReceiveModalOpen(true)}
              >
                <Icon name="arrowDown" size={22} color={colors.text} strokeWidth={2} />
                <Text style={styles.bigActionLabel}>Receive</Text>
              </TouchableOpacity>
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
                {tokens.length === 0 ? (
                  <View style={styles.emptyTokens}>
                    <Text style={styles.emptyTokensText}>No tokens yet</Text>
                    <Text style={styles.emptyTokensHint}>Tap Receive to fund this wallet.</Text>
                  </View>
                ) : (
                  tokens.map((t) => (
                    <View key={t.symbol} style={styles.tokenCard}>
                      <TokenRow
                        symbol={t.symbol}
                        name={t.name}
                        balance={isPrivateMode ? '••••' : t.balance}
                        usdValue={isPrivateMode ? '••••' : t.usdValue}
                        price={t.price}
                        changePct={t.changePct}
                      />
                    </View>
                  ))
                )}
              </View>
            ) : (
              renderToolsTab()
            )}
          </ScrollView>

          <BottomNav
            active={navTab}
            onChange={(t) => {
              if (t === 'wallet') {
                setNavTab('wallet');
                setActiveTab('tokens');
              } else if (t === 'swap') {
                onSwap?.();
              } else if (t === 'settings') {
                setNavTab('settings');
                setActiveTab('tools');
              }
            }}
          />
        </View>

        {/* Wallet Drawer */}
        <Modal
          visible={drawerOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setDrawerOpen(false)}
        >
          <View style={styles.drawerScrim}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setDrawerOpen(false)}
              style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={styles.drawerSheet}>
              <View style={styles.drawerHandle} />
              <View style={styles.drawerHead}>
                <Image source={BRAND_LOGO} style={styles.drawerAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.drawerName}>Wallet 01</Text>
                  <Text style={styles.drawerAddr}>{shortAddress || '...'}</Text>
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.drawerRow}
                onPress={async () => {
                  await handleCopyAddress();
                }}
              >
                <View style={[styles.drawerIcon, { backgroundColor: colors.surface }]}>
                  <Icon name="copy" size={20} color={colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.drawerRowTitle}>Copy address</Text>
                  <Text style={styles.drawerRowSub} numberOfLines={1}>{fullAddress}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.drawerRow}
                onPress={() => {
                  setDrawerOpen(false);
                  setTimeout(() => setReceiveModalOpen(true), 250);
                }}
              >
                <View style={[styles.drawerIcon, { backgroundColor: colors.surface }]}>
                  <Icon name="qr" size={20} color={colors.text} />
                </View>
                <Text style={styles.drawerRowTitle}>Show QR code</Text>
              </TouchableOpacity>

              <View style={{ flex: 1 }} />

              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.drawerRow, styles.drawerDanger]}
                onPress={() => {
                  setDrawerOpen(false);
                  setTimeout(() => handleDisconnect(), 200);
                }}
              >
                <View style={[styles.drawerIcon, { backgroundColor: colors.dangerBg }]}>
                  <Icon name="close" size={20} color={colors.dangerText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.drawerRowTitle, { color: colors.dangerText }]}>Disconnect</Text>
                  <Text style={styles.drawerRowSub}>Sign out of this wallet</Text>
                </View>
              </TouchableOpacity>
            </SafeAreaView>
          </View>
        </Modal>

        {/* Send Modal */}
        <Modal
          visible={sendModalOpen}
          animationType="slide"
          transparent={false}
          presentationStyle="pageSheet"
          onRequestClose={() => {
            setSendModalOpen(false);
            setDrainMode(false);
          }}
        >
          <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScreenHeader
                title="Send"
                onClose={() => {
                  setSendModalOpen(false);
                  setDrainMode(false);
                }}
              />
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

                <Text style={styles.fieldLabel}>Token</Text>
                <View style={styles.tokenPickerRow}>
                  {SUPPORTED_TOKENS.map((t) => {
                    const selected = t.symbol === selectedTokenSymbol;
                    const bal = balanceForToken(t);
                    return (
                      <TouchableOpacity
                        key={t.symbol}
                        activeOpacity={0.7}
                        style={[styles.tokenChip, selected && styles.tokenChipSelected]}
                        onPress={() => {
                          setSelectedTokenSymbol(t.symbol);
                          // Clear any in-flight amount so the new token's decimals don't trip validation.
                          setAmount('');
                          // Drain mode is SOL-specific — leave it when switching off SOL.
                          if (t.symbol !== 'SOL') setDrainMode(false);
                        }}
                      >
                        <Text style={[styles.tokenChipSymbol, selected && styles.tokenChipSymbolSelected]} numberOfLines={1}>{t.symbol}</Text>
                        <Text
                          style={[styles.tokenChipBalance, selected && styles.tokenChipBalanceSelected]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {bal.toLocaleString(undefined, { maximumFractionDigits: t.decimals === 6 ? 2 : 4 })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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
                    placeholder={`0.00 ${selectedToken.symbol}`}
                    placeholderTextColor={colors.textSubtle}
                    value={amount}
                    onChangeText={(text) => setAmount(text.replace(',', '.'))}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[styles.maxBtn, drainMode && styles.maxBtnDrain]}
                    onPress={() => {
                      const bal = balanceForToken(selectedToken);
                      // Second tap within the window toggles drain mode for SOL.
                      // SPL tokens have no rent buffer concept, so the second
                      // tap is a no-op and we keep them in normal-max state.
                      const isSecondTap = maxTapTimerRef.current !== null;
                      if (maxTapTimerRef.current) {
                        clearTimeout(maxTapTimerRef.current);
                        maxTapTimerRef.current = null;
                      }
                      if (selectedToken.isNative) {
                        if (isSecondTap && !drainMode) {
                          // Engage drain: full balance, no rent buffer.
                          setDrainMode(true);
                          if (bal > 0) {
                            setAmount(bal.toFixed(9));
                          }
                        } else {
                          setDrainMode(false);
                          if (bal > MIN_SOL_FOR_TX) {
                            const usable = Math.floor((bal - MIN_SOL_FOR_TX) * 10000) / 10000;
                            setAmount(usable.toFixed(4));
                          }
                          maxTapTimerRef.current = setTimeout(() => {
                            maxTapTimerRef.current = null;
                          }, 2000);
                        }
                      } else if (bal > 0) {
                        // SPL: no rent floor on the SPL balance itself.
                        setDrainMode(false);
                        const digits = selectedToken.decimals === 6 ? 2 : 4;
                        const truncated = Math.floor(bal * Math.pow(10, digits)) / Math.pow(10, digits);
                        setAmount(truncated.toFixed(digits));
                      }
                    }}
                  >
                    <Text style={styles.maxBtnText}>{drainMode ? 'Drain' : 'Max'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ marginTop: spacing.xxl }}>
                  <PrimaryButton
                    label={isSending ? 'Sending...' : `Send ${selectedToken.symbol}`}
                    onPress={handleSend}
                    loading={isSending}
                    fullWidth
                  />
                </View>

                {drainMode && selectedToken.isNative ? (
                  <Text style={styles.drainCaption}>
                    Draining wallet — sending entire SOL balance. The account may go dormant after this and need to be re-funded.
                  </Text>
                ) : null}

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
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.receiveBody} showsVerticalScrollIndicator={false}>
              {fullAddress ? (
                <View style={styles.qrFrame}>
                  <QRCode
                    value={fullAddress}
                    size={220}
                    backgroundColor={colors.white}
                    color={colors.text}
                  />
                </View>
              ) : null}
              <View style={styles.addressCard}>
                <Text style={styles.addressText}>{fullAddress}</Text>
              </View>
              <PrimaryButton
                label="Copy address"
                onPress={handleCopyAddress}
                icon={<Icon name="copy" size={18} color={colors.white} />}
                fullWidth
              />
            </ScrollView>
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

  heroSection: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  heroBalance: {
    fontSize: 56,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -1.6,
    textAlign: 'center',
  },
  heroError: {
    ...typography.caption,
    color: colors.dangerText,
    marginTop: spacing.sm,
  },

  emptyTokens: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    gap: 4,
  },
  emptyTokensText: {
    ...typography.heading,
  },
  emptyTokensHint: {
    ...typography.caption,
  },

  // Wallet drawer
  drawerScrim: {
    flex: 1,
    backgroundColor: 'rgba(11, 37, 69, 0.5)',
    justifyContent: 'flex-end',
  },
  drawerSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    minHeight: 380,
  },
  drawerHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  drawerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  drawerName: {
    ...typography.title,
    fontSize: 20,
  },
  drawerAddr: {
    ...typography.caption,
    marginTop: 2,
  },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  drawerDanger: {
    backgroundColor: colors.dangerBg,
    marginBottom: 0,
  },
  drawerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerRowTitle: {
    ...typography.body,
    fontWeight: '600' as const,
  },
  drawerRowSub: {
    ...typography.caption,
    marginTop: 2,
  },

  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xxxl,
    gap: spacing.md,
    justifyContent: 'center',
  },
  bigAction: {
    width: 96,
    height: 84,
    backgroundColor: colors.surface,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(11,37,69,0.04)',
  },
  bigActionLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
    letterSpacing: -0.2,
  },
  tokenCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 4,
    marginBottom: spacing.sm,
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
  tokenPickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tokenChip: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  tokenChipSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  tokenChipSymbol: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  tokenChipSymbolSelected: {
    color: colors.white,
  },
  tokenChipBalance: {
    fontSize: 11,
    color: colors.textSubtle,
    marginTop: 2,
  },
  tokenChipBalanceSelected: {
    color: colors.white,
    opacity: 0.7,
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
  maxBtnDrain: {
    backgroundColor: colors.dangerText,
  },
  drainCaption: {
    marginTop: spacing.md,
    fontSize: 12,
    color: colors.dangerText,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 16,
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
    paddingTop: spacing.lg,
    alignItems: 'center',
    gap: spacing.lg,
  },
  qrFrame: {
    backgroundColor: colors.white,
    padding: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.md,
    width: '100%',
  },
  addressText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
});
