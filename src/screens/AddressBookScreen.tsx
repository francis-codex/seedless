import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, PrimaryButton, Icon } from '../components/ui';
import {
  addAddress,
  AddressBookEntry,
  getAddressBook,
  removeAddress,
  updateAddress,
} from '../utils/addressBook';

interface AddressBookScreenProps {
  onBack: () => void;
}

export function AddressBookScreen({ onBack }: AddressBookScreenProps) {
  const [entries, setEntries] = useState<AddressBookEntry[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AddressBookEntry | null>(null);
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setEntries(await getAddressBook());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openNew = () => {
    setEditing(null);
    setLabel('');
    setAddress('');
    setEditorOpen(true);
  };

  const openEdit = (entry: AddressBookEntry) => {
    setEditing(entry);
    setLabel(entry.label);
    setAddress(entry.address);
    setEditorOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await updateAddress(editing.id, label);
      } else {
        await addAddress(label, address);
      }
      setEditorOpen(false);
      await refresh();
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (entry: AddressBookEntry) => {
    Alert.alert(`Remove ${entry.label}?`, 'This only removes it from your address book.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeAddress(entry.id);
          await refresh();
        },
      },
    ]);
  };

  const handleCopy = async (entry: AddressBookEntry) => {
    await Clipboard.setStringAsync(entry.address);
    Alert.alert('Copied', entry.label);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <ScreenHeader title="Address book" onClose={onBack} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {entries === null ? (
          <ActivityIndicator color={colors.textMuted} style={{ marginTop: spacing.xxl }} />
        ) : entries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="bookmark" size={28} color={colors.textMuted} strokeWidth={1.8} />
            <Text style={styles.emptyTitle}>No saved addresses yet</Text>
            <Text style={styles.emptyBody}>
              Save addresses you send to often so you don't have to paste them every time.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            {entries.map((entry, i) => (
              <TouchableOpacity
                key={entry.id}
                activeOpacity={0.7}
                onPress={() => handleCopy(entry)}
                onLongPress={() => openEdit(entry)}
                style={[styles.row, i === entries.length - 1 && styles.rowLast]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{entry.label}</Text>
                  <Text style={styles.rowAddress}>
                    {entry.address.slice(0, 8)}…{entry.address.slice(-6)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(entry)}
                  hitSlop={12}
                  style={styles.removeBtn}
                >
                  <Icon name="close" size={18} color={colors.textMuted} strokeWidth={2} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <PrimaryButton
            label="Add address"
            onPress={openNew}
            icon={<Icon name="plus" size={18} color={colors.onSolid} />}
            fullWidth
          />
        </View>
        {entries && entries.length > 0 ? (
          <Text style={styles.hint}>Tap to copy. Long-press to rename.</Text>
        ) : null}
      </ScrollView>

      <Modal
        visible={editorOpen}
        animationType="slide"
        transparent={false}
        presentationStyle="pageSheet"
        onRequestClose={() => setEditorOpen(false)}
      >
        <SafeAreaView style={styles.safe}>
          <ScreenHeader
            title={editing ? 'Rename' : 'New address'}
            onClose={() => setEditorOpen(false)}
          />
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView contentContainerStyle={styles.editorBody}>
              <Text style={styles.fieldLabel}>Label</Text>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="e.g. Mom, paj.cash, savings"
                placeholderTextColor={colors.textSubtle}
                style={styles.input}
                autoCapitalize="words"
              />

              {!editing ? (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Solana address</Text>
                  <TextInput
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Paste a wallet address"
                    placeholderTextColor={colors.textSubtle}
                    style={[styles.input, styles.inputMono]}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </>
              ) : (
                <View style={{ marginTop: spacing.lg }}>
                  <Text style={styles.fieldLabel}>Address</Text>
                  <Text style={styles.readOnlyAddress}>{editing.address}</Text>
                  <Text style={styles.helper}>Addresses can't be edited. Remove and re-add to change.</Text>
                </View>
              )}

              <View style={{ marginTop: spacing.xxl }}>
                <PrimaryButton
                  label={saving ? 'Saving…' : editing ? 'Save' : 'Add to book'}
                  onPress={handleSave}
                  disabled={saving || !label.trim() || (!editing && !address.trim())}
                  fullWidth
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl * 3,
    paddingTop: spacing.lg,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.heading,
    marginTop: spacing.sm,
  },
  emptyBody: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    ...typography.body,
    color: colors.text,
  },
  rowAddress: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  removeBtn: {
    padding: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textSubtle,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  editorBody: {
    padding: spacing.xl,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 16,
  },
  inputMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
  },
  readOnlyAddress: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: colors.textMuted,
  },
  helper: {
    ...typography.caption,
    color: colors.textSubtle,
    marginTop: spacing.xs,
  },
});
