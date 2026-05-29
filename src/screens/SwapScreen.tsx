import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import * as Linking from 'expo-linking';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { SOL_MINT, USDC_MINT, SEED_MINT, TOKEN_DECIMALS, SEED_DECIMALS, CLUSTER_SIMULATION, SOLANA_RPC_URL, MIN_SOL_FOR_TX } from '../constants';
import { prepareSwap, QuoteResponse } from '../utils/jupiter';
import { getBagsQuote, createBagsSwapTransaction, BagsQuoteResponse } from '../utils/bags';
import { DEFAULT_AUTH_EXPIRY_SLOTS, shouldUseDeferredExec } from '../utils/deferredExec';
import { clearSession as clearStoredSession, getActiveSession } from '../utils/session';
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, TokenLogo, PrimaryButton, Pill, Icon } from '../components/ui';
import { SUPPORTED_TOKENS, TOKEN_REGISTRY, type Token } from '../tokens/registry';

interface SwapScreenProps {
  onBack: () => void;
}

// Shared singleton connections — see src/utils/connection.ts
import { connection, fallbackConnection } from '../utils/connection';

// 4-second per-call timeout — guarantees a hung Helius socket never freezes
// the picker. Loses to whichever resolves first.
const withTimeout = <T,>(p: Promise<T>, ms = 4000): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('rpc-timeout')), ms)),
  ]);

// Fetch ONE token's balance. Primary → fallback cascade, each call timeout-guarded.
// Returns -1 as a sentinel for "fetch failed, keep last known". Returns 0 only
// when both RPCs agree the account is empty (no ATA, no SOL).
const fetchTokenBalance = async (t: typeof SUPPORTED_TOKENS[number], owner: PublicKey): Promise<number> => {
  if (t.isNative) {
    try {
      const lamports = await withTimeout(connection.getBalance(owner));
      return lamports / LAMPORTS_PER_SOL;
    } catch {
      try {
        const lamports = await withTimeout(fallbackConnection.getBalance(owner));
        return lamports / LAMPORTS_PER_SOL;
      } catch {
        return -1;
      }
    }
  }
  try {
    const ata = await getAssociatedTokenAddress(new PublicKey(t.mint), owner, true);
    try {
      const acc = await withTimeout(getAccount(connection, ata));
      return Number(acc.amount) / Math.pow(10, t.decimals);
    } catch (primaryErr: any) {
      try {
        const acc = await withTimeout(getAccount(fallbackConnection, ata));
        return Number(acc.amount) / Math.pow(10, t.decimals);
      } catch (fallbackErr: any) {
        // Only treat as a genuine "no ATA" when BOTH RPCs agree the account
        // doesn't exist (TokenAccountNotFoundError). Any other failure
        // (timeout, RPC down) returns the -1 sentinel so the caller keeps
        // the last-known balance instead of silently zeroing the row.
        const msg = String(fallbackErr?.name ?? '') + ' ' + String(fallbackErr?.message ?? '');
        if (msg.includes('TokenAccountNotFound') || msg.includes('could not find account')) {
          return 0;
        }
        return -1;
      }
    }
  } catch {
    return -1;
  }
};

const toSmallestUnit = (humanAmount: string, decimals: number): string => {
  const num = parseFloat(humanAmount);
  if (isNaN(num)) return '0';
  return Math.floor(num * Math.pow(10, decimals)).toString();
};

const toHumanAmount = (smallestUnit: string, decimals: number): string => {
  const num = parseInt(smallestUnit, 10);
  if (isNaN(num)) return '0';
  return (num / Math.pow(10, decimals)).toFixed(decimals === 6 ? 2 : 4);
};

type SwapPair = 'SOL_TO_USDC' | 'USDC_TO_SOL' | 'SOL_TO_SEED' | 'SEED_TO_SOL' | 'USDC_TO_SEED' | 'SEED_TO_USDC';
type SwapSource = 'jupiter' | 'bags';
type TokenSymbol = 'SOL' | 'USDC' | 'SEED';

