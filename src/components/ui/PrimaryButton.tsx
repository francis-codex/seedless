import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface PrimaryButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

const variantStyles: Record<Variant, { bg: string; fg: string }> = {
  primary: { bg: colors.accent, fg: colors.white },
  secondary: { bg: colors.surface, fg: colors.text },
  danger: { bg: '#FF5158', fg: colors.white },
  ghost: { bg: 'transparent', fg: colors.text },
};

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  fullWidth,
  style,
  textStyle,
  icon,
}: PrimaryButtonProps) {
  const v = variantStyles[variant];
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        { backgroundColor: v.bg },
        fullWidth && { flex: 1 },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, { color: v.fg }, textStyle]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
});
