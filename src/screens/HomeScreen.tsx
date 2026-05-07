import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import * as Linking from 'expo-linking';
import * as LocalAuthentication from 'expo-local-authentication';
import { APP_VERSION } from '../constants';
import { colors, radii, spacing, typography } from '../theme';
import { Icon, PrimaryButton } from '../components/ui';

interface HomeScreenProps {
  onConnected: () => void;
}

export function HomeScreen({ onConnected }: HomeScreenProps) {
  const { connect, isConnecting } = useWallet();

  const handleConnect = async () => {
    try {
      // Check biometric enrollment before attempting passkey auth
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware) {
        Alert.alert(
          'Biometrics Required',
          'This device does not support biometric authentication. Seedless requires Face ID, fingerprint, or device passcode to create a passkey wallet.'
        );
        return;
      }

      if (!isEnrolled) {
        Alert.alert(
          'Set Up Biometrics',
          'Please set up fingerprint or Face ID in your device settings before connecting. Seedless uses biometrics to secure your wallet.'
        );
        return;
      }

      // Create deep link URL for callback after passkey auth
      const redirectUrl = Linking.createURL('callback');

      await connect({
        redirectUrl,
        onSuccess: () => {
          onConnected();
        },
        onFail: (error) => {
          const msg = error.message || 'Connection failed';
          let friendly = msg;
          if (msg.includes('33 bytes') || msg.includes('got 0')) {
            friendly = 'Passkey error. Please set up fingerprint or Face ID in your device settings first.';
          } else if (msg.includes('ConstraintSeeds') || msg.includes('0x7d6')) {
            friendly = 'Wallet creation failed. Please try again with a different account name.';
          }
          Alert.alert('Connection Failed', friendly);
        },
      });
    } catch (error: any) {
      console.error('Connection failed:', error);
      const msg = error.message || 'Failed to connect';
      let friendly = msg;
      if (msg.includes('33 bytes') || msg.includes('got 0')) {
        friendly = 'Passkey error. Please make sure biometrics (fingerprint or Face ID) are set up on your device, then try again.';
      } else if (msg.includes('ConstraintSeeds') || msg.includes('0x7d6')) {
        friendly = 'Wallet creation failed. Please try again with a different account name.';
      }
      Alert.alert('Connection Failed', friendly);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Icon name="shield" size={28} color={colors.white} strokeWidth={2.4} />
          </View>
          <View>
            <Text style={styles.brandText}>Seedless</Text>
            <Text style={styles.brandSub}>passkey wallet on Solana</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.tagline}>
            Your face{'\n'}is your wallet.
          </Text>

          <Text style={styles.taglineSub}>
            No seed phrases. No browser extensions. No gas fees. Just your passkey.
          </Text>

          <View style={styles.features}>
            <Feature label="Passkey authentication" />
            <Feature label="Gasless transactions" />
            <Feature label="Private sends via Umbra" />
            <Feature label="Multi-chain via Ika" />
          </View>
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            label={isConnecting ? 'Connecting...' : 'Create or connect wallet'}
            onPress={handleConnect}
            loading={isConnecting}
            fullWidth
          />
          <Text style={styles.poweredBy}>
            Seedless Labs, Inc. · v{APP_VERSION}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Feature({ label }: { label: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureDot}>
        <Icon name="check" size={14} color={colors.successText} strokeWidth={3} />
      </View>
      <Text style={styles.featureText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xxxl,
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    ...typography.title,
    fontSize: 24,
  },
  brandSub: {
    ...typography.caption,
    marginTop: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  tagline: {
    fontSize: 48,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -1.5,
    lineHeight: 54,
    marginBottom: spacing.xl,
  },
  taglineSub: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 17,
    lineHeight: 26,
    marginBottom: spacing.xxxl,
  },
  features: {
    gap: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    ...typography.body,
  },
  footer: {
    paddingTop: spacing.xl,
  },
  poweredBy: {
    textAlign: 'center',
    color: colors.textSubtle,
    marginTop: spacing.lg,
    fontSize: 13,
  },
});
