// Generic full-screen state component used for the three Wells UI gaps that
// every flow needs: Loading, Success, and Error.
//
// Usage:
//   <StateScreen variant="loading" title="Confirming..." />
//   <StateScreen variant="success" title="Sent" subtitle="0.5 SOL → ..." actionLabel="Done" onAction={...} />
//   <StateScreen variant="error" title="Transaction failed" subtitle="Not enough SOL" actionLabel="Try again" onAction={...} />

import React, { memo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { colors, radii, spacing, typography } from '../../theme';

export type StateVariant = 'loading' | 'success' | 'error';

export interface StateScreenProps {
  variant: StateVariant;
  title: string;
  subtitle?: string;
  /** Optional secondary detail line (e.g. transaction signature short form). */
  detail?: string;
  /** CTA button label. Hidden when omitted (used for terminal loading states). */
  actionLabel?: string;
  onAction?: () => void;
  /** Secondary action — usually "View on Explorer" for success. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

function StateScreenInner({
  variant,
  title,
  subtitle,
  detail,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: StateScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        <View style={[styles.iconWrap, variantIconBg[variant]]}>
          {variant === 'loading' ? (
            <ActivityIndicator color={colors.text} size="large" />
          ) : variant === 'success' ? (
            <Icon name="check" size={36} color={colors.successText} strokeWidth={3} />
          ) : (
            <Icon name="close" size={36} color={colors.dangerText} strokeWidth={3} />
          )}
        </View>

        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>

      {(actionLabel || secondaryActionLabel) && (
        <View style={styles.actions}>
          {actionLabel && (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.primaryBtn}
              onPress={onAction}
            >
              <Text style={styles.primaryBtnLabel}>{actionLabel}</Text>
            </TouchableOpacity>
          )}
          {secondaryActionLabel && (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.secondaryBtn}
              onPress={onSecondaryAction}
            >
              <Text style={styles.secondaryBtnLabel}>{secondaryActionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const variantIconBg: Record<StateVariant, { backgroundColor: string }> = {
  loading: { backgroundColor: colors.surface },
  success: { backgroundColor: colors.successBg },
  error: { backgroundColor: colors.dangerBg },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xxl,
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.title,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  detail: {
    fontSize: 13,
    color: colors.textSubtle,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  primaryBtn: {
    backgroundColor: colors.solid,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  primaryBtnLabel: {
    color: colors.onSolid,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  secondaryBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryBtnLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500' as const,
  },
});

export const StateScreen = memo(StateScreenInner);
