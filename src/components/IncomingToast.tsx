import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '../theme';
import { Icon, IconName } from './ui';

// Match the WalletHeader floor so the toast never clips behind the iOS 26
// dynamic island. react-native-safe-area-context v5 has been returning
// smaller insets than expected on the iOS 26.2 sim.
const TOAST_TOP_FLOOR = Platform.OS === 'ios' ? 64 : 28;

interface IncomingToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  onPress?: () => void;
  // Optional: override the default "Incoming transaction" title + arrowDown
  // icon. Used to reuse this banner for outgoing-tx confirmations (send,
  // swap) instead of OS-default Alert dialogs — keeps success affordances
  // consistent with the rest of the Wells UI.
  title?: string;
  iconName?: IconName;
}

// Slide-down banner shown when a new incoming tx is detected while the
// app is in the foreground. Auto-dismisses after 4s, can be tapped to
// open history.
// Hide-distance must be large enough to push the entire toast above the
// screen edge regardless of its `top:` offset. The previous -100 value was
// sized for a smaller top inset and started peeking out below the dynamic
// island once we floored top at 64pt. -240 covers any realistic top + toast
// height combination.
const HIDDEN_TRANSLATE_Y = -240;

export function IncomingToast({ message, visible, onDismiss, onPress, title = 'Incoming transaction', iconName = 'arrowDown' }: IncomingToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(HIDDEN_TRANSLATE_Y)).current;
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
        toValue: HIDDEN_TRANSLATE_Y,
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
      style={[styles.wrap, { top: Math.max(insets.top, TOAST_TOP_FLOOR) + spacing.sm, transform: [{ translateY }] }]}
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
          <Icon name={iconName} size={16} color={colors.successText} strokeWidth={2.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
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
    color: colors.text,
    fontWeight: '600',
  },
  body: {
    ...typography.body,
    color: colors.text,
    marginTop: 2,
  },
});
