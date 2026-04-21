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
} from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import * as Linking from 'expo-linking';
import { SOL_MINT, USDC_MINT, SEED_MINT, TOKEN_DECIMALS, SEED_DECIMALS, CLUSTER_SIMULATION } from '../constants';
import { prepareSwap, QuoteResponse } from '../utils/jupiter';
import { getBagsQuote, createBagsSwapTransaction, BagsQuoteResponse } from '../utils/bags';
import { DEFAULT_AUTH_EXPIRY_SLOTS, shouldUseDeferredExec } from '../utils/deferredExec';

interface SwapScreenProps {
  onBack: () => void;
}

type SwapPair = 'SOL_TO_USDC' | 'USDC_TO_SOL' | 'SOL_TO_SEED' | 'SEED_TO_SOL';
type SwapSource = 'jupiter' | 'bags';

const SWAP_PAIRS: Record<SwapPair, { input: string; output: string; inputMint: string; outputMint: string; inputDecimals: number; outputDecimals: number }> = {
  SOL_TO_USDC: { input: 'SOL', output: 'USDC', inputMint: SOL_MINT, outputMint: USDC_MINT, inputDecimals: TOKEN_DECIMALS.SOL, outputDecimals: TOKEN_DECIMALS.USDC },
  USDC_TO_SOL: { input: 'USDC', output: 'SOL', inputMint: USDC_MINT, outputMint: SOL_MINT, inputDecimals: TOKEN_DECIMALS.USDC, outputDecimals: TOKEN_DECIMALS.SOL },
  SOL_TO_SEED: { input: 'SOL', output: 'SEED', inputMint: SOL_MINT, outputMint: SEED_MINT, inputDecimals: TOKEN_DECIMALS.SOL, outputDecimals: SEED_DECIMALS },
  SEED_TO_SOL: { input: 'SEED', output: 'SOL', inputMint: SEED_MINT, outputMint: SOL_MINT, inputDecimals: SEED_DECIMALS, outputDecimals: TOKEN_DECIMALS.SOL },
};

