import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, Icon, IconName } from '../components/ui';
import { fetchTxHistory, TxKind, TxRecord } from '../utils/txHistory';
import { getTxExplorerUrl } from '../constants';

interface HistoryScreenProps {
  onBack: () => void;
}

export function HistoryScreen({ onBack }: HistoryScreenProps) {
  const { smartWalletPubkey } = useWallet();
  // Empty array (not null) as the initial. The spinner is driven by the
  // `loading` flag alone — never by records being absent — so we can never
  // get into an "endless spinner" state if a fetch silently no-ops.
  const [records, setRecords] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownerStr = smartWalletPubkey?.toBase58() ?? null;

  const load = useCallback(async () => {
    if (!ownerStr) {
      setLoading(false);
      return;
    }
    try {
      const fresh = await fetchTxHistory(new PublicKey(ownerStr), { limit: 15 });
      setRecords(fresh);
      setError(null);
    } catch (err: any) {
      setError(normalizeHistoryError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ownerStr]);

  useEffect(() => {
    load();
  }, [load]);

  const onPullRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openExplorer = useCallback(async (sig: string) => {
    const url = getTxExplorerUrl(sig);
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open explorer', url);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <ScreenHeader title="History" onClose={onBack} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        {loading && records.length === 0 ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={colors.textMuted} />
            <Text style={styles.loadingText}>Loading recent activity…</Text>
          </View>
        ) : records.length === 0 ? (
          <View style={styles.emptyCard}>
            <Icon name="history" size={28} color={colors.textMuted} strokeWidth={1.8} />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyBody}>
              Sends, receives, and swaps from this wallet will show up here.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            {records.map((r, i) => (
              <HistoryRow
                key={r.signature}
                record={r}
                isLast={i === records.length - 1}
                onOpen={openExplorer}
              />
            ))}
          </View>
        )}

        {error && records.length === 0 ? (
          <Text style={styles.errorLine}>{error}</Text>
        ) : null}
        <Text style={styles.hint}>Pull to refresh · tap a row to open it on the explorer</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Map known RPC failure shapes (rate-limit JSON, network timeouts, fetch
// failures) into short, user-readable strings. Raw JSON-RPC payloads must
// never reach the screen — they leak provider identity and look broken.
function normalizeHistoryError(err: any): string {
  const raw = typeof err?.message === 'string' ? err.message : String(err ?? '');
  if (/\b429\b/.test(raw) || /rate ?limit/i.test(raw) || /compute units/i.test(raw)) {
    return 'Too many requests — try again in a moment';
  }
  if (/timed out|timeout|aborted/i.test(raw)) return 'Network slow — pull to refresh';
  if (/network|fetch failed|TypeError/i.test(raw)) return 'No connection — check internet';
  return 'Could not load history — pull to refresh';
}

function kindLabel(r: TxRecord): string {
  if (r.kind === 'send') return 'Sent';
  if (r.kind === 'receive') return 'Received';
  if (r.kind === 'swap') return 'Swap';
  return 'Transaction';
}

// Memoized row. Extracted from inline records.map so a list refresh only
// re-renders the rows whose underlying record changed (in practice: the
// new head + any updated status). The onOpen callback is wrapped in
// useCallback by the parent so the row's memo doesn't churn on parent
// re-renders.
interface HistoryRowProps {
  record: TxRecord;
  isLast: boolean;
  onOpen: (sig: string) => void;
}
const HistoryRow = memo(function HistoryRow({ record: r, isLast, onOpen }: HistoryRowProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onOpen(r.signature)}
      style={[styles.row, isLast && styles.rowLast]}
    >
      <View style={[styles.kindBubble, kindStyles[r.kind].bubble]}>
        <Icon
          name={kindStyles[r.kind].icon}
          size={16}
          color={kindStyles[r.kind].color}
          strokeWidth={2}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{kindLabel(r)}</Text>
        <Text style={styles.rowSub}>
          {r.blockTimeMs ? formatRelative(r.blockTimeMs) : 'pending'}
          {r.counterparty
            ? ` · ${r.counterparty.slice(0, 4)}…${r.counterparty.slice(-4)}`
            : ''}
          {r.status === 'failed' ? ' · failed' : ''}
        </Text>
      </View>
      <Text style={[styles.amount, amountTone(r)]}>{formatAmount(r)}</Text>
    </TouchableOpacity>
  );
});

function formatAmount(r: TxRecord): string {
  if (r.kind === 'swap') {
    if (r.splDelta) {
      const sym = r.splDelta.symbol ?? 'SPL';
      return `${r.splDelta.uiAmount > 0 ? '+' : ''}${trim(r.splDelta.uiAmount)} ${sym}`;
    }
    return `${r.solDelta > 0 ? '+' : ''}${trim(r.solDelta)} SOL`;
  }
  if (r.splDelta) {
    const sym = r.splDelta.symbol ?? 'SPL';
    return `${r.splDelta.uiAmount > 0 ? '+' : ''}${trim(r.splDelta.uiAmount)} ${sym}`;
  }
  return `${r.solDelta > 0 ? '+' : ''}${trim(r.solDelta)} SOL`;
}

function amountTone(r: TxRecord) {
  if (r.status === 'failed') return { color: colors.textSubtle };
  const positive =
    (r.splDelta && r.splDelta.uiAmount > 0) || (!r.splDelta && r.solDelta > 0);
  return { color: positive ? colors.successText : colors.text };
}

function trim(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return '0';
  if (abs < 0.0001) return abs.toExponential(2);
  return abs.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  const m = Math.floor(delta / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

const kindStyles: Record<TxKind, { icon: IconName; color: string; bubble: any }> = {
  send: {
    icon: 'arrowUp',
    color: colors.text,
    bubble: { backgroundColor: colors.surfaceMuted },
  },
  receive: {
    icon: 'arrowDown',
    color: colors.successText,
    bubble: { backgroundColor: colors.successBg },
  },
  swap: {
    icon: 'swap',
    color: colors.accent,
    bubble: { backgroundColor: colors.surfaceMuted },
  },
  other: {
    icon: 'history',
    color: colors.textMuted,
    bubble: { backgroundColor: colors.surfaceMuted },
  },
};

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
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  kindBubble: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    ...typography.body,
    color: colors.text,
  },
  rowSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  amount: {
    ...typography.body,
  },
  errorLine: {
    ...typography.caption,
    color: colors.dangerText,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  hint: {
    ...typography.caption,
    color: colors.textSubtle,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  loadingBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
