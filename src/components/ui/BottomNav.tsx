import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme';
import { Icon, IconName } from './Icon';

export type NavTab = 'wallet' | 'swap' | 'settings';

interface BottomNavProps {
  active: NavTab;
  onChange: (tab: NavTab) => void;
}

const TABS: { key: NavTab; icon: IconName }[] = [
  { key: 'wallet', icon: 'wallet' },
  { key: 'swap', icon: 'swap' },
  { key: 'settings', icon: 'settings' },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <TouchableOpacity
            key={t.key}
            activeOpacity={0.7}
            onPress={() => onChange(t.key)}
            style={styles.btn}
          >
            <View style={[styles.circle, isActive && styles.activeCircle]}>
              <Icon
                name={t.icon}
                size={22}
                color={isActive ? colors.white : colors.textMuted}
                strokeWidth={2}
              />
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(11,37,69,0.05)',
    shadowColor: '#0B2545',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCircle: {
    backgroundColor: colors.accent,
  },
});
