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
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { PublicKey } from '@solana/web3.js';
import { isValidSolanaAddress } from '../constants';

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

  // Use refs to avoid re-firing the mount effect when hook fns get new refs.
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => load()} />}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Devices</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.lede}>
        Authorities that can spend from this wallet. Your passkey is the owner. Add an ed25519 key to let another device or signer co-sign.
      </Text>

      <View style={styles.addCard}>
        <Text style={styles.addTitle}>Add device key</Text>
        <TextInput
          style={styles.input}
          placeholder="Ed25519 public key (base58)"
          placeholderTextColor="#999"
          value={newKey}
          onChangeText={setNewKey}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.primaryButton, isAdding && styles.buttonDisabled]}
          onPress={handleAdd}
          disabled={isAdding || !smartWalletPubkey}
          activeOpacity={0.8}
        >
          {isAdding ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Add as spender</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Current authorities</Text>
        <TouchableOpacity onPress={() => load()} disabled={isLoading}>
          <Text style={styles.refreshText}>{isLoading ? 'Loading…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {authorities.length === 0 && !isLoading && (
        <Text style={styles.emptyText}>No authorities yet.</Text>
      )}

      {authorities.map((entry) => (
        <View key={entry.authorityPda} style={styles.authorityRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowTopLine}>
              <Text style={styles.roleBadge}>{roleLabel(entry.role)}</Text>
              <Text style={styles.typeBadge}>{typeLabel(entry.authorityType)}</Text>
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
              styles.removeButton,
              entry.role === ROLE_OWNER && styles.removeButtonDisabled,
            ]}
            onPress={() => confirmRemove(entry)}
            disabled={entry.role === ROLE_OWNER || removingPda === entry.authorityPda}
          >
            {removingPda === entry.authorityPda ? (
              <ActivityIndicator color="#c00" size="small" />
            ) : (
              <Text style={styles.removeButtonText}>Remove</Text>
            )}
          </TouchableOpacity>
        </View>
      ))}

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>Notes</Text>
        <Text style={styles.infoItem}>Spenders can sign transfers and swaps.</Text>
        <Text style={styles.infoItem}>Adding an authority requires a Face ID prompt.</Text>
        <Text style={styles.infoItem}>The owner authority cannot be removed here.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 80 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backText: { fontSize: 16, color: '#666' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#000' },
  lede: {
    fontSize: 14,
    color: '#555',
    marginBottom: 20,
    lineHeight: 20,
  },
  addCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 14,
    padding: 16,
    marginBottom: 28,
  },
  addTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#000',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#000',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listTitle: { fontSize: 15, fontWeight: '600', color: '#000' },
  refreshText: { fontSize: 13, color: '#666' },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 24,
  },
  authorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  rowTopLine: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  roleBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadge: {
    fontSize: 11,
    color: '#666',
    backgroundColor: '#f1f1f1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  credentialText: {
    fontSize: 13,
    color: '#333',
    fontFamily: 'Menlo',
  },
  removeButton: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removeButtonDisabled: { opacity: 0.4 },
  removeButtonText: { fontSize: 13, color: '#c00', fontWeight: '600' },
  infoSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  infoTitle: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 10 },
  infoItem: { fontSize: 13, color: '#666', marginBottom: 6 },
});
