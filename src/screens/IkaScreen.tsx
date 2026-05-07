import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as LocalAuthentication from 'expo-local-authentication';
import { ethers } from 'ethers';

import {
  CHAINS,
  IKA_MODE,
  createDWallet,
  deleteDWallet,
  getNativeBalance,
  loadDWallet,
  sendNative,
  type DWalletRecord,
  type IkaProgress,
} from '../ika';
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, PrimaryButton, Pill, Icon } from '../components/ui';

interface IkaScreenProps {
  onBack: () => void;
}

const CHAIN = CHAINS.sepolia;

type Phase = 'idle' | 'creating' | 'sending';

export function IkaScreen({ onBack }: IkaScreenProps) {
  const [dWallet, setDWallet] = useState<DWalletRecord | null>(null);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [amountEth, setAmountEth] = useState('0.0001');
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const log = useCallback((line: string) => {
    setStatusLog((prev) => [...prev, line]);
  }, []);

  const refreshBalance = useCallback(async (record: DWalletRecord) => {
    try {
      const wei = await getNativeBalance(record);
      setBalanceWei(wei);
    } catch (e: any) {
      log(`balance: ${e?.message ?? e}`);
    }
  }, [log]);

  useEffect(() => {
    (async () => {
      try {
        const existing = await loadDWallet('sepolia');
        if (existing) {
          setDWallet(existing);
          await refreshBalance(existing);
        }
      } catch (e: any) {
        log(`load: ${e?.message ?? e}`);
      }
    })();
  }, [log, refreshBalance]);

  const requireBiometric = useCallback(async (reason: string): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) return true;
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return res.success;
  }, []);

  const onCreate = useCallback(async () => {
    if (phase !== 'idle') return;
    const ok = await requireBiometric('Create your dWallet');
    if (!ok) return;
    setPhase('creating');
    setStatusLog([]);
    try {
      const record = await createDWallet('sepolia', (e: IkaProgress) => {
        if (e.stage === 'dkg-pre') log('Initiating DKG…');
        else if (e.stage === 'dkg-network') log('Generating distributed key…');
        else if (e.stage === 'dkg-seal-share') log('Sealing your share with biometric key…');
        else if (e.stage === 'dkg-success') log(`dWallet created · ${e.dWallet.address}`);
      });
      setDWallet(record);
      await refreshBalance(record);
    } catch (e: any) {
      log(`error: ${e?.message ?? e}`);
      Alert.alert('Create failed', e?.message ?? String(e));
    } finally {
      setPhase('idle');
    }
  }, [phase, requireBiometric, log, refreshBalance]);

  const onSend = useCallback(async () => {
    if (!dWallet || phase !== 'idle') return;
    const to = recipient.trim();
    if (!ethers.isAddress(to)) {
      Alert.alert('Invalid address', 'Enter a valid Ethereum address (0x…).');
      return;
    }
    let amount: bigint;
    try {
      amount = ethers.parseEther(amountEth.trim() || '0');
      if (amount <= 0n) throw new Error('amount must be positive');
    } catch (e: any) {
      Alert.alert('Invalid amount', e?.message ?? 'Enter an ETH amount.');
      return;
    }
    const ok = await requireBiometric('Approve Sepolia send');
    if (!ok) return;

    setPhase('sending');
    setStatusLog([]);
    setLastTxHash(null);
    try {
      const result = await sendNative({ dWallet, to, amount }, (e: IkaProgress) => {
        if (e.stage === 'sign-pre') log('Unsealing share…');
        else if (e.stage === 'sign-network') log('Producing dWallet signature…');
        else if (e.stage === 'sign-success') log(`signed · ${e.signatureHex.slice(0, 18)}…`);
        else if (e.stage === 'broadcast-pre') log('Broadcasting to Sepolia…');
        else if (e.stage === 'broadcast-success') log(`tx · ${e.txHash}`);
      });
      setLastTxHash(result.txHash);
      await refreshBalance(dWallet);
    } catch (e: any) {
      const detail = [e?.message, e?.cause?.message, e?.cause?.data].filter(Boolean).join(' · ');
      log(`error: ${detail || String(e)}`);
      Alert.alert('Send failed', detail || String(e));
    } finally {
      setPhase('idle');
    }
  }, [dWallet, phase, recipient, amountEth, requireBiometric, log, refreshBalance]);

  const onResetDWallet = useCallback(async () => {
    Alert.alert(
      'Delete dWallet?',
      'This wipes the local user share. The dWallet will be unrecoverable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDWallet('sepolia');
            setDWallet(null);
            setBalanceWei(null);
            setLastTxHash(null);
            setStatusLog([]);
          },
        },
      ],
    );
  }, []);

  const copy = useCallback(async (s: string, label: string) => {
    await Clipboard.setStringAsync(s);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  }, []);

  const balanceEth = balanceWei == null
    ? '0.0000'
    : Number(ethers.formatEther(balanceWei)).toFixed(4);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader title="Multi-chain" onClose={onBack} />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.chainRow}>
            <View style={styles.chainDot} />
            <Text style={styles.chainLabel}>{CHAIN.label}</Text>
          </View>

          {!dWallet && (
            <View style={{ marginBottom: spacing.xl }}>
              <PrimaryButton
                label={phase === 'creating' ? 'Creating dWallet...' : 'Create dWallet'}
                onPress={onCreate}
                loading={phase === 'creating'}
                disabled={phase !== 'idle'}
                fullWidth
                icon={<Icon name="plus" size={18} color={colors.white} />}
              />
            </View>
          )}

          {dWallet && (
            <View style={styles.card}>
              <Text style={styles.label}>Your Sepolia address</Text>
              <TouchableOpacity onPress={() => copy(dWallet.address, 'Address')} activeOpacity={0.7}>
                <Text style={styles.mono}>{dWallet.address}</Text>
              </TouchableOpacity>
              <Text style={styles.balance}>{balanceEth} ETH</Text>
              <View style={styles.linkRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => Linking.openURL(CHAIN.explorerAddrBase + dWallet.address)}
                >
                  <Text style={styles.link}>View on Etherscan →</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7} onPress={() => refreshBalance(dWallet)}>
                  <Text style={styles.link}>Refresh balance →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {dWallet && (
            <View style={styles.card}>
              <Text style={styles.label}>Send Sepolia ETH</Text>
              <TextInput
                style={styles.input}
                placeholder="0xRecipient…"
                placeholderTextColor={colors.textSubtle}
                value={recipient}
                onChangeText={setRecipient}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                placeholder="Amount in ETH"
                placeholderTextColor={colors.textSubtle}
                value={amountEth}
                onChangeText={setAmountEth}
                keyboardType="decimal-pad"
              />
              <View style={{ marginTop: spacing.sm }}>
                <PrimaryButton
                  label={phase === 'sending' ? 'Signing & broadcasting...' : 'Sign & broadcast'}
                  onPress={onSend}
                  loading={phase === 'sending'}
                  disabled={phase !== 'idle'}
                  fullWidth
                />
              </View>
              {lastTxHash && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => Linking.openURL(CHAIN.explorerTxBase + lastTxHash)}
                  style={{ marginTop: spacing.md }}
                >
                  <Text style={styles.link}>View last tx · {lastTxHash.slice(0, 10)}… →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {statusLog.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.label}>Activity</Text>
              {statusLog.map((line, i) => (
                <Text key={i} style={styles.logLine}>
                  · {line}
                </Text>
              ))}
            </View>
          )}

          {dWallet && (
            <TouchableOpacity onPress={onResetDWallet} activeOpacity={0.7} style={styles.dangerBtn}>
              <Text style={styles.dangerText}>Delete dWallet</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
  },

  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  chainDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#627EEA',
  },
  chainLabel: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: colors.text,
  },
  helper: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 13,
    color: colors.text,
    marginBottom: spacing.md,
  },
  balance: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -1,
    marginBottom: spacing.md,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  link: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  logLine: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    marginBottom: 4,
    lineHeight: 18,
  },
  dangerBtn: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  dangerText: {
    color: colors.dangerText,
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
