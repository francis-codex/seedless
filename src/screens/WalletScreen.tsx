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
import { consumeSendSlot } from '../utils/sendRateLimit';
import { DEFAULT_WALLET_LABEL, getWalletLabel, setWalletLabel } from '../utils/walletLabel';
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
  PrimaryButton,
} from '../components/ui';
import { usePrivateMode } from '../hooks/usePrivateMode';
import type { FundSignerFn } from '../umbra/auto-setup';

interface WalletScreenProps {
  onDisconnect: () => void;
  onSwap?: () => void;
  onStealth?: () => void;
  onBurner?: () => void;
  onIka?: () => void;
}

// Shared singleton connections — see src/utils/connection.ts
import { connection, fallbackConnection } from '../utils/connection';

export function WalletScreen({ onDisconnect, onSwap, onStealth, onBurner, onIka }: WalletScreenProps) {
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
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  // Private mode UI state. `sendPrivately` is the toggle inside the send
  // modal; `privateSheetOpen` is the mini sheet that opens from the header
  // when the user taps their private balance line.
  // `setupExplainerOpen` + `pendingPrivateSend` gate the first-time setup
  // explainer that runs before any heavy passkey work, so granma sees a
  // friendly prompt before the Face ID screen shows an unfamiliar address.
  const [sendPrivately, setSendPrivately] = useState(false);
  const [privateSheetOpen, setPrivateSheetOpen] = useState(false);
  const [setupExplainerOpen, setSetupExplainerOpen] = useState(false);
  const [pendingPrivateSend, setPendingPrivateSend] = useState<{ recipient: string; amount: number } | null>(null);
  // Per-button loading flags so tapping one button only spins that button,
  // not both. Sharing `privateMode.status === 'busy'` made both spin together.
  const [isCheckingIncoming, setIsCheckingIncoming] = useState(false);
  const [isMovingToPublic, setIsMovingToPublic] = useState(false);
  const privateMode = usePrivateMode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tokens' | 'tools'>('tokens');
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

  // User-renameable wallet label. Loaded from SecureStore per-pubkey on mount.
  const [walletLabel, setWalletLabelState] = useState<string>(DEFAULT_WALLET_LABEL);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  useEffect(() => {
    if (!walletId) {
      setWalletLabelState(DEFAULT_WALLET_LABEL);
      return;
    }
    let cancelled = false;
    getWalletLabel(walletId).then((label) => {
      if (!cancelled) setWalletLabelState(label);
    });
    return () => {
      cancelled = true;
    };
  }, [walletId]);

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

  // ============================================================
  // Private mode bridge — declared BEFORE handleSend because the public-send
  // path branches into handlePrivateSend when the user toggles "Send privately".
  // ============================================================

  // fundSigner: bridge that lets the Umbra hook ask us to send SOL from the
  // smart wallet to the user's throwaway umbra signer. Reuses v2 `transferSol`
  // (passkey-prompted) so the user sees one prompt → SOL lands on signer →
  // registration proceeds.
  const fundSigner = useCallback<FundSignerFn>(async (signerAddress, lamports) => {
    const signature = await transferSol(
      {
        recipient: new PublicKey(signerAddress),
        lamports,
      },
      { redirectUrl: Linking.createURL('lazor-callback') },
    );
    return signature;
  }, [transferSol]);

  // Private send via Umbra. Returns the send result so handleSend can decide
  // whether to fall through to the public-send flow when the recipient isn't
  // registered and the user consents to a public-fallback send.
  const handlePrivateSend = useCallback(async (
    recipientAddr: string,
    amountSol: number,
  ) => {
    if (!smartWalletPubkey) throw new Error('Wallet not connected');
    if (privateMode.status === 'unregistered') {
      await privateMode.setUp(fundSigner);
    }
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    return privateMode.privateSend({
      destination: recipientAddr,
      lamports,
      fundSigner,
      onDegradationRequested: async ({ recipient: rcp }) => new Promise<boolean>((resolve) => {
        Alert.alert(
          'Recipient is not on private mode',
          `${rcp.slice(0, 6)}…${rcp.slice(-4)} hasn't set up private mode yet, so this send can't stay encrypted. Send it as a normal public transfer instead?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Send publicly', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    });
  }, [smartWalletPubkey, privateMode, fundSigner]);

  // Confirmed first-time setup: user tapped "Set up" in the explainer sheet,
  // so we now run the same private-send path that handleSend's main branch
  // would have run for a returning user. Heavy work fires here, with a clean
  // mental model for the user (they just opted in).
  const handleConfirmFirstTimePrivateSetup = useCallback(async () => {
    const pending = pendingPrivateSend;
    if (!pending) return;
    setSetupExplainerOpen(false);
    setIsSending(true);
    try {
      const result = await handlePrivateSend(pending.recipient, pending.amount);
      if (result.mode === 'umbra-encrypted') {
        Alert.alert(
          'Sent privately',
          `Sent ${pending.amount.toFixed(4)} SOL privately. The amount and recipient stay hidden on chain.`,
        );
        setRecipient('');
        setAmount('');
        setSendPrivately(false);
        setSendModalOpen(false);
        setTimeout(() => handleRefresh(), 2000);
      } else {
        // Recipient unregistered + user consented to public fallback in the
        // degradation dialog. Honour that consent and route through the
        // normal public-send path (same as if "Send privately" were off).
        const lamports = Math.floor(pending.amount * LAMPORTS_PER_SOL);
        const sig = await transferSol(
          {
            recipient: new PublicKey(pending.recipient),
            lamports,
          },
          { redirectUrl: Linking.createURL('sign-callback') },
        );
        Alert.alert(
          'Sent publicly',
          `Sent ${pending.amount.toFixed(4)} SOL to ${pending.recipient.slice(0, 6)}…${pending.recipient.slice(-4)} as a normal public transfer (recipient wasn't on private mode).\n\nTx: ${sig.slice(0, 20)}…`,
        );
        setRecipient('');
        setAmount('');
        setSendPrivately(false);
        setSendModalOpen(false);
        setTimeout(() => handleRefresh(), 2000);
      }
    } catch (err: any) {
      if (err?.name === 'PrivateSendFromMainDeclined') {
        Alert.alert('Private send cancelled', 'No funds moved.');
      } else {
        Alert.alert('Failed', err?.message ?? 'Could not set up private mode.');
      }
    } finally {
      setPendingPrivateSend(null);
      setIsSending(false);
    }
  }, [pendingPrivateSend, handlePrivateSend, handleRefresh, transferSol]);

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
    // SPL transfers are fully gasless end-to-end via Kora when the recipient
    // already has an ATA for the token. If they don't, the SENDER funds the
    // ATA-creation rent (~0.002 SOL), which is the actual reason for the
    // SOL-balance gate. Skipping the gate when no ATA needs creating is what
    // lets a zero-SOL wallet actually send USDC to a wallet that already
    // holds USDC — the previous blanket gate broke that case.
    if (!selectedToken.isNative) {
      let recipientNeedsAta = false;
      try {
        const mint = new PublicKey(selectedToken.mint);
        const toAta = await getAssociatedTokenAddress(mint, recipientPubkey, true);
        const ataInfo = await connection.getAccountInfo(toAta);
        recipientNeedsAta = !ataInfo;
      } catch {
        // Conservative on RPC hiccup: assume an ATA may need creating so we
        // gate rather than ship a tx that could fail on chain.
        recipientNeedsAta = true;
      }
      if (recipientNeedsAta && solBalance < MIN_SOL_FOR_TX) {
        Alert.alert(
          'Just a tiny bit of SOL',
          `This is the first ${selectedToken.symbol} payment to this address — a small one-time account (~0.002 SOL) needs to be set up for the recipient. Add ~${MIN_SOL_FOR_TX} SOL to your wallet and try again.`,
        );
        return;
      }
    }

    setIsSending(true);
    try {
      // === PRIVATE SEND PATH ===
      // Routes through Umbra's encrypted UTXO flow when the user has flipped
      // the "Send privately" toggle on the send modal. Only available for SOL
      // in this MVP; the toggle is hidden for other tokens until mainnet
      // multi-mint support is confirmed.
      if (sendPrivately && selectedToken.isNative) {
        // First-time setup explainer: if the user has never used private mode,
        // pause the send and show a friendly sheet explaining the ~0.02 SOL
        // one-time setup BEFORE the passkey prompt (which would otherwise
        // show an unfamiliar destination address and confuse them).
        if (privateMode.status === 'idle' || privateMode.status === 'unregistered') {
          setPendingPrivateSend({ recipient: recipient.trim(), amount: parsedAmount });
          setSetupExplainerOpen(true);
          setIsSending(false);
          return;
        }
        try {
          const result = await handlePrivateSend(recipient.trim(), parsedAmount);
          if (result.mode === 'umbra-encrypted') {
            Alert.alert(
              'Sent privately',
              `Sent ${parsedAmount.toFixed(4)} SOL privately. The amount and recipient stay hidden on chain.`,
              [{ text: 'OK' }],
            );
            setRecipient('');
            setAmount('');
            setSendPrivately(false);
            setSendModalOpen(false);
            setTimeout(() => handleRefresh(), 2000);
            return;
          }
          // mode === 'fallback-public' means the user consented to a public
          // send (recipient wasn't registered). Fall through to the normal
          // path so the existing handler does the actual transfer.
        } catch (err: any) {
          if (err?.name === 'PrivateSendFromMainDeclined') {
            Alert.alert('Private send cancelled', 'No funds moved.');
            setIsSending(false);
            return;
          }
          // Unknown private-send error → fall through and try public.
          console.warn('[private-send] failed, attempting public fallback:', err?.message ?? err);
        }
      }

      // Per-wallet rate limit on Kora-sponsored sends. Reserve a slot before
      // firing — submitting is what costs the relayer. Caps one wallet at
      // 5 sends/min so a leaked paymaster key (reused on a single wallet)
      // can't spam Kora. See src/utils/sendRateLimit.ts.
      const slot = await consumeSendSlot(smartWalletPubkey.toBase58());
      if (!slot.allowed) {
        const secs = Math.ceil((slot.retryAfterMs ?? 0) / 1000);
        Alert.alert('Slow down a sec', `You've hit the limit of 5 sends per minute. Try again in ${secs}s.`);
        setIsSending(false);
        return;
      }

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
    smartWalletPubkey, walletId, recipient, amount, selectedToken, solBalance,
    activeSession, signAndSendWithSession, signAndSendTransaction, transferSol,
    balanceForToken, sendPrivately, handlePrivateSend,
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
      {/* Private mode — opens the granma-friendly mini sheet (balance +
          claim incoming + move back to public). The legacy full-debug
          surface is archived under src/screens/_archive and is NOT exposed
          anywhere in the UI. */}
      <ToolRow
        title="Private mode"
        subtitle="Send and receive privately on Solana"
        iconName="lock"
        onPress={() => setPrivateSheetOpen(true)}
      />
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
              <View style={styles.heroBalanceRow}>
                <Text style={styles.heroBalance}>
                  {isPrivateMode ? '••••' : `$${totalUsd.toFixed(2)}`}
                </Text>
                <Icon
                  name={isPrivateMode ? 'eyeOff' : 'eye'}
                  size={20}
                  color={colors.textMuted}
                  strokeWidth={2}
                />
              </View>
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
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.drawerNameRow}
                    onPress={() => {
                      setRenameDraft(walletLabel);
                      setDrawerOpen(false);
                      setTimeout(() => setRenameOpen(true), 250);
                    }}
                  >
                    <Text style={styles.drawerName} numberOfLines={1}>{walletLabel}</Text>
                    <Text style={styles.drawerNameHint}>Tap to rename</Text>
                  </TouchableOpacity>
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

        {/* Rename wallet modal */}
        <Modal
          visible={renameOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setRenameOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.renameOverlay}
          >
            <View style={styles.renameCard}>
              <Text style={styles.renameTitle}>Rename wallet</Text>
              <TextInput
                style={styles.renameInput}
                value={renameDraft}
                onChangeText={setRenameDraft}
                placeholder="Wallet 01"
                placeholderTextColor={colors.textSubtle}
                autoFocus
                autoCapitalize="words"
                maxLength={40}
              />
              <View style={styles.renameActions}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.renameCancel}
                  onPress={() => setRenameOpen(false)}
                >
                  <Text style={styles.renameCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.renameSave}
                  onPress={async () => {
                    const next = renameDraft.trim() || DEFAULT_WALLET_LABEL;
                    if (walletId) {
                      await setWalletLabel(walletId, next);
                    }
                    setWalletLabelState(next);
                    setRenameOpen(false);
                  }}
                >
                  <Text style={styles.renameSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Send Modal */}
        <Modal
          visible={sendModalOpen}
          animationType="slide"
          transparent={false}
          presentationStyle="pageSheet"
          // No auto-probe on send-modal open. The heavy Umbra client build
          // only runs when the user actively flips "Send privately" and taps
          // Send — at that point handlePrivateSend will lazily build the
          // client itself. Keeps the modal-open animation snappy.
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
                    style={styles.maxBtn}
                    onPress={() => {
                      // Max means max — full balance, no rent buffer, no
                      // confirmation. Kora sponsors the gas, so a SOL drain
                      // doesn't need a fee reserve either. If the user wants
                      // to leave a buffer they can type the amount manually.
                      const bal = balanceForToken(selectedToken);
                      if (bal <= 0) return;
                      if (selectedToken.isNative) {
                        setAmount(bal.toFixed(9));
                      } else {
                        const digits = selectedToken.decimals === 6 ? 2 : 4;
                        const truncated = Math.floor(bal * Math.pow(10, digits)) / Math.pow(10, digits);
                        setAmount(truncated.toFixed(digits));
                      }
                    }}
                  >
                    <Text style={styles.maxBtnText}>Max</Text>
                  </TouchableOpacity>
                </View>

                {/* Send privately toggle — SOL only for MVP. Hidden for other
                    tokens until Umbra mainnet confirms multi-mint support. */}
                {selectedToken.isNative ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setSendPrivately((v) => !v)}
                    style={[
                      styles.privateToggleRow,
                      sendPrivately && { borderWidth: 1, borderColor: colors.accent },
                    ]}
                  >
                    <View style={styles.privateToggleLabel}>
                      <Icon name="lock" size={16} color={sendPrivately ? colors.accent : colors.textMuted} strokeWidth={2} />
                      <View style={styles.privateToggleTextWrap}>
                        <Text style={styles.privateToggleText}>Send privately</Text>
                        <Text style={styles.privateToggleHint} numberOfLines={2}>
                          {sendPrivately ? 'Encrypted via Umbra' : 'Hide this send on-chain'}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        width: 44,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: sendPrivately ? colors.accent : colors.textSubtle,
                        justifyContent: 'center',
                        paddingHorizontal: 3,
                        flexShrink: 0,
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: colors.white,
                          alignSelf: sendPrivately ? 'flex-end' : 'flex-start',
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                ) : null}

                <View style={{ marginTop: spacing.xxl }}>
                  <PrimaryButton
                    label={isSending ? (sendPrivately ? 'Sending privately…' : 'Sending...') : (sendPrivately ? `Send ${selectedToken.symbol} privately` : `Send ${selectedToken.symbol}`)}
                    onPress={handleSend}
                    loading={isSending}
                    fullWidth
                  />
                </View>

                <Text style={styles.helperText}>
                  {sendPrivately
                    ? 'One-time setup happens automatically on first private send. Costs about 0.02 SOL once for network fees.'
                    : selectedToken.isNative
                      ? 'Paymaster sponsors gas · No SOL needed · Instant confirmation'
                      : 'Paymaster sponsors gas · Tiny SOL only if recipient is new'}
                </Text>
              </ScrollView>
            </KeyboardAvoidingView>

            {/* First-time private-send explainer — rendered as an absolute
                overlay INSIDE the send modal's SafeArea rather than a nested
                Modal. iOS doesn't support presenting one RCTFabricModal on
                top of another, so the previous nested-Modal approach worked
                visually but emitted a "Attempt to present...already
                presenting" UIKit warning. This overlay is pure RN view —
                no native modal layer, no warning. */}
            {setupExplainerOpen ? (
              <View style={styles.explainerInlineOverlay} pointerEvents="auto">
                <TouchableOpacity
                  activeOpacity={1}
                  style={{ flex: 1 }}
                  onPress={() => {
                    setSetupExplainerOpen(false);
                    setPendingPrivateSend(null);
                  }}
                />
                <View style={styles.privateSheet}>
                  <View style={styles.privateSheetHandle} />
                  <View style={styles.privateSheetHeader}>
                    <Icon name="lock" size={28} color={colors.accent} strokeWidth={2} />
                    <Text style={styles.privateSheetTitle}>Set up private mode</Text>
                  </View>

                  <Text style={[styles.helperText, { textAlign: 'center', lineHeight: 20 }]}>
                    Your first private send needs a one-time setup. We'll move about 0.02 SOL into your private account for network fees and rent. After this, every private send takes one tap.
                  </Text>

                  <Text style={[styles.helperText, { textAlign: 'center', color: colors.textSubtle, marginTop: -spacing.sm }]}>
                    Sending {pendingPrivateSend?.amount.toFixed(4) ?? '0'} SOL privately to {pendingPrivateSend?.recipient ? `${pendingPrivateSend.recipient.slice(0, 6)}…${pendingPrivateSend.recipient.slice(-4)}` : ''}
                  </Text>

                  <PrimaryButton
                    label={privateMode.status === 'setting-up' || isSending ? 'Setting up…' : 'Set up and send'}
                    onPress={handleConfirmFirstTimePrivateSetup}
                    loading={privateMode.status === 'setting-up' || isSending}
                    fullWidth
                  />

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setSetupExplainerOpen(false);
                      setPendingPrivateSend(null);
                    }}
                    style={{ alignItems: 'center', paddingVertical: spacing.sm }}
                  >
                    <Text style={[styles.helperText, { color: colors.textMuted }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
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
                    backgroundColor="#FFFFFF"
                    color="#000000"
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

        {/* Private balance mini sheet — opened from the "Private: X SOL" line
            in the wallet header. Surfaces the encrypted balance + the two
            actions a user actually needs: claim incoming + move back to public.
            "Send privately" lives in the main send modal, not here. */}
        <Modal
          visible={privateSheetOpen}
          animationType="slide"
          transparent
          onShow={() => {
            // Sheet opens INSTANTLY with the cached balance. After the slide
            // animation settles (~500ms), kick off a one-time background
            // refresh so the displayed balance reflects on-chain reality
            // instead of a stale SecureStore value. The Umbra client build
            // is heavy, but deferring 500ms lets the sheet paint first and
            // keeps the JS-thread freeze off the critical interaction path.
            setTimeout(() => {
              if (privateMode.status !== 'busy' && privateMode.status !== 'setting-up') {
                privateMode.refreshDeep();
              }
            }, 500);
          }}
          onDismiss={() => privateMode.setIncomingPollEnabled(false)}
          onRequestClose={() => {
            privateMode.setIncomingPollEnabled(false);
            setPrivateSheetOpen(false);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.privateSheetOverlay}
            onPress={() => setPrivateSheetOpen(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.privateSheet}>
              <View style={styles.privateSheetHandle} />
              <View style={styles.privateSheetHeader}>
                <Text style={styles.privateSheetTitle}>Private balance</Text>
                {privateMode.status === 'loading' || privateMode.status === 'setting-up' ? (
                  <ActivityIndicator color={colors.textMuted} size="small" style={{ marginTop: spacing.sm }} />
                ) : (
                  <Text style={styles.privateSheetBalance}>
                    {privateMode.privateBalanceSol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL
                  </Text>
                )}
              </View>

              {privateMode.incoming.count > 0 ? (
                <View style={styles.privateSheetIncoming}>
                  <Text style={styles.privateSheetIncomingText}>
                    {privateMode.incoming.count} new private payment{privateMode.incoming.count === 1 ? '' : 's'}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={async () => {
                      try {
                        await privateMode.claimIncoming();
                        Alert.alert('Claimed', 'New private payments are now in your private balance.');
                      } catch (err: any) {
                        Alert.alert('Failed', err?.message ?? 'Could not claim incoming payments.');
                      }
                    }}
                  >
                    <Text style={[styles.privateSheetIncomingText, { textDecorationLine: 'underline' }]}>Claim</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <PrimaryButton
                label={isCheckingIncoming ? 'Checking…' : 'Check for new payments'}
                onPress={async () => {
                  if (isCheckingIncoming) return;
                  setIsCheckingIncoming(true);
                  try {
                    await privateMode.refreshIncoming();
                  } catch (err: any) {
                    Alert.alert('Failed', err?.message ?? 'Could not check incoming payments.');
                  } finally {
                    setIsCheckingIncoming(false);
                  }
                }}
                loading={isCheckingIncoming}
                fullWidth
              />

              <PrimaryButton
                label={isMovingToPublic ? 'Moving…' : 'Move all to public'}
                onPress={async () => {
                  if (isMovingToPublic) return;
                  if (!smartWalletPubkey || privateMode.privateBalanceLamports === 0n) return;
                  setIsMovingToPublic(true);
                  try {
                    // moveAllToPublic does the full pipeline:
                    //   1. SDK withdraw → signer's wSOL ATA
                    //   2. close wSOL ATA → unwraps native SOL to smart wallet
                    await privateMode.moveAllToPublic(smartWalletPubkey.toBase58());
                    Alert.alert('Moved to public', 'Your private balance is now back in your main wallet.');
                    setTimeout(() => handleRefresh(), 2000);
                  } catch (err: any) {
                    // Branch by the actual error rather than blanket-mapping
                    // every failure to "v4↔v11 mismatch". A real bug
                    // (network drop, balance gone, key issue) deserves the
                    // truth, not a friendly lie.
                    const raw = String(err?.message ?? '') + ' ' + String(err?.cause?.message ?? '');
                    const causeLogs = err?.cause?.context?.logs;
                    const logStr = Array.isArray(causeLogs) ? causeLogs.join(' ') : '';
                    const isV4V11Mismatch =
                      raw.includes('InstructionFallbackNotFound') ||
                      raw.includes('0x65') ||
                      raw.includes('Error Number: 101') ||
                      logStr.includes('InstructionFallbackNotFound');
                    if (isV4V11Mismatch) {
                      Alert.alert(
                        'Withdrawal temporarily unavailable',
                        'Private withdrawals are paused while we sync with an Umbra mainnet program update. Your encrypted balance is safe and will be withdrawable in the next build.',
                      );
                    } else {
                      Alert.alert('Failed', String(err?.message ?? 'Could not move funds to public.'));
                    }
                  } finally {
                    setIsMovingToPublic(false);
                  }
                }}
                loading={isMovingToPublic}
                fullWidth
              />

              <Text style={[styles.helperText, { textAlign: 'center' }]}>
                Encrypted balance held privately via Umbra. Only you can decrypt it.
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
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

  heroBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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

  // Private balance pill — small inline row sitting between the hero balance
  // and the Send/Receive action row. Visually understated so it never
  // competes with the main USD figure for attention.
  privateBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
  },
  privateBalanceText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600' as const,
  },
  privateBalanceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.successText,
    marginLeft: 2,
  },
  // Private-send toggle row inside the send modal — sits below Amount,
  // above the Send button. Matches the existing fast-send row visual.
  privateToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
  },
  privateToggleLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: spacing.md,
  },
  privateToggleTextWrap: {
    flex: 1,
    flexShrink: 1,
  },
  privateToggleText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600' as const,
  },
  privateToggleHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Inline (in-modal) explainer overlay. Absolute-positioned so it covers
  // the send modal's content without spawning a second native modal layer.
  explainerInlineOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  // Mini sheet styles
  privateSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  privateSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  privateSheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.textSubtle,
    borderRadius: 2,
    alignSelf: 'center',
    opacity: 0.4,
  },
  privateSheetHeader: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  privateSheetTitle: {
    ...typography.heading,
  },
  privateSheetBalance: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -1,
  },
  privateSheetIncoming: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.successBg,
    borderRadius: radii.md,
  },
  privateSheetIncomingText: {
    ...typography.body,
    color: colors.successText,
    fontWeight: '600' as const,
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
  drawerNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  drawerName: {
    ...typography.title,
    fontSize: 20,
  },
  drawerNameHint: {
    fontSize: 11,
    color: colors.textSubtle,
  },
  renameOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  renameCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  renameTitle: {
    ...typography.heading,
    marginBottom: spacing.xs,
  },
  renameInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  renameActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  renameCancel: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  renameSave: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.solid,
    alignItems: 'center',
  },
  renameCancelText: {
    color: colors.text,
    fontWeight: '600' as const,
  },
  renameSaveText: {
    color: colors.onSolid,
    fontWeight: '600' as const,
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
    backgroundColor: colors.surface,
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
    backgroundColor: colors.solid,
    borderColor: colors.solid,
  },
  tokenChipSymbol: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  tokenChipSymbolSelected: {
    color: colors.onSolid,
  },
  tokenChipBalance: {
    fontSize: 11,
    color: colors.textSubtle,
    marginTop: 2,
  },
  tokenChipBalanceSelected: {
    color: colors.onSolid,
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
    backgroundColor: colors.solid,
    borderRadius: radii.md,
  },
  maxBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.onSolid,
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
