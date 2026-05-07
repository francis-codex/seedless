import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';
import { Icon, IconName } from './Icon';

interface WalletHeaderProps {
  onMenuPress?: () => void;
  onScanPress?: () => void;
  style?: ViewStyle;
}

export function WalletHeader({ onMenuPress, onScanPress, style }: WalletHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <TouchableOpacity activeOpacity={0.7} onPress={onMenuPress} style={styles.menuBtn}>
        <Icon name="wallet" size={22} color={colors.white} strokeWidth={2.2} />
      </TouchableOpacity>
      {onScanPress ? (
        <TouchableOpacity activeOpacity={0.7} onPress={onScanPress} style={styles.iconBtn}>
          <Icon name="scan" size={20} color={colors.text} />
        </TouchableOpacity>
      ) : null}
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
          <TouchableOpacity activeOpacity={0.7} onPress={onRightPress} style={styles.iconBtn}>
            <Icon name={rightIcon} size={20} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        {onClose ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.iconBtn}>
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
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
