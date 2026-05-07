import React from 'react';
import { View, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { colors } from '../../theme';

const SEED_LOGO = require('../../../assets/icon.png');

const REMOTE: Record<string, string> = {
  SOL: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  USDC: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
};

interface TokenLogoProps {
  symbol: string;
  size?: number;
  source?: ImageSourcePropType;
}

export function TokenLogo({ symbol, size = 44, source }: TokenLogoProps) {
  const sym = symbol.toUpperCase();
  const localSrc: ImageSourcePropType | null =
    source ?? (sym === 'SEED' ? SEED_LOGO : null);
  const remoteUri = !localSrc ? REMOTE[sym] : undefined;
  const finalSource: ImageSourcePropType =
    localSrc ?? (remoteUri ? { uri: remoteUri } : SEED_LOGO);

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Image source={finalSource} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
});
