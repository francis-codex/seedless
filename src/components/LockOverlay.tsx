import React, { memo, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../theme';
import { PrimaryButton, Icon } from './ui';
import { promptBiometric } from '../utils/walletLock';

const BRAND_LOGO = require('../../assets/icon.png');

interface LockOverlayProps {
  onUnlock: () => void;
}

// Full-screen blocker shown when the wallet is locked. Triggers a biometric
// prompt automatically on mount and lets the user re-trigger if they cancel.
function LockOverlayInner({ onUnlock }: LockOverlayProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await promptBiometric('Unlock Seedless');
      if (ok) {
        onUnlock();
      } else {
        setError('Authentication cancelled');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Could not authenticate');
    } finally {
      setBusy(false);
    }
  }, [onUnlock]);

  // Fire the prompt automatically on mount so the lock feels seamless when
  // the user opens the app and they've already authenticated to the OS.
  useEffect(() => {
    tryUnlock();
  }, [tryUnlock]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <View style={styles.brandRow}>
          <Image source={BRAND_LOGO} style={styles.brandLogo} />
        </View>
        <View style={styles.lockBadge}>
          <Icon name="lock" size={20} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.lockText}>Wallet locked</Text>
        </View>
        <Text style={styles.subtitle}>Use your device biometrics to unlock.</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {busy ? (
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: spacing.xl }} />
        ) : (
          <View style={{ marginTop: spacing.xl, width: '100%' }}>
            <PrimaryButton label="Unlock" onPress={tryUnlock} fullWidth />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  brandRow: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  brandLogo: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  subtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.dangerText,
    marginTop: spacing.sm,
  },
});

export const LockOverlay = memo(LockOverlayInner);
