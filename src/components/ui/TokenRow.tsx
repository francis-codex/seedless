import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, spacing, typography } from '../../theme';
import { TokenLogo } from './TokenLogo';

interface TokenRowProps {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  price?: string;
  changePct?: number | null;
  onPress?: () => void;
}

function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2 14.4 4.8l3.7-.4.4 3.7L21 10.6 19.2 14l1.3 3.4-3.4 1.3L15.8 22l-3.4-1.3L9 22 7.7 18.7 4.3 17.4 5.6 14 3.5 10.6l2.5-2.5.4-3.7 3.7.4Z"
        fill={colors.accent}
      />
      <Path d="m9 12 2.2 2.2L15 10" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TokenRowInner({ symbol, name, balance, usdValue, price, changePct, onPress }: TokenRowProps) {
  const hasChange = changePct != null && !isNaN(changePct);
  const changeColor = hasChange ? (changePct! >= 0 ? colors.successText : colors.dangerText) : colors.textMuted;
  const changeLabel = hasChange ? `${changePct! >= 0 ? '+' : ''}${changePct!.toFixed(2)}%` : null;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} disabled={!onPress} style={styles.row}>
      <TokenLogo symbol={symbol} size={44} />
      <View style={styles.middle}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <VerifiedBadge size={14} />
        </View>
        <View style={styles.priceLine}>
          {price ? <Text style={styles.price}>{price}</Text> : null}
          {changeLabel ? (
            <Text style={[styles.change, { color: changeColor }]}>{changeLabel}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.value}>{usdValue}</Text>
        <Text style={styles.balance}>{balance}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: colors.text,
    letterSpacing: -0.2,
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  price: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500' as const,
  },
  change: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  value: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: colors.text,
    letterSpacing: -0.2,
  },
  balance: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500' as const,
  },
});

// Memoized so re-renders driven by sibling token rows (one balance
// updating, another not) only re-paint the rows that actually changed.
export const TokenRow = memo(TokenRowInner);
