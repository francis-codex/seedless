// Transaction history — wraps getSignaturesForAddress + parsed tx fetches
// into a small set of "what does the user actually see" record types.
//
// Categories: send / receive / swap / other. Token + amount best-effort, with
// graceful degradation when an inner instruction can't be classified.

import { Connection, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC_URL, USDC_MINT, SEED_MINT } from '../constants';
import * as SecureStore from 'expo-secure-store';

const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
});

export type TxKind = 'send' | 'receive' | 'swap' | 'other';

export interface TxRecord {
  signature: string;
  slot: number;
  blockTimeMs: number | null;
  kind: TxKind;
  // SOL amount (positive = inflow, negative = outflow). Includes fee on the
  // owner side. Falls back to 0 when no SOL delta is detected.
  solDelta: number;
  // First detected SPL token delta on the owner's accounts. Best-effort.
  splDelta?: {
    mint: string;
    symbol?: string;
    uiAmount: number;
  };
  counterparty?: string;
  status: 'success' | 'failed';
}

const KNOWN_MINTS: Record<string, string> = {
  [USDC_MINT]: 'USDC',
  [SEED_MINT]: 'SEED',
};

const HISTORY_CACHE_KEY = 'tx_history_cache_v1';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

interface HistoryCache {
  owner: string;
  fetchedAt: number;
  records: TxRecord[];
}

export async function getCachedHistory(owner: string): Promise<TxRecord[] | null> {
  const raw = await SecureStore.getItemAsync(HISTORY_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed: HistoryCache = JSON.parse(raw);
    if (parsed.owner !== owner) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_MAX_AGE_MS) return null;
    return parsed.records;
  } catch {
    return null;
  }
}

async function cacheHistory(owner: string, records: TxRecord[]): Promise<void> {
  const payload: HistoryCache = { owner, fetchedAt: Date.now(), records };
  await SecureStore.setItemAsync(HISTORY_CACHE_KEY, JSON.stringify(payload));
}

interface FetchOptions {
  limit?: number;
}

export async function fetchTxHistory(
  owner: PublicKey,
  opts: FetchOptions = {},
): Promise<TxRecord[]> {
  const limit = opts.limit ?? 25;
  const sigs = await connection.getSignaturesForAddress(owner, { limit }, 'confirmed');
  if (sigs.length === 0) return [];

  // Pull parsed transactions in one batch.
  const parsed = await connection.getParsedTransactions(
    sigs.map((s) => s.signature),
    { commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
  );

  const ownerStr = owner.toBase58();
  const records: TxRecord[] = [];

  for (let i = 0; i < sigs.length; i++) {
    const sigInfo = sigs[i];
    const tx = parsed[i];
    const status: 'success' | 'failed' =
      sigInfo.err || tx?.meta?.err ? 'failed' : 'success';

    let kind: TxKind = 'other';
    let solDelta = 0;
    let splDelta: TxRecord['splDelta'];
    let counterparty: string | undefined;

    if (tx?.meta && tx.transaction) {
      const accountKeys = tx.transaction.message.accountKeys.map((k) =>
        typeof k === 'string' ? k : k.pubkey.toBase58(),
      );
      const ownerIdx = accountKeys.indexOf(ownerStr);
      if (ownerIdx >= 0) {
        const pre = tx.meta.preBalances?.[ownerIdx] ?? 0;
        const post = tx.meta.postBalances?.[ownerIdx] ?? 0;
        solDelta = (post - pre) / 1e9;
      }

      // Token balance deltas on owner's token accounts.
      const preTb = tx.meta.preTokenBalances ?? [];
      const postTb = tx.meta.postTokenBalances ?? [];
      const tokenDeltas = new Map<string, number>();
      for (const tb of postTb) {
        if (tb.owner !== ownerStr) continue;
        const ui = tb.uiTokenAmount.uiAmount ?? 0;
        tokenDeltas.set(tb.mint, (tokenDeltas.get(tb.mint) ?? 0) + ui);
      }
      for (const tb of preTb) {
        if (tb.owner !== ownerStr) continue;
        const ui = tb.uiTokenAmount.uiAmount ?? 0;
        tokenDeltas.set(tb.mint, (tokenDeltas.get(tb.mint) ?? 0) - ui);
      }
      for (const [mint, delta] of tokenDeltas) {
        if (Math.abs(delta) < 1e-9) continue;
        splDelta = { mint, symbol: KNOWN_MINTS[mint], uiAmount: delta };
        break;
      }

      // Detect swap heuristically: opposing-sign deltas across SOL and a
      // token, OR two opposing token deltas.
      const positiveDeltas = [...tokenDeltas.values()].filter((d) => d > 1e-9).length;
      const negativeDeltas = [...tokenDeltas.values()].filter((d) => d < -1e-9).length;
      const isSwap =
        (positiveDeltas >= 1 && negativeDeltas >= 1) ||
        (splDelta && Math.sign(solDelta) !== 0 && Math.sign(splDelta.uiAmount) === -Math.sign(solDelta));

      if (isSwap) {
        kind = 'swap';
      } else if (splDelta) {
        kind = splDelta.uiAmount > 0 ? 'receive' : 'send';
      } else if (solDelta > 0) {
        kind = 'receive';
      } else if (solDelta < 0) {
        kind = 'send';
      }

      // Best-effort counterparty: first account that isn't the owner or a
      // common program ID.
      for (const key of accountKeys) {
        if (key === ownerStr) continue;
        if (key.length === 44 && !isCommonProgram(key)) {
          counterparty = key;
          break;
        }
      }
    }

    records.push({
      signature: sigInfo.signature,
      slot: sigInfo.slot,
      blockTimeMs: sigInfo.blockTime ? sigInfo.blockTime * 1000 : null,
      kind,
      solDelta,
      splDelta,
      counterparty,
      status,
    });
  }

  await cacheHistory(ownerStr, records);
  return records;
}

const COMMON_PROGRAMS = new Set([
  '11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'ComputeBudget111111111111111111111111111111',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
]);

function isCommonProgram(key: string): boolean {
  return COMMON_PROGRAMS.has(key);
}