export function SwapScreen({ onBack }: SwapScreenProps) {
  const { smartWalletPubkey, signAndSendTransaction, authorizeAndExecute } = useWallet();

  // Form state
  const [amount, setAmount] = useState('');
  const [pair, setPair] = useState<SwapPair>('SOL_TO_SEED');
  const [swapSource, setSwapSource] = useState<SwapSource>('bags');

  // Quote state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [bagsQuote, setBagsQuote] = useState<BagsQuoteResponse | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Swap state
  const [isSwapping, setIsSwapping] = useState(false);

  // Get input/output token info based on pair
  const { input: inputToken, output: outputToken, inputMint, outputMint, inputDecimals, outputDecimals } = SWAP_PAIRS[pair];

  // Convert human-readable amount to smallest units
  const toSmallestUnit = (humanAmount: string, decimals: number): string => {
    const num = parseFloat(humanAmount);
    if (isNaN(num)) return '0';
    return Math.floor(num * Math.pow(10, decimals)).toString();
  };

  // Convert smallest units to human-readable
  const toHumanAmount = (smallestUnit: string, decimals: number): string => {
    const num = parseInt(smallestUnit, 10);
    if (isNaN(num)) return '0';
    return (num / Math.pow(10, decimals)).toFixed(decimals === 6 ? 2 : 4);
  };

  // Cycle through swap pairs
  const cyclePair = () => {
    const pairs: SwapPair[] = ['SOL_TO_SEED', 'SEED_TO_SOL', 'SOL_TO_USDC', 'USDC_TO_SOL'];
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
      Alert.alert('Quote failed', error.message || 'Could not get quote');
    } finally {
      setIsLoadingQuote(false);
    }
  }, [amount, inputMint, outputMint, inputDecimals, smartWalletPubkey, swapSource]);

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

      // Build instruction set for the active source, then branch by size:
      // under the threshold → single-tx signAndSendTransaction;
      // over → authorizeAndExecute (2-tx deferred) so the passkey signature
      // doesn't have to fit alongside the swap payload.
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Swap</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Source Toggle */}
      <View style={styles.sourceToggle}>
        <TouchableOpacity
          style={[styles.sourceOption, swapSource === 'bags' && styles.sourceOptionActive]}
          onPress={() => { setSwapSource('bags'); setQuote(null); setBagsQuote(null); }}
        >
          <Text style={[styles.sourceOptionText, swapSource === 'bags' && styles.sourceOptionTextActive]}>Bags</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sourceOption, swapSource === 'jupiter' && styles.sourceOptionActive]}
          onPress={() => { setSwapSource('jupiter'); setQuote(null); setBagsQuote(null); }}
        >
          <Text style={[styles.sourceOptionText, swapSource === 'jupiter' && styles.sourceOptionTextActive]}>Jupiter</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.swapCard}>
        {/* Input Section */}
        <View style={styles.tokenSection}>
          <Text style={styles.tokenLabel}>You pay</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#666"
              value={amount}
              onChangeText={(text) => {
                setAmount(text);
                setQuote(null);
                setBagsQuote(null);
              }}
              keyboardType="decimal-pad"
            />
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenBadgeText}>{inputToken}</Text>
            </View>
          </View>
        </View>

        {/* Cycle Pair Button */}
        <TouchableOpacity style={styles.flipButton} onPress={cyclePair}>
          <Text style={styles.flipButtonText}>↓↑</Text>
        </TouchableOpacity>

        {/* Output Section */}
        <View style={styles.tokenSection}>
          <Text style={styles.tokenLabel}>You receive</Text>
          <View style={styles.inputRow}>
            <Text style={styles.outputAmount}>
              {activeQuote ? toHumanAmount(outAmount, outputDecimals) : '—'}
            </Text>
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenBadgeText}>{outputToken}</Text>
            </View>
          </View>
        </View>

        {/* Quote Info */}
        {activeQuote && (
          <View style={styles.quoteInfo}>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Price Impact</Text>
              <Text style={styles.quoteValue}>{parseFloat(activeQuote.priceImpactPct).toFixed(4)}%</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Source</Text>
              <Text style={styles.quoteValue}>{swapSource === 'bags' ? 'Bags.fm' : 'Jupiter'}</Text>
            </View>
            {quote && quote.routePlan && (
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel}>Route</Text>
                <Text style={styles.quoteValue}>
                  {quote.routePlan.map((r) => r.swapInfo.label).join(' → ')}
                </Text>
              </View>
            )}
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Gas Fee</Text>
              <Text style={styles.quoteValueGreen}>Free (Kora)</Text>
            </View>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {!activeQuote ? (
          <TouchableOpacity
            style={[styles.button, isLoadingQuote && styles.buttonDisabled]}
            onPress={fetchQuote}
            disabled={isLoadingQuote || !amount}
            activeOpacity={0.8}
          >
            {isLoadingQuote ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Get Quote</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.buttonSwap, isSwapping && styles.buttonDisabled]}
            onPress={executeSwap}
            disabled={isSwapping}
            activeOpacity={0.8}
          >
            {isSwapping ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Swap via {swapSource === 'bags' ? 'Bags' : 'Jupiter'} (Gasless)</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How it works</Text>
        <Text style={styles.infoItem}>• Swap via Bags.fm or Jupiter aggregation</Text>
        <Text style={styles.infoItem}>• SOL, USDC, and SEED token pairs</Text>
        <Text style={styles.infoItem}>• Sign with Face ID / fingerprint</Text>
        <Text style={styles.infoItem}>• Gas sponsored by Kora paymaster</Text>
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
  backText: {
    fontSize: 16,
    color: '#666',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  sourceToggle: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  sourceOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  sourceOptionActive: {
    backgroundColor: '#000',
  },
  sourceOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  sourceOptionTextActive: {
    color: '#fff',
  },
  swapCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  tokenSection: {
    marginBottom: 8,
  },
  tokenLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '600',
    color: '#000',
    padding: 0,
  },
  outputAmount: {
    flex: 1,
    fontSize: 32,
    fontWeight: '600',
    color: '#000',
  },
  tokenBadge: {
    backgroundColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  tokenBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  flipButton: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  flipButtonText: {
    fontSize: 18,
    color: '#000',
  },
  quoteInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quoteLabel: {
    fontSize: 14,
    color: '#666',
  },
  quoteValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  quoteValueGreen: {
    fontSize: 14,
    color: '#22c55e',
    fontWeight: '600',
  },
  buttonContainer: {
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  buttonSwap: {
    backgroundColor: '#22c55e',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 17,
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
