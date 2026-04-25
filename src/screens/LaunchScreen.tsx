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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import * as Linking from 'expo-linking';
import { CLUSTER_SIMULATION } from '../constants';
import { bagsTokenLaunch, BagsTokenLaunchParams } from '../utils/bags';

interface LaunchScreenProps {
  onBack: () => void;
}

export function LaunchScreen({ onBack }: LaunchScreenProps) {
  const { smartWalletPubkey, signAndSendTransaction } = useWallet();

  // Token info
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Fee share config
  const [creatorBps, setCreatorBps] = useState('10000'); // 100% to creator by default

  // State
  const [isLaunching, setIsLaunching] = useState(false);
  const [step, setStep] = useState<'info' | 'fees' | 'confirm'>('info');

  const walletAddress = smartWalletPubkey?.toString() || '';

  const validateInfo = (): boolean => {
    if (!name.trim()) {
      Alert.alert('Missing name', 'Enter a token name');
      return false;
    }
    if (!ticker.trim()) {
      Alert.alert('Missing ticker', 'Enter a token ticker (e.g. SEED)');
      return false;
    }
    if (ticker.length > 10) {
      Alert.alert('Ticker too long', 'Keep ticker under 10 characters');
      return false;
    }
    if (!description.trim()) {
      Alert.alert('Missing description', 'Enter a short description for your token');
      return false;
    }
    return true;
  };

  const validateFees = (): boolean => {
    const bps = parseInt(creatorBps, 10);
    if (isNaN(bps) || bps < 0 || bps > 10000) {
      Alert.alert('Invalid fee split', 'Creator share must be between 0 and 10000 basis points (0-100%)');
      return false;
    }
    return true;
  };

  const handleLaunch = useCallback(async () => {
    if (!smartWalletPubkey || !walletAddress) {
      Alert.alert('Not connected', 'Connect your wallet first');
      return;
    }

    setIsLaunching(true);

    try {
      // Step 1: Create token info and get mint
      const params: BagsTokenLaunchParams = {
        name: name.trim(),
        ticker: ticker.trim().toUpperCase(),
        description: description.trim(),
        imageUrl: imageUrl.trim() || undefined,
        creatorWallet: walletAddress,
        feeShareBps: parseInt(creatorBps, 10),
      };

      const { transaction, tokenMint } = await bagsTokenLaunch(params);

      // Step 2: Deserialize and sign via LazorKit
      const { Transaction } = await import('@solana/web3.js');
      const txBuffer = Buffer.from(transaction, 'base64');
      const tx = Transaction.from(txBuffer);

      const redirectUrl = Linking.createURL('launch-callback');

      await signAndSendTransaction(
        {
          instructions: tx.instructions,
          transactionOptions: {
            clusterSimulation: CLUSTER_SIMULATION as 'mainnet' | 'devnet',
          },
        },
        {
          redirectUrl,
          onSuccess: () => {
            Alert.alert(
              'Token launched!',
              `${name} (${ticker.toUpperCase()}) is live on Bags.fm!\n\nMint: ${tokenMint}\n\nFee sharing is configured. Trading fees will be collected on every trade.`,
              [{ text: 'Done', onPress: onBack }]
            );
          },
          onFail: (error) => {
            Alert.alert('Launch failed', error.message);
          },
        }
      );
    } catch (error: any) {
      console.error('Token launch failed:', error);
      Alert.alert('Launch failed', error.message || 'Could not launch token');
    } finally {
      setIsLaunching(false);
    }
  }, [name, ticker, description, imageUrl, creatorBps, walletAddress, smartWalletPubkey, signAndSendTransaction, onBack]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Launch Token</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Step indicator */}
        <View style={styles.steps}>
          <View style={[styles.stepDot, step === 'info' && styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, step === 'fees' && styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, step === 'confirm' && styles.stepDotActive]} />
        </View>
        <View style={styles.stepLabels}>
          <Text style={[styles.stepLabel, step === 'info' && styles.stepLabelActive]}>Info</Text>
          <Text style={[styles.stepLabel, step === 'fees' && styles.stepLabelActive]}>Fees</Text>
          <Text style={[styles.stepLabel, step === 'confirm' && styles.stepLabelActive]}>Launch</Text>
        </View>

        {step === 'info' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Token Details</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. My Token"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Ticker</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. MTK"
              placeholderTextColor="#999"
              value={ticker}
              onChangeText={(t) => setTicker(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={10}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="What is this token about?"
              placeholderTextColor="#999"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Image URL (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="https://..."
              placeholderTextColor="#999"
              value={imageUrl}
              onChangeText={setImageUrl}
              autoCapitalize="none"
              keyboardType="url"
            />

            <TouchableOpacity
              style={styles.nextButton}
              onPress={() => {
                if (validateInfo()) setStep('fees');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.nextButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'fees' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Fee Sharing</Text>
            <Text style={styles.feeExplainer}>
              Every trade of your token on Bags.fm generates fees. Set how much goes to you as the creator.
            </Text>

            <Text style={styles.label}>Creator share (basis points)</Text>
            <TextInput
              style={styles.input}
              placeholder="10000"
              placeholderTextColor="#999"
              value={creatorBps}
              onChangeText={setCreatorBps}
              keyboardType="number-pad"
            />
            <Text style={styles.feeHint}>
              10000 = 100% | 5000 = 50% | 2500 = 25%
            </Text>

            <View style={styles.feeSummary}>
              <View style={styles.feeRow}>
                <Text style={styles.feeLabel}>Creator (you)</Text>
                <Text style={styles.feeValue}>{(parseInt(creatorBps || '0', 10) / 100).toFixed(1)}%</Text>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setStep('info')}
                activeOpacity={0.8}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextButton}
                onPress={() => {
                  if (validateFees()) setStep('confirm');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'confirm' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Confirm Launch</Text>

            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>Token</Text>
              <Text style={styles.confirmValue}>{name} ({ticker})</Text>
            </View>

            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>Description</Text>
              <Text style={styles.confirmValue}>{description}</Text>
            </View>

            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>Creator fee share</Text>
              <Text style={styles.confirmValue}>{(parseInt(creatorBps, 10) / 100).toFixed(1)}%</Text>
            </View>

            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>Platform</Text>
              <Text style={styles.confirmValue}>Bags.fm</Text>
            </View>

            <View style={styles.confirmSection}>
              <Text style={styles.confirmLabel}>Creator wallet</Text>
              <Text style={styles.confirmValueSmall}>{walletAddress}</Text>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setStep('fees')}
                activeOpacity={0.8}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.launchButton, isLaunching && styles.buttonDisabled]}
                onPress={handleLaunch}
                disabled={isLaunching}
                activeOpacity={0.8}
              >
                {isLaunching ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.launchButtonText}>Launch on Bags</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Info */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>How it works</Text>
          <Text style={styles.infoItem}>• Create your token with name, ticker, and description</Text>
          <Text style={styles.infoItem}>• Configure fee sharing — earn from every trade</Text>
          <Text style={styles.infoItem}>• Launch on Bags.fm with one tap</Text>
          <Text style={styles.infoItem}>• Sign with Face ID / fingerprint</Text>
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
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
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
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  stepDotActive: {
    backgroundColor: '#000',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 4,
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    marginBottom: 24,
  },
  stepLabel: {
    fontSize: 12,
    color: '#999',
  },
  stepLabelActive: {
    color: '#000',
    fontWeight: '600',
  },
  formCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
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
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#000',
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  feeExplainer: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  feeHint: {
    fontSize: 12,
    color: '#999',
    marginTop: -8,
    marginBottom: 16,
  },
  feeSummary: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  feeLabel: {
    fontSize: 14,
    color: '#666',
  },
  feeValue: {
    fontSize: 14,
    color: '#000',
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#e0e0e0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  launchButton: {
    flex: 1,
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  launchButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  confirmSection: {
    marginBottom: 16,
  },
  confirmLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  confirmValue: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
  confirmValueSmall: {
    fontSize: 13,
    color: '#000',
    fontWeight: '500',
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
    lineHeight: 20,
  },
});
