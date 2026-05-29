import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  StatusBar,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, Icon, IconName } from '../components/ui';
import {
  checkBiometricSupport,
  getLockTimeoutMs,
  isLockEnabled,
  promptBiometric,
  setLockEnabled,
  setLockTimeoutMs,
} from '../utils/walletLock';

interface SettingsScreenProps {
  onBack: () => void;
  onOpenAddressBook: () => void;
}

const SEEDLESS_X = 'https://x.com/seedless_wallet';
const FRANCIS_X = 'https://x.com/francis_codex';
const WEBSITE = 'https://seedlesslabs.xyz';

const TIMEOUT_OPTIONS: { label: string; ms: number }[] = [
  { label: 'Immediately', ms: 0 },
  { label: '1 minute', ms: 60_000 },
  { label: '5 minutes', ms: 5 * 60_000 },
  { label: '15 minutes', ms: 15 * 60_000 },
];

export function SettingsScreen({ onBack, onOpenAddressBook }: SettingsScreenProps) {
  const { disconnect } = useWallet();
  const version =
    Constants.expoConfig?.version ?? (Constants as any).manifest?.version ?? '—';

  const [lockEnabled, setLockEnabledState] = useState(false);
  const [lockTimeout, setLockTimeoutState] = useState(60_000);

  useEffect(() => {
    (async () => {
      setLockEnabledState(await isLockEnabled());
      setLockTimeoutState(await getLockTimeoutMs());
    })();
  }, []);

  const handleToggleLock = useCallback(async (next: boolean) => {
    if (next) {
      const support = await checkBiometricSupport();
      if (!support.available || !support.enrolled) {
        Alert.alert('Cannot enable lock', support.reason ?? 'Biometrics unavailable on this device.');
        return;
      }
      const ok = await promptBiometric('Confirm to enable wallet lock');
      if (!ok) return;
    }
    await setLockEnabled(next);
    setLockEnabledState(next);
  }, []);

  const handleChangeTimeout = useCallback(() => {
    Alert.alert(
      'Lock after',
      'How long the app can be backgrounded before locking.',
      [
        ...TIMEOUT_OPTIONS.map((opt) => ({
          text: opt.label + (lockTimeout === opt.ms ? '  ✓' : ''),
          onPress: async () => {
            await setLockTimeoutMs(opt.ms);
            setLockTimeoutState(opt.ms);
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }, [lockTimeout]);

  const currentTimeoutLabel =
    TIMEOUT_OPTIONS.find((opt) => opt.ms === lockTimeout)?.label ?? `${Math.round(lockTimeout / 60_000)} min`;

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open link', url);
    }
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect wallet?',
      'Your passkey stays safe. You can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnect();
            } catch (err: any) {
              Alert.alert('Failed', err?.message ?? 'Could not disconnect.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <ScreenHeader title="Settings" onClose={onBack} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Network">
          <Row
            icon="shield"
            label="Solana mainnet"
            value="Live"
            valueTone="success"
          />
        </Section>

        <Section title="Security">
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.iconBubble}>
                <Icon name="lock" size={18} color={colors.textMuted} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Lock wallet</Text>
                <Text style={styles.rowSubtitle}>
                  Require biometrics when reopening the app
                </Text>
              </View>
            </View>
            <Switch
              value={lockEnabled}
              onValueChange={handleToggleLock}
              trackColor={{ false: colors.surfaceMuted, true: colors.accent }}
              thumbColor={colors.white}
            />
          </View>
          {lockEnabled ? (
            <LinkRow
              icon="lightning"
              label={`Lock after ${currentTimeoutLabel}`}
              onPress={handleChangeTimeout}
            />
          ) : null}
        </Section>

        <Section title="Recipients">
          <LinkRow icon="bookmark" label="Address book" onPress={onOpenAddressBook} />
        </Section>

        <Section title="Appearance">
          <Row
            icon="eye"
            label="Theme"
            value="Dark"
            subtitle="Light mode coming in the next build"
          />
        </Section>

        <Section title="About">
          <LinkRow icon="lightning" label="Follow @seedless_wallet" onPress={() => openUrl(SEEDLESS_X)} />
          <LinkRow icon="lightning" label="Follow @francis_codex" onPress={() => openUrl(FRANCIS_X)} />
          <LinkRow icon="discover" label="seedlesslabs.xyz" onPress={() => openUrl(WEBSITE)} />
          <Row icon="settings" label="Version" value={version} />
        </Section>

        <Section title="Wallet">
          <LinkRow
            icon="close"
            label="Disconnect wallet"
            onPress={handleDisconnect}
            tone="danger"
          />
        </Section>

        <Text style={styles.footer}>seedless · simple and private passkey wallet on solana</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface RowProps {
  icon: IconName;
  label: string;
  value?: string;
  subtitle?: string;
  valueTone?: 'default' | 'success' | 'danger';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value, subtitle, valueTone = 'default' }: RowProps) {
  const valueColor =
    valueTone === 'success'
      ? colors.successText
      : valueTone === 'danger'
        ? colors.dangerText
        : colors.textMuted;
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.iconBubble}>
          <Icon name={icon} size={18} color={colors.textMuted} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{label}</Text>
          {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {value ? <Text style={[styles.rowValue, { color: valueColor }]}>{value}</Text> : null}
    </View>
  );
}

interface LinkRowProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger';
}

function LinkRow({ icon, label, onPress, tone = 'default' }: LinkRowProps) {
  const labelColor = tone === 'danger' ? colors.dangerText : colors.text;
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.iconBubble}>
          <Icon name={icon} size={18} color={tone === 'danger' ? colors.dangerText : colors.textMuted} strokeWidth={2} />
        </View>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textSubtle} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl * 3,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.text,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textSubtle,
    marginTop: 2,
  },
  rowValue: {
    ...typography.body,
    color: colors.textMuted,
  },
  footer: {
    ...typography.caption,
    color: colors.textSubtle,
    textAlign: 'center',
    marginTop: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
});
