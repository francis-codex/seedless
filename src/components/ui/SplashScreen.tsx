// Brand splash screen used as the first thing the user sees on cold launch
// while the wallet provider boots, passkey state is rehydrated, and the
// initial route resolves. Different from `StateScreen` because it's brand
// presence, not a transient transaction state.

import React from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../../theme';

const BRAND_LOGO = require('../../../assets/icon.png');

interface SplashScreenProps {
  /** Optional tagline shown under the wordmark. Defaults to the canonical line. */
  tagline?: string;
  /** Whether to show the activity indicator (default true). */
  showSpinner?: boolean;
}

export function SplashScreen({
  tagline = 'Simple and private passkey wallet on Solana',
  showSpinner = true,
}: SplashScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Image source={BRAND_LOGO} style={styles.logo} resizeMode="contain" />
        <Text style={styles.wordmark}>Seedless</Text>
        <Text style={styles.tagline}>{tagline}</Text>
      </View>
      {showSpinner && (
        <View style={styles.spinnerWrap}>
          <ActivityIndicator color={colors.textMuted} size="small" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 20,
  },
  wordmark: {
    ...typography.title,
    fontSize: 28,
    marginTop: spacing.lg,
  },
  tagline: {
    ...typography.bodyMuted,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  spinnerWrap: {
    alignItems: 'center',
    paddingBottom: spacing.xxxl,
  },
});
