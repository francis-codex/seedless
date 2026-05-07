import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { PublicKey } from '@solana/web3.js';
import { isValidSolanaAddress } from '../constants';
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, PrimaryButton, Pill, Icon } from '../components/ui';

interface AuthoritiesScreenProps {
  onBack: () => void;
}

const ROLE_OWNER = 0;
const ROLE_ADMIN = 1;
const ROLE_SPENDER = 2;

interface UiAuthority {
  authorityPda: string;
  authorityType: number;
  role: number;
  credential: string;
  shortCredential: string;
}

function roleLabel(role: number): string {
  if (role === ROLE_OWNER) return 'Owner';
  if (role === ROLE_ADMIN) return 'Admin';
  if (role === ROLE_SPENDER) return 'Spender';
  return `Role ${role}`;
}

function typeLabel(t: number): string {
  return t === 0 ? 'ed25519' : 'passkey';
}

function shortCred(bytes: Uint8Array): string {
  try {
    if (bytes.length === 32) return new PublicKey(bytes).toBase58();
    const hex = Buffer.from(bytes).toString('hex');
    return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
  } catch {
    return '—';
  }
}

export function AuthoritiesScreen({ onBack }: AuthoritiesScreenProps) {
  const {
    smartWalletPubkey,
    listAuthorities,
    addAuthorityEd25519,
    removeAuthority,
  } = useWallet();

  const [authorities, setAuthorities] = useState<UiAuthority[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingPda, setRemovingPda] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');

  const listAuthoritiesRef = useRef(listAuthorities);
  listAuthoritiesRef.current = listAuthorities;
  const hasLoadedRef = useRef(false);
  const isLoadingRef = useRef(false);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    if (!opts.silent) setIsLoading(true);
    try {
      const raw = await listAuthoritiesRef.current();
      const mapped: UiAuthority[] = raw.map((entry) => ({
        authorityPda: entry.authorityPda.toBase58(),
        authorityType: entry.authorityType,
        role: entry.role,
        credential: Buffer.from(entry.credential).toString('hex'),
        shortCredential: shortCred(entry.credential),
      }));
      setAuthorities(mapped);
      hasLoadedRef.current = true;
    } catch (error: any) {
      console.error('listAuthorities failed:', error);
      if (!opts.silent) Alert.alert('Could not load authorities', error?.message || 'Try again');
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!smartWalletPubkey) return;
    if (hasLoadedRef.current) return;
    load();
  }, [smartWalletPubkey, load]);

  const handleAdd = useCallback(async () => {
    const trimmed = newKey.trim();
    if (!trimmed) {
      Alert.alert('Missing key', 'Paste an ed25519 public key (base58)');
      return;
    }
    if (!isValidSolanaAddress(trimmed)) {
      Alert.alert('Invalid key', 'Enter a valid base58 ed25519 public key');
      return;
    }
    setIsAdding(true);
    try {
      const redirectUrl = Linking.createURL('authority-callback');
      await addAuthorityEd25519(
        { newEd25519Pubkey: new PublicKey(trimmed), role: ROLE_SPENDER },
        { redirectUrl },
      );
      setNewKey('');
      await load();
      Alert.alert('Added', 'New device can now spend from this wallet.');
    } catch (error: any) {
      console.error('addAuthority failed:', error);
      const msg: string = error?.message || '';
      const friendly = msg.includes('0x2')
        ? 'This wallet was created on an older program version that v2 authorities cannot extend. Use a freshly created wallet to test.'
        : msg || 'Try again';
      Alert.alert('Could not add', friendly);
    } finally {
      setIsAdding(false);
    }
  }, [newKey, addAuthorityEd25519, load]);

  const handleRemove = useCallback(async (pda: string) => {
    setRemovingPda(pda);
    try {
      const redirectUrl = Linking.createURL('authority-callback');
      await removeAuthority(
        { targetAuthorityPda: new PublicKey(pda) },
        { redirectUrl },
      );
      await load();
    } catch (error: any) {
      console.error('removeAuthority failed:', error);
      Alert.alert('Could not remove', error?.message || 'Try again');
    } finally {
      setRemovingPda(null);
    }
  }, [removeAuthority, load]);

  const confirmRemove = (entry: UiAuthority) => {
    if (entry.role === ROLE_OWNER) {
      Alert.alert('Cannot remove owner', 'The wallet owner authority is required.');
      return;
    }
    Alert.alert(
      'Remove authority?',
      `${roleLabel(entry.role)} · ${entry.shortCredential}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => handleRemove(entry.authorityPda) },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader title="Devices" onClose={onBack} />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => load()} tintColor={colors.text} />}
        >
          <Text style={styles.lede}>
            Authorities that can spend from this wallet. Your passkey is the owner. Add an
            ed25519 key to let another device or signer co-sign.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Add device key</Text>
            <TextInput
              style={styles.input}
              placeholder="Ed25519 public key (base58)"
              placeholderTextColor={colors.textSubtle}
              value={newKey}
              onChangeText={setNewKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <PrimaryButton
              label={isAdding ? 'Adding...' : 'Add as spender'}
              onPress={handleAdd}
              loading={isAdding}
              disabled={!smartWalletPubkey}
              fullWidth
              icon={<Icon name="plus" size={18} color={colors.white} />}
            />
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Current authorities</Text>
            <TouchableOpacity onPress={() => load()} disabled={isLoading} activeOpacity={0.7}>
              <Text style={styles.refreshLink}>{isLoading ? 'Loading…' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>

          {authorities.length === 0 && !isLoading && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No authorities yet.</Text>
            </View>
          )}

          {authorities.map((entry) => (
            <View key={entry.authorityPda} style={styles.authorityRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.badgeRow}>
                  <Pill
                    label={roleLabel(entry.role)}
                    variant={entry.role === ROLE_OWNER ? 'success' : 'neutral'}
                  />
                  <Pill label={typeLabel(entry.authorityType)} variant="neutral" />
                </View>
                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setStringAsync(entry.credential);
                    Alert.alert('Copied', 'Credential copied');
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={styles.credentialText}>{entry.shortCredential}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[
                  styles.removeBtn,
                  entry.role === ROLE_OWNER && { opacity: 0.4 },
                ]}
                onPress={() => confirmRemove(entry)}
                disabled={entry.role === ROLE_OWNER || removingPda === entry.authorityPda}
                activeOpacity={0.7}
              >
                {removingPda === entry.authorityPda ? (
                  <ActivityIndicator color={colors.dangerText} size="small" />
                ) : (
                  <Text style={styles.removeBtnText}>Remove</Text>
                )}
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.notesCard}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesItem}>Spenders can sign transfers and swaps.</Text>
            <Text style={styles.notesItem}>Adding an authority requires a Face ID prompt.</Text>
            <Text style={styles.notesItem}>The owner authority cannot be removed here.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1 },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl * 2,
  },
  lede: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.xxl,
  },
  cardTitle: {
    ...typography.heading,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.md,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  listTitle: {
    ...typography.heading,
  },
  refreshLink: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600' as const,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.caption,
  },
  authorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  credentialText: {
    fontSize: 13,
    color: colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  removeBtn: {
    backgroundColor: colors.dangerBg,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  removeBtnText: {
    fontSize: 13,
    color: colors.dangerText,
    fontWeight: '600' as const,
  },
  notesCard: {
    marginTop: spacing.xxl,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notesTitle: {
    ...typography.heading,
    marginBottom: spacing.sm,
  },
  notesItem: {
    ...typography.caption,
    fontSize: 14,
    marginBottom: 6,
  },
});