const SWAP_PAIRS: Record<SwapPair, { input: string; output: string; inputMint: string; outputMint: string; inputDecimals: number; outputDecimals: number }> = {
  SOL_TO_USDC: { input: 'SOL', output: 'USDC', inputMint: SOL_MINT, outputMint: USDC_MINT, inputDecimals: TOKEN_DECIMALS.SOL, outputDecimals: TOKEN_DECIMALS.USDC },
  USDC_TO_SOL: { input: 'USDC', output: 'SOL', inputMint: USDC_MINT, outputMint: SOL_MINT, inputDecimals: TOKEN_DECIMALS.USDC, outputDecimals: TOKEN_DECIMALS.SOL },
  SOL_TO_SEED: { input: 'SOL', output: 'SEED', inputMint: SOL_MINT, outputMint: SEED_MINT, inputDecimals: TOKEN_DECIMALS.SOL, outputDecimals: SEED_DECIMALS },
  SEED_TO_SOL: { input: 'SEED', output: 'SOL', inputMint: SEED_MINT, outputMint: SOL_MINT, inputDecimals: SEED_DECIMALS, outputDecimals: TOKEN_DECIMALS.SOL },
  USDC_TO_SEED: { input: 'USDC', output: 'SEED', inputMint: USDC_MINT, outputMint: SEED_MINT, inputDecimals: TOKEN_DECIMALS.USDC, outputDecimals: SEED_DECIMALS },
  SEED_TO_USDC: { input: 'SEED', output: 'USDC', inputMint: SEED_MINT, outputMint: USDC_MINT, inputDecimals: SEED_DECIMALS, outputDecimals: TOKEN_DECIMALS.USDC },
};

// Derive picker rows from the central token registry. Keeps every screen's
// token list aligned with one source of truth.
const TOKEN_LIST: TokenSymbol[] = SUPPORTED_TOKENS.map((t) => t.symbol) as TokenSymbol[];

function pairFromTokens(input: TokenSymbol, output: TokenSymbol): SwapPair {
  return `${input}_TO_${output}` as SwapPair;
}

