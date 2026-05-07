import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

interface ActionButtonProps {
  icon: React.ReactNode;
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  size?: number;
}

export function ActionButton({ icon, label, onPress, disabled, style, size = 56 }: ActionButtonProps) {
  return (
    <View style={[styles.wrap, style]}>
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        onPress={onPress}
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
          disabled && { opacity: 0.4 },
        ]}
      >
        {icon}
      </TouchableOpacity>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  circle: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.caption,
    marginTop: 2,
  },
});
