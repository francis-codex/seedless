import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
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
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, TokenLogo, PrimaryButton, Pill, Icon } from '../components/ui';

interface SwapScreenProps {
  onBack: () => void;
}

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

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

const SWAP_PAIRS: Record<SwapPair, { input: string; output: string; inputMint: string; outputMint: string; inputDecimals: number; outputDecimals: number }> = {
  SOL_TO_USDC: { input: 'SOL', output: 'USDC', inputMint: SOL_MINT, outputMint: USDC_MINT, inputDecimals: TOKEN_DECIMALS.SOL, outputDecimals: TOKEN_DECIMALS.USDC },
  USDC_TO_SOL: { input: 'USDC', output: 'SOL', inputMint: USDC_MINT, outputMint: SOL_MINT, inputDecimals: TOKEN_DECIMALS.USDC, outputDecimals: TOKEN_DECIMALS.SOL },
  SOL_TO_SEED: { input: 'SOL', output: 'SEED', inputMint: SOL_MINT, outputMint: SEED_MINT, inputDecimals: TOKEN_DECIMALS.SOL, outputDecimals: SEED_DECIMALS },
  SEED_TO_SOL: { input: 'SEED', output: 'SOL', inputMint: SEED_MINT, outputMint: SOL_MINT, inputDecimals: SEED_DECIMALS, outputDecimals: TOKEN_DECIMALS.SOL },
  USDC_TO_SEED: { input: 'USDC', output: 'SEED', inputMint: USDC_MINT, outputMint: SEED_MINT, inputDecimals: TOKEN_DECIMALS.USDC, outputDecimals: SEED_DECIMALS },
  SEED_TO_USDC: { input: 'SEED', output: 'USDC', inputMint: SEED_MINT, outputMint: USDC_MINT, inputDecimals: SEED_DECIMALS, outputDecimals: TOKEN_DECIMALS.USDC },
};

export function SwapScreen({ onBack }: SwapScreenProps) {
  const { smartWalletPubkey, signAndSendTransaction, authorizeAndExecute } = useWallet();

  // Form state
  const [amount, setAmount] = useState('');
  const [pair, setPair] = useState<SwapPair>('SOL_TO_SEED');
  const [swapSource, setSwapSource] = useState<SwapSource>('jupiter');

  // Quote state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [bagsQuote, setBagsQuote] = useState<BagsQuoteResponse | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Swap state
  const [isSwapping, setIsSwapping] = useState(false);

  // Get input/output token info based on pair
  const { input: inputToken, output: outputToken, inputMint, outputMint, inputDecimals, outputDecimals } = SWAP_PAIRS[pair];

  // Max button — fill input with full balance of input token (SOL keeps rent buffer)
  const handleMax = useCallback(async () => {
    if (!smartWalletPubkey) return;
    try {
      const owner = new PublicKey(smartWalletPubkey);
      if (inputMint === SOL_MINT) {
        const lamports = await connection.getBalance(owner);
        const usable = Math.max(0, lamports / LAMPORTS_PER_SOL - MIN_SOL_FOR_TX);
        setAmount(usable > 0 ? usable.toFixed(4) : '0');
      } else {
        const ata = await getAssociatedTokenAddress(new PublicKey(inputMint), owner, true);
        const acc = await getAccount(connection, ata);
        setAmount((Number(acc.amount) / Math.pow(10, inputDecimals)).toString());
      }
      setQuote(null);
      setBagsQuote(null);
    } catch {
      Alert.alert('Max failed', 'Could not fetch balance — try again');
    }
  }, [smartWalletPubkey, inputMint, inputDecimals]);

  // Cycle through swap pairs
  const cyclePair = () => {
    const pairs: SwapPair[] = ['SOL_TO_SEED', 'SEED_TO_SOL', 'SOL_TO_USDC', 'USDC_TO_SOL', 'USDC_TO_SEED', 'SEED_TO_USDC'];
    const currentIndex = pairs.indexOf(pair);
    setPair(pairs[(currentIndex + 1) % pairs.length]);
    setQuote(null);
    setBagsQuote(null);
    setAmount('');
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
    // SOL → SPL is temporarily blocked while the gasless relayer whitelists
    // the syncNative instruction Jupiter uses to wrap SOL. Reverse direction
    // (SPL → SOL) and SPL ↔ SPL pairs work fine.
    if (inputMint === SOL_MINT) {
      Alert.alert(
        'Temporarily paused',
        `SOL → ${outputToken} is on hold while we update the gasless relayer. Try ${outputToken} → SOL or any pair that doesn't start with SOL.`,
      );
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

      const callbacks = {
        redirectUrl,
        onSuccess: () => Alert.alert('Swap complete', successLabel),
        onFail: (error: Error) => Alert.alert('Swap failed', error.message),
      };

      if (shouldUseDeferredExec(instructions)) {
        await authorizeAndExecute(
          {
            instructions,
            transactionOptions: txOpts,
            expiryOffset: DEFAULT_AUTH_EXPIRY_SLOTS,
          },
          callbacks,
        );
      } else {
        await signAndSendTransaction(
          { instructions, transactionOptions: txOpts },
          callbacks,
        );
      }

      // Reset form
      setAmount('');
      setQuote(null);
      setBagsQuote(null);
    } catch (error: any) {
      console.error('Swap failed:', error);
      Alert.alert('Swap failed', error.message || 'Transaction failed');
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
              <View style={styles.tokenChip}>
                <TokenLogo symbol={inputToken} size={28} />
                <Text style={styles.tokenChipText}>{inputToken}</Text>
              </View>
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity activeOpacity={0.7} onPress={handleMax} style={styles.maxBtn}>
                <Text style={styles.maxBtnText}>MAX</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Flip button */}
          <View style={styles.flipWrap}>
            <TouchableOpacity activeOpacity={0.7} style={styles.flipBtn} onPress={cyclePair}>
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
              <View style={styles.tokenChip}>
                <TokenLogo symbol={outputToken} size={28} />
                <Text style={styles.tokenChipText}>{outputToken}</Text>
              </View>
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
                label="Get quote"
                onPress={fetchQuote}
                loading={isLoadingQuote}
                disabled={!amount}
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
