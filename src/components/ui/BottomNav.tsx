import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme';
import { Icon, IconName } from './Icon';

export type NavTab = 'wallet' | 'discover' | 'settings';

interface BottomNavProps {
  active: NavTab;
  onChange: (tab: NavTab) => void;
}

const TABS: { key: NavTab; icon: IconName }[] = [
  { key: 'wallet', icon: 'wallet' },
  { key: 'discover', icon: 'discover' },
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
                size={24}
                color={isActive ? colors.white : colors.textSubtle}
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
    paddingHorizontal: spacing.xxxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.bg,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCircle: {
    backgroundColor: colors.accent,
  },
});
