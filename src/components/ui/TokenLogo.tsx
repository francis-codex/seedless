import React from 'react';
import { View, Text, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { colors, radii } from '../../theme';

interface TokenLogoProps {
  symbol: string;
  size?: number;
  source?: ImageSourcePropType;
  bg?: string;
  fg?: string;
}

const PRESETS: Record<string, { bg: string; fg: string }> = {
  SOL: { bg: '#0B0B0F', fg: '#9945FF' },
  USDC: { bg: '#2775CA', fg: '#FFFFFF' },
  SEED: { bg: colors.accent, fg: '#FFFFFF' },
};

export function TokenLogo({ symbol, size = 48, source, bg, fg }: TokenLogoProps) {
  const preset = PRESETS[symbol.toUpperCase()] ?? { bg: colors.surface, fg: colors.text };
  const finalBg = bg ?? preset.bg;
  const finalFg = fg ?? preset.fg;

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: finalBg },
      ]}
    >
      {source ? (
        <Image source={source} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
      ) : (
        <Text
          style={[
            styles.symbol,
            { color: finalFg, fontSize: size * 0.36 },
          ]}
        >
          {symbol.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  symbol: {
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
});
