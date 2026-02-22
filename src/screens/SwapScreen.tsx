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
import { SOL_MINT, USDC_MINT, TOKEN_DECIMALS, CLUSTER_SIMULATION } from '../constants';
import { prepareSwap, QuoteResponse } from '../utils/jupiter';

interface SwapScreenProps {
  onBack: () => void;
}

type SwapDirection = 'SOL_TO_USDC' | 'USDC_TO_SOL';

export function SwapScreen({ onBack }: SwapScreenProps) {
  const { smartWalletPubkey, signAndSendTransaction } = useWallet();

  // Form state
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<SwapDirection>('SOL_TO_USDC');

  // Quote state
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Swap state
  const [isSwapping, setIsSwapping] = useState(false);

  // Get input/output token info based on direction
  const inputToken = direction === 'SOL_TO_USDC' ? 'SOL' : 'USDC';
  const outputToken = direction === 'SOL_TO_USDC' ? 'USDC' : 'SOL';
  const inputMint = direction === 'SOL_TO_USDC' ? SOL_MINT : USDC_MINT;
  const outputMint = direction === 'SOL_TO_USDC' ? USDC_MINT : SOL_MINT;
  const inputDecimals = TOKEN_DECIMALS[inputToken];
  const outputDecimals = TOKEN_DECIMALS[outputToken];

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

  // Flip swap direction
  const flipDirection = () => {
    setDirection((prev) => (prev === 'SOL_TO_USDC' ? 'USDC_TO_SOL' : 'SOL_TO_USDC'));
    setQuote(null); // Clear quote when direction changes
  };

  // Fetch quote from Jupiter
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

    try {
      const amountInSmallestUnit = toSmallestUnit(amount, inputDecimals);

      // We use prepareSwap but only need the quote for preview
      const result = await prepareSwap(
        inputMint,
        outputMint,
        amountInSmallestUnit,
        smartWalletPubkey
      );

      setQuote(result.quote);
    } catch (error: any) {
      console.error('Quote failed:', error);
      Alert.alert('Quote failed', error.message || 'Could not get quote');
    } finally {
      setIsLoadingQuote(false);
    }
  }, [amount, inputMint, outputMint, inputDecimals, smartWalletPubkey]);

  // Execute the swap
  const executeSwap = useCallback(async () => {
    if (!quote || !smartWalletPubkey) return;

    setIsSwapping(true);

    try {
      const amountInSmallestUnit = toSmallestUnit(amount, inputDecimals);

      // Prepare swap gets fresh instructions (quote might be slightly stale)
      const { instructions, addressLookupTableAccounts } = await prepareSwap(
        inputMint,
        outputMint,
        amountInSmallestUnit,
        smartWalletPubkey
      );

      // Create redirect URL for passkey callback
      const redirectUrl = Linking.createURL('swap-callback');

      // Execute via LazorKit - Kora handles gas
      const signature = await signAndSendTransaction(
        {
          instructions,
          transactionOptions: {
            addressLookupTableAccounts,
            clusterSimulation: CLUSTER_SIMULATION as 'mainnet' | 'devnet',
            // No feeToken = gasless (Kora sponsors)
          },
        },
        {
          redirectUrl,
          onSuccess: () => {
            Alert.alert(
              'Swap complete',
              `Swapped ${amount} ${inputToken} for ${toHumanAmount(quote.outAmount, outputDecimals)} ${outputToken}`
            );
          },
          onFail: (error) => {
            Alert.alert('Swap failed', error.message);
          },
        }
      );

      // Reset form
      setAmount('');
      setQuote(null);
    } catch (error: any) {
      console.error('Swap failed:', error);
      Alert.alert('Swap failed', error.message || 'Transaction failed');
    } finally {
      setIsSwapping(false);
    }
  }, [
    quote,
    amount,
    inputMint,
    outputMint,
    inputToken,
    outputToken,
    inputDecimals,
    outputDecimals,
    smartWalletPubkey,
    signAndSendTransaction,
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
                setQuote(null); // Clear quote when amount changes
              }}
              keyboardType="decimal-pad"
            />
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenBadgeText}>{inputToken}</Text>
            </View>
          </View>
        </View>

        {/* Flip Button */}
        <TouchableOpacity style={styles.flipButton} onPress={flipDirection}>
          <Text style={styles.flipButtonText}>↓↑</Text>
        </TouchableOpacity>

        {/* Output Section */}
        <View style={styles.tokenSection}>
          <Text style={styles.tokenLabel}>You receive</Text>
          <View style={styles.inputRow}>
            <Text style={styles.outputAmount}>
              {quote ? toHumanAmount(quote.outAmount, outputDecimals) : '—'}
            </Text>
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenBadgeText}>{outputToken}</Text>
            </View>
          </View>
        </View>

        {/* Quote Info */}
        {quote && (
          <View style={styles.quoteInfo}>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Price Impact</Text>
              <Text style={styles.quoteValue}>{parseFloat(quote.priceImpactPct).toFixed(4)}%</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Route</Text>
              <Text style={styles.quoteValue}>
                {quote.routePlan.map((r) => r.swapInfo.label).join(' → ')}
              </Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Gas Fee</Text>
              <Text style={styles.quoteValueGreen}>Free (Kora)</Text>
            </View>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {!quote ? (
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
              <Text style={styles.buttonText}>Swap (Gasless)</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How it works</Text>
        <Text style={styles.infoItem}>• Best prices via Jupiter aggregation</Text>
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
