import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';
import { Icon, IconName } from './Icon';

interface WalletHeaderProps {
  walletName: string;
  truncatedAddress: string;
  extraCount?: number;
  onProfilePress?: () => void;
  rightIcon?: IconName;
  onRightPress?: () => void;
  style?: ViewStyle;
}

export function WalletHeader({
  walletName,
  truncatedAddress,
  extraCount,
  onProfilePress,
  rightIcon = 'history',
  onRightPress,
  style,
}: WalletHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <TouchableOpacity activeOpacity={0.7} onPress={onProfilePress} style={styles.left}>
        <View style={styles.avatar}>
          <Icon name="wallet" size={22} color={colors.white} strokeWidth={2.2} />
        </View>
        <View style={styles.idCol}>
          <Text style={styles.walletName}>{walletName}</Text>
          <View style={styles.addrRow}>
            <View style={styles.addrPill}>
              <Text style={styles.addrText}>{truncatedAddress}</Text>
            </View>
            {extraCount && extraCount > 0 ? (
              <View style={styles.extraPill}>
                <Text style={styles.addrText}>+{extraCount}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.7} onPress={onRightPress} style={styles.rightBtn}>
        <Icon name={rightIcon} size={20} color={colors.text} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

interface ScreenHeaderProps {
  title: string;
  onClose?: () => void;
  rightIcon?: IconName;
  onRightPress?: () => void;
}

export function ScreenHeader({ title, onClose, rightIcon, onRightPress }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.titlePill}>
        <Text style={styles.titlePillText}>{title}</Text>
      </View>
      <View style={styles.headerRight}>
        {rightIcon ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onRightPress} style={styles.rightBtn}>
            <Icon name={rightIcon} size={20} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        {onClose ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.rightBtn}>
            <Icon name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idCol: {
    gap: 4,
  },
  walletName: {
    ...typography.heading,
    color: colors.text,
  },
  addrRow: {
    flexDirection: 'row',
    gap: 6,
  },
  addrPill: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  extraPill: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  addrText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.text,
  },
  rightBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titlePill: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  titlePillText: {
    ...typography.heading,
    color: colors.text,
  },
  headerRight: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