export function SwapScreen({ onBack }: SwapScreenProps) {
  const { smartWalletPubkey, signAndSendTransaction, signAndSendWithSession, authorizeAndExecute } = useWallet();

  // Form state
  const [amount, setAmount] = useState('');
  const [pair, setPair] = useState<SwapPair>('SOL_TO_SEED');
  const [swapSource, setSwapSource] = useState<SwapSource>('jupiter');
  const [pickerSide, setPickerSide] = useState<'input' | 'output' | null>(null);
  // Per-token balances for the picker rows. Prefetched on mount so the picker
  // never opens to "…" — we hold last-known values and only show the loading
  // dots for tokens that have literally never been fetched.
  const [pickerBalances, setPickerBalances] = useState<Record<TokenSymbol, number>>({
    SOL: 0,
    USDC: 0,
    SEED: 0,
  });
  const [pickerBalanceLoading, setPickerBalanceLoading] = useState<Record<TokenSymbol, boolean>>({
    SOL: true,
    USDC: true,
    SEED: true,
  });
  const [pickerBalanceFetched, setPickerBalanceFetched] = useState<Record<TokenSymbol, boolean>>({
    SOL: false,
    USDC: false,
    SEED: false,
  });

  // Quote state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [bagsQuote, setBagsQuote] = useState<BagsQuoteResponse | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Swap state
  const [isSwapping, setIsSwapping] = useState(false);

  // Get input/output token info based on pair
  const { input: inputToken, output: outputToken, inputMint, outputMint, inputDecimals, outputDecimals } = SWAP_PAIRS[pair];

  // Stable string form of the wallet pubkey. useWallet() returns a new
  // PublicKey instance every render, so depending on the object identity
  // causes useEffect to re-fire infinitely. The base58 string is stable.
  const walletKey = smartWalletPubkey?.toString() ?? null;

  // Refresh balances for all tokens in parallel with per-token loading state.
  // Each token resolves independently so the UI fills in as fetches complete.
  const refreshPickerBalances = useCallback(async () => {
    if (!walletKey) return;
    const owner = new PublicKey(walletKey);
    // Mark every token as loading. Render only shows "…" when fetched=false,
    // so already-known tokens keep their stale value during refresh.
    setPickerBalanceLoading({ SOL: true, USDC: true, SEED: true });
    await Promise.all(
      SUPPORTED_TOKENS.map(async (t) => {
        const sym = t.symbol as TokenSymbol;
        const result = await fetchTokenBalance(t, owner);
        if (result >= 0) {
          setPickerBalances((prev) => ({ ...prev, [sym]: result }));
          setPickerBalanceFetched((prev) => ({ ...prev, [sym]: true }));
        }
        setPickerBalanceLoading((prev) => ({ ...prev, [sym]: false }));
      }),
    );
  }, [walletKey]);

  // Prefetch on mount + when wallet changes, so the picker opens to real
  // numbers instantly. Refresh on picker open as well to catch new sends.
  useEffect(() => {
    if (walletKey) {
      refreshPickerBalances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletKey]);

  useEffect(() => {
    if (pickerSide !== null) {
      refreshPickerBalances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerSide]);

  // Max button — fill input with full balance of input token (SOL keeps rent buffer)
  // Falls back to public RPC if primary fails, same pattern as picker balances.
  const handleMax = useCallback(async () => {
    if (!smartWalletPubkey) return;
    try {
      const owner = new PublicKey(smartWalletPubkey);
      if (inputMint === SOL_MINT) {
        let lamports: number;
        try {
          lamports = await connection.getBalance(owner);
        } catch {
          lamports = await fallbackConnection.getBalance(owner);
        }
        const usable = Math.max(0, lamports / LAMPORTS_PER_SOL - MIN_SOL_FOR_TX);
        setAmount(usable > 0 ? usable.toFixed(4) : '0');
      } else {
        const ata = await getAssociatedTokenAddress(new PublicKey(inputMint), owner, true);
        let acc;
        try {
          acc = await getAccount(connection, ata);
        } catch {
          acc = await getAccount(fallbackConnection, ata);
        }
        setAmount((Number(acc.amount) / Math.pow(10, inputDecimals)).toString());
      }
      setQuote(null);
      setBagsQuote(null);
    } catch {
      Alert.alert('Max failed', 'Could not fetch balance — try again');
    }
  }, [smartWalletPubkey, inputMint, inputDecimals]);

  // Silent quote fetch — no Alerts. Used by auto-quote on amount change.
  const lastQuoteKeyRef = useRef<string>('');
  const fetchQuoteSilent = useCallback(async () => {
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount < 0.0001 || !smartWalletPubkey) {
      return;
    }
    // Dedupe identical fetches across re-renders
    const key = `${pair}-${swapSource}-${amount}`;
    if (lastQuoteKeyRef.current === key) return;
    lastQuoteKeyRef.current = key;

    setIsLoadingQuote(true);
    try {
      const amountInSmallestUnit = toSmallestUnit(amount, inputDecimals);
      if (swapSource === 'bags') {
        const result = await getBagsQuote(inputMint, outputMint, amountInSmallestUnit);
        setBagsQuote(result);
      } else {
        const result = await prepareSwap(inputMint, outputMint, amountInSmallestUnit, smartWalletPubkey);
        setQuote(result.quote);
      }
    } catch {
      // Silent — output stays at "0.00", user can retry by tapping Get quote
    } finally {
      setIsLoadingQuote(false);
    }
  }, [amount, inputMint, outputMint, inputDecimals, smartWalletPubkey, swapSource, pair]);

  // Auto-fetch quote 500ms after user stops typing or changes pair
  useEffect(() => {
    if (!amount || !smartWalletPubkey) return;
    const timer = setTimeout(() => { fetchQuoteSilent(); }, 500);
    return () => clearTimeout(timer);
  }, [amount, pair, swapSource, smartWalletPubkey, fetchQuoteSilent]);

  // Flip input/output sides
  const flipPair = () => {
    const { input, output } = SWAP_PAIRS[pair];
    setPair(pairFromTokens(output as TokenSymbol, input as TokenSymbol));
    setQuote(null);
    setBagsQuote(null);
    setAmount('');
  };

  // Pick a token for either side. If user picks same token on both sides, auto-flip.
  const handlePickToken = (token: TokenSymbol) => {
    if (!pickerSide) return;
    const { input, output } = SWAP_PAIRS[pair];
    let nextInput = input as TokenSymbol;
    let nextOutput = output as TokenSymbol;
    if (pickerSide === 'input') {
      nextInput = token;
      if (token === output) nextOutput = input as TokenSymbol;
    } else {
      nextOutput = token;
      if (token === input) nextInput = output as TokenSymbol;
    }
    setPair(pairFromTokens(nextInput, nextOutput));
    setQuote(null);
    setBagsQuote(null);
    setAmount('');
    setPickerSide(null);
  };

  // Fetch quote from selected source
  const fetchQuote = useCallback(async () => {
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount to swap');
      return;
    }
    if (parsedAmount < 0.0001) {
      Alert.alert('Amount too small', `Enter at least 0.0001 ${inputToken} to get a quote.`);
      return;
    }

    if (!smartWalletPubkey) {
      Alert.alert('Not connected', 'Connect your wallet first');
      return;
    }

    setIsLoadingQuote(true);
    setQuote(null);
    setBagsQuote(null);

    try {
      const amountInSmallestUnit = toSmallestUnit(amount, inputDecimals);

      if (swapSource === 'bags') {
        const result = await getBagsQuote(inputMint, outputMint, amountInSmallestUnit);
        setBagsQuote(result);
      } else {
        const result = await prepareSwap(
          inputMint,
          outputMint,
          amountInSmallestUnit,
          smartWalletPubkey
        );
        setQuote(result.quote);
      }
    } catch (error: any) {
      console.error('Quote failed:', error);
      const raw = String(error?.message ?? error ?? '');
      let friendly = 'Could not get a quote — try a different amount or pair.';
      if (raw.includes('NO_ROUTES_FOUND') || raw.toLowerCase().includes('no routes')) {
        friendly = `No route available for ${inputToken} → ${outputToken} right now. Try a larger amount or a different pair.`;
      } else if (raw.toLowerCase().includes('network') || raw.toLowerCase().includes('fetch')) {
        friendly = 'Network issue — check your connection and try again.';
      }
      Alert.alert('Quote failed', friendly);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [amount, inputMint, outputMint, inputDecimals, smartWalletPubkey, swapSource, inputToken, outputToken]);

  // Get the active quote's output amount
  const activeQuote = swapSource === 'bags' ? bagsQuote : quote;
  const outAmount = activeQuote?.outAmount || '0';

  // Execute the swap
  const executeSwap = useCallback(async () => {
    if ((!quote && !bagsQuote) || !smartWalletPubkey) return;

    setIsSwapping(true);

    try {
      const amountInSmallestUnit = toSmallestUnit(amount, inputDecimals);
      const redirectUrl = Linking.createURL('swap-callback');

      let instructions;
      let addressLookupTableAccounts;
      let successLabel: string;

      if (swapSource === 'bags' && bagsQuote) {
        const swapTx = await createBagsSwapTransaction(
          inputMint,
          outputMint,
          amountInSmallestUnit,
          bagsQuote.slippageBps,
          smartWalletPubkey.toString()
        );
        const { Transaction } = await import('@solana/web3.js');
        const txBuffer = Buffer.from(swapTx.transaction, 'base64');
        instructions = Transaction.from(txBuffer).instructions;
        successLabel = `Swapped ${amount} ${inputToken} for ${toHumanAmount(bagsQuote.outAmount, outputDecimals)} ${outputToken} via Bags`;
      } else {
        const jupiter = await prepareSwap(
          inputMint,
          outputMint,
          amountInSmallestUnit,
          smartWalletPubkey
        );
        instructions = jupiter.instructions;
        addressLookupTableAccounts = jupiter.addressLookupTableAccounts;
        successLabel = `Swapped ${amount} ${inputToken} for ${toHumanAmount(quote!.outAmount, outputDecimals)} ${outputToken} via Jupiter`;
      }

      const txOpts = {
        addressLookupTableAccounts,
        clusterSimulation: CLUSTER_SIMULATION as 'mainnet' | 'devnet',
      };

      // Re-check the session right before sending so we don't try to use one
      // that just expired between screen mount and tap. Mirrors the send fast
      // path in WalletScreen so swap gets the same no-redirect UX as send.
      const walletId = smartWalletPubkey.toBase58();
      const session = await getActiveSession(walletId);

      let signature: string | undefined;

      // Fast path: ed25519 session signer, no passkey prompt. Jupiter swap
      // CPIs into Raydium/Orca/Meteora via Jupiter's program; if any inner
      // program isn't covered by the LazorKit session allowlist this throws
      // a scope-style error and we fall through to the passkey path silently.
      if (session) {
        try {
          signature = await signAndSendWithSession({
            sessionKeypair: session.sessionKeypair,
            sessionPda: session.sessionPda,
            instructions,
            transactionOptions: txOpts,
          });
        } catch (err: any) {
          const sessMsg = String(err?.message ?? err ?? '');
          const isScopeErr = /session|SessionExpired|SessionInactive|unauthorized|not authorized|allowlist|scope|invalid authority/i.test(sessMsg);
          if (!isScopeErr) throw err;
          // Drop the session client-side so the next attempt doesn't loop
          // the same failure.
          await clearStoredSession(walletId);
        }
      }

      // Passkey-prompted path: either no session, or the session fell
      // through on a scope error above.
      if (!signature) {
        if (shouldUseDeferredExec(instructions)) {
          signature = await authorizeAndExecute(
            {
              instructions,
              transactionOptions: txOpts,
              expiryOffset: DEFAULT_AUTH_EXPIRY_SLOTS,
            },
            { redirectUrl },
          );
        } else {
          signature = await signAndSendTransaction(
            { instructions, transactionOptions: txOpts },
            { redirectUrl },
          );
        }
      }

      if (signature) {
        Alert.alert('Swap complete', successLabel);
      }

      // Reset form
      setAmount('');
      setQuote(null);
      setBagsQuote(null);
    } catch (error: any) {
      console.error('Swap failed:', error);
      const raw = String(error?.message ?? error ?? '');
      let friendly = error?.message || 'Transaction failed';
      if (raw.includes('Program failed to complete') || raw.includes('exceeded CUs') || raw.includes('exceeded maximum number')) {
        friendly = 'Swap simulation ran out of compute. Try a smaller amount or a more liquid pair.';
      } else if (raw.includes('insufficient') || raw.includes('0x1') || raw.includes('lamport')) {
        friendly = `Not enough ${inputToken} to cover swap + rent. Top up and retry.`;
      } else if (raw.includes('NO_ROUTES') || raw.toLowerCase().includes('no routes')) {
        friendly = `No route available for ${inputToken} → ${outputToken} right now.`;
      } else if (raw.toLowerCase().includes('blockhash') || raw.toLowerCase().includes('expired')) {
        friendly = 'Quote expired. Tap Get quote and try again.';
      }
      Alert.alert('Swap failed', friendly);
    } finally {
      setIsSwapping(false);
    }
  }, [
    quote,
    bagsQuote,
    amount,
    inputMint,
    outputMint,
    inputToken,
    outputToken,
    inputDecimals,
    outputDecimals,
    smartWalletPubkey,
    signAndSendTransaction,
    signAndSendWithSession,
    authorizeAndExecute,
    swapSource,
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader title="Swap" onClose={onBack} />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Input card */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>You pay</Text>
            <View style={styles.row}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={colors.textSubtle}
                value={amount}
                onChangeText={(text) => {
                  setAmount(text.replace(',', '.'));
                  setQuote(null);
                  setBagsQuote(null);
                }}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setPickerSide('input')}
                style={styles.tokenChip}
              >
                <TokenLogo symbol={inputToken} size={28} />
                <Text style={styles.tokenChipText}>{inputToken}</Text>
                <Text style={styles.chevron}>▾</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity activeOpacity={0.7} onPress={handleMax} style={styles.maxBtn}>
                <Text style={styles.maxBtnText}>MAX</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Flip button */}
          <View style={styles.flipWrap}>
            <TouchableOpacity activeOpacity={0.7} style={styles.flipBtn} onPress={flipPair}>
              <Icon name="swap" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Output card */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>You receive</Text>
            <View style={styles.row}>
              <Text style={styles.outputAmount}>
                {activeQuote ? toHumanAmount(outAmount, outputDecimals) : '0.00'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setPickerSide('output')}
                style={styles.tokenChip}
              >
                <TokenLogo symbol={outputToken} size={28} />
                <Text style={styles.tokenChipText}>{outputToken}</Text>
                <Text style={styles.chevron}>▾</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quote info */}
          {activeQuote && (
            <View style={styles.quoteCard}>
              <QuoteRow
                label="Price impact"
                value={`${parseFloat(activeQuote.priceImpactPct).toFixed(4)}%`}
              />
              <QuoteRow label="Source" value={swapSource === 'bags' ? 'Bags.fm' : 'Jupiter'} />
              {quote && quote.routePlan && (
                <QuoteRow
                  label="Route"
                  value={quote.routePlan.map((r) => r.swapInfo.label).join(' → ')}
                />
              )}
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Gas fee</Text>
                <Pill label="Free · Kora" variant="success" />
              </View>
            </View>
          )}

          <View style={{ marginTop: spacing.xxl }}>
            {!activeQuote ? (
              <PrimaryButton
                label={!amount ? 'Enter amount' : isLoadingQuote ? 'Getting quote…' : 'Get quote'}
                onPress={fetchQuote}
                loading={isLoadingQuote}
                disabled={!amount || isLoadingQuote}
                fullWidth
              />
            ) : (
              <PrimaryButton
                label={`Swap via ${swapSource === 'bags' ? 'Bags' : 'Jupiter'}`}
                onPress={executeSwap}
                loading={isSwapping}
                fullWidth
              />
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Token picker bottom sheet */}
      <Modal
        visible={pickerSide !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerSide(null)}
      >
        <TouchableWithoutFeedback onPress={() => setPickerSide(null)}>
          <View style={styles.pickerOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.pickerSheet}>
                <View style={styles.pickerHandle} />
                <Text style={styles.pickerTitle}>
                  {pickerSide === 'input' ? 'You pay' : 'You receive'}
                </Text>
                {TOKEN_LIST.map((sym) => {
                  const isSelected = pickerSide === 'input' ? sym === inputToken : sym === outputToken;
                  const token: Token = TOKEN_REGISTRY[sym];
                  const balance = pickerBalances[sym] ?? 0;
                  const balanceFmt = balance.toLocaleString(undefined, { maximumFractionDigits: token.decimals === 6 ? 2 : 4 });
                  return (
                    <TouchableOpacity
                      key={sym}
                      activeOpacity={0.7}
                      style={[styles.pickerRow, isSelected && styles.pickerRowActive]}
                      onPress={() => handlePickToken(sym)}
                    >
                      <TokenLogo symbol={sym} size={32} />
                      <View style={styles.pickerRowText}>
                        <Text style={styles.pickerSymbol} numberOfLines={1}>{sym}</Text>
                        <Text style={styles.pickerName} numberOfLines={1}>{token.name}</Text>
                      </View>
                      <View style={styles.pickerRowRight}>
                        <Text style={styles.pickerBalance} numberOfLines={1} ellipsizeMode="tail">
                          {pickerBalanceLoading[sym] && !pickerBalanceFetched[sym] ? '…' : balanceFmt}
                        </Text>
                        {isSelected && <Text style={styles.pickerCheck}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quoteRow}>
      <Text style={styles.quoteLabel}>{label}</Text>
      <Text style={styles.quoteValue}>{value}</Text>
    </View>
  );
}

function InfoLine({ text }: { text: string }) {
  return (
    <View style={styles.infoLine}>
      <View style={styles.infoDot} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  cardLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -1,
    padding: 0,
  },
  outputAmount: {
    flex: 1,
    fontSize: 32,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -1,
  },
  tokenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  tokenChipText: {
    ...typography.heading,
  },
  chevron: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: -2,
  },

  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 37, 69, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  pickerHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  pickerTitle: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  pickerRowActive: {
    backgroundColor: colors.surface,
  },
  pickerRowText: {
    flex: 1,
  },
  pickerSymbol: {
    ...typography.heading,
  },
  pickerName: {
    fontSize: 12,
    color: colors.textSubtle,
    marginTop: 2,
  },
  pickerRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pickerBalance: {
    fontSize: 14,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  pickerCheck: {
    fontSize: 18,
    color: colors.text,
    fontWeight: '700' as const,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  maxBtn: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  maxBtnText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: 0.5,
  },

  flipWrap: {
    alignItems: 'center',
    marginVertical: -8,
    zIndex: 2,
  },
  flipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    borderWidth: 4,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B2545',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  sourceToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 4,
    marginTop: spacing.xl,
  },
  sourceOption: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  sourceOptionActive: {
    backgroundColor: colors.bg,
  },
  sourceText: {
    ...typography.body,
    color: colors.textMuted,
  },
  sourceTextActive: {
    color: colors.text,
    fontWeight: '600' as const,
  },

  quoteCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quoteLabel: {
    ...typography.caption,
  },
  quoteValue: {
    ...typography.body,
    fontSize: 14,
  },

  infoCard: {
    marginTop: spacing.xxxl,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  infoTitle: {
    ...typography.heading,
    marginBottom: spacing.md,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  infoDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textSubtle,
  },
  infoText: {
    ...typography.caption,
    fontSize: 14,
  },
});
