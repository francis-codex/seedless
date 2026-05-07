import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { TokenLogo } from './TokenLogo';
import { Pill } from './Pill';

interface TokenRowProps {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  changePct?: number | null;
  onPress?: () => void;
}

export function TokenRow({ symbol, name, balance, usdValue, changePct, onPress }: TokenRowProps) {
  const variant = changePct == null ? null : changePct >= 0 ? 'success' : 'danger';
  const pctLabel = changePct == null ? null : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} disabled={!onPress} style={styles.row}>
      <TokenLogo symbol={symbol} size={48} />
      <View style={styles.middle}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.balance}>{balance}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.value}>{usdValue}</Text>
        {pctLabel && variant ? <Pill label={pctLabel} variant={variant} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  middle: {
    flex: 1,
  },
  name: {
    ...typography.title,
  },
  balance: {
    ...typography.caption,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  value: {
    ...typography.title,
    color: colors.text,
  },
});
