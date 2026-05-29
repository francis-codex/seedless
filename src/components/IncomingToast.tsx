import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../theme';
import { Icon } from './ui';

interface IncomingToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  onPress?: () => void;
}

// Slide-down banner shown when a new incoming tx is detected while the
// app is in the foreground. Auto-dismisses after 4s, can be tapped to
// open history.
export function IncomingToast({ message, visible, onDismiss, onPress }: IncomingToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 6,
      }).start();
      dismissTimer.current = setTimeout(() => {
        onDismiss();
      }, 4000);
    } else {
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [visible, onDismiss, translateY]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.wrap, { top: insets.top + spacing.sm, transform: [{ translateY }] }]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          if (onPress) onPress();
          onDismiss();
        }}
        style={styles.toast}
      >
        <View style={styles.iconBubble}>
          <Icon name="arrowDown" size={16} color={colors.successText} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Incoming transaction</Text>
          <Text style={styles.body} numberOfLines={2}>
            {message}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.caption,
    color: colors.textMuted,
  },
  body: {
    ...typography.body,
    color: colors.text,
    marginTop: 2,
  },
});
