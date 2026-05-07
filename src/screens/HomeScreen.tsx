import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  StatusBar,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import * as Linking from 'expo-linking';
import * as LocalAuthentication from 'expo-local-authentication';
import { APP_VERSION } from '../constants';
import { colors, spacing, typography } from '../theme';
import { PrimaryButton } from '../components/ui';

interface HomeScreenProps {
  onConnected: () => void;
}

export function HomeScreen({ onConnected }: HomeScreenProps) {
  const { connect, isConnecting } = useWallet();

  // Subtle, looping pulse on the brand mark — soft motion, no distraction.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.8],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.35, 0.12, 0],
  });

  const markScale = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.04, 1],
  });

  const handleConnect = async () => {
    try {
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

      const redirectUrl = Linking.createURL('callback');

      await connect({
        redirectUrl,
        onSuccess: () => onConnected(),
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

      <View style={styles.center}>
        <View style={styles.markWrap}>
          <Animated.View
            style={[
              styles.ring,
              { transform: [{ scale: ringScale }], opacity: ringOpacity },
            ]}
          />
          <Animated.View
            style={[
              styles.mark,
              { transform: [{ scale: markScale }] },
            ]}
          >
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logo}
              resizeMode="cover"
            />
          </Animated.View>
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={isConnecting ? 'Launching...' : 'Launch'}
          onPress={handleConnect}
          loading={isConnecting}
          fullWidth
        />
        <Text style={styles.poweredBy}>
          Seedless Labs, Inc. · v{APP_VERSION}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const RING_SIZE = 160;
const MARK_SIZE = 128;
const LOGO_RADIUS = 28;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  markWrap: {
    width: RING_SIZE * 2,
    height: RING_SIZE * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: colors.accent,
  },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: LOGO_RADIUS,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  wordmark: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: -1,
  },
  footer: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  poweredBy: {
    textAlign: 'center',
    color: colors.textSubtle,
    fontSize: 12,
  },
});
