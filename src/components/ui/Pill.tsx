import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

type Variant = 'success' | 'danger' | 'neutral' | 'warning';

interface PillProps {
  label: string;
  variant?: Variant;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const variantStyles: Record<Variant, { bg: string; fg: string }> = {
  success: { bg: colors.successBg, fg: colors.successText },
  danger: { bg: colors.dangerBg, fg: colors.dangerText },
  warning: { bg: colors.warningBg, fg: colors.warningText },
  neutral: { bg: colors.surface, fg: colors.text },
};

export function Pill({ label, variant = 'neutral', size = 'sm', style, textStyle }: PillProps) {
  const v = variantStyles[variant];
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: v.bg },
        size === 'md' && styles.md,
        style,
      ]}
    >
      <Text style={[styles.text, { color: v.fg }, textStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  md: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  text: {
    ...typography.pill,
  },
});
