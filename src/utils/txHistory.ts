// Transaction history — wraps getSignaturesForAddress + parsed tx fetches
// into a small set of "what does the user actually see" record types.
//
// Categories: send / receive / swap / other. Token + amount best-effort, with
// graceful degradation when an inner instruction can't be classified.

import { Connection, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC_URL, USDC_MINT, SEED_MINT, IS_DEVNET, HELIUS_HTTP_URL } from '../constants';
import * as SecureStore from 'expo-secure-store';

// Primary history RPC. Prefer Helius on mainnet — its smart-wallet PDA
// signature index updates faster + more reliably than Alchemy's, which was
// the source of the "history empty right after I just swapped" bug on
// Jun 22. Fall back to Alchemy when Helius isn't configured (e.g. devnet).
const primaryHistoryRpc = HELIUS_HTTP_URL ?? SOLANA_RPC_URL;
const connection = new Connection(primaryHistoryRpc, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
});

// Secondary RPC. When Helius is the primary, Alchemy becomes the backup
// (still full-coverage). When Alchemy is the primary, public mainnet is
// the backup, with the caveat that public mainnet often refuses
// getSignaturesForAddress for free-tier traffic — it's a soft fallback.
const fallbackHistoryConnection = new Connection(
  IS_DEVNET
    ? 'https://api.devnet.solana.com'
    : HELIUS_HTTP_URL
      ? SOLANA_RPC_URL
      : 'https://api.mainnet-beta.solana.com',
  { commitment: 'confirmed', disableRetryOnRateLimit: true },
);

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

const HISTORY_CACHE_KEY_PREFIX = 'tx_history_cache_v2:';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;
const SECURESTORE_SAFE_MAX_BYTES = 1900;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); },
    );
  });
}

interface HistoryCache {
  owner: string;
  fetchedAt: number;
  records: TxRecord[];
}

export async function getCachedHistory(owner: string): Promise<TxRecord[] | null> {
  const raw = await SecureStore.getItemAsync(`${HISTORY_CACHE_KEY_PREFIX}${owner}`);
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
  // Trim down to the minimum a list row actually renders so the JSON stays
  // under SecureStore's 2KB soft limit. Drop bulky optional fields.
  const trimmed = records.slice(0, 15).map((r) => ({
    signature: r.signature,
    slot: r.slot,
    blockTimeMs: r.blockTimeMs,
    kind: r.kind,
    solDelta: Number(r.solDelta.toFixed(6)),
    splDelta: r.splDelta
      ? { mint: r.splDelta.mint, symbol: r.splDelta.symbol, uiAmount: Number(r.splDelta.uiAmount.toFixed(6)) }
      : undefined,
    counterparty: r.counterparty,
    status: r.status,
  }));
  const payload: HistoryCache = { owner, fetchedAt: Date.now(), records: trimmed as TxRecord[] };
  const serialised = JSON.stringify(payload);
  if (serialised.length > SECURESTORE_SAFE_MAX_BYTES) {
    // Too large — skip persistence rather than trigger the SDK warning. In-memory
    // state still has the full list for this session.
    return;
  }
  try {
    await SecureStore.setItemAsync(`${HISTORY_CACHE_KEY_PREFIX}${owner}`, serialised);
  } catch {
    // Cache write is best-effort.
  }
}

interface FetchOptions {
  limit?: number;
}

// Cheap "is anything new?" probe for the foreground poll. Only fetches
// signatures (no parsed-tx), so it costs a small fraction of fetchTxHistory.
// Returns the newest signature or null. Use this BEFORE calling
// fetchTxHistory in any polling loop — most ticks will short-circuit here
// because nothing has changed since lastSeen.
export async function fetchLatestSignature(owner: PublicKey): Promise<string | null> {
  const sigs = await withTimeout(
    connection.getSignaturesForAddress(owner, { limit: 1 }, 'confirmed'),
    FETCH_TIMEOUT_MS,
    'history.getLatestSig',
  );
  return sigs[0]?.signature ?? null;
}

export async function fetchTxHistory(
  owner: PublicKey,
  opts: FetchOptions = {},
): Promise<TxRecord[]> {
  const limit = opts.limit ?? 15;
  // Try primary (Alchemy) first.
  let sigs = await withTimeout(
    connection.getSignaturesForAddress(owner, { limit }, 'confirmed'),
    FETCH_TIMEOUT_MS,
    'history.getSignatures',
  );
  // If Alchemy returned nothing, cross-check public mainnet — Alchemy's
  // smart-wallet signature index lags real-time. We want either source to
  // surface recent activity even when one is stale.
  let parsedConn = connection;
  if (sigs.length === 0) {
    try {
      const fallbackSigs = await withTimeout(
        fallbackHistoryConnection.getSignaturesForAddress(owner, { limit }, 'confirmed'),
        FETCH_TIMEOUT_MS,
        'history.getSignatures.fallback',
      );
      if (fallbackSigs.length > 0) {
        sigs = fallbackSigs;
        parsedConn = fallbackHistoryConnection;
      }
    } catch {
      // Fallback failure is fine — we just return the (empty) primary result.
    }
  }
  if (sigs.length === 0) return [];

  // Parse via whichever connection produced the signatures so the parsed
  // call hits the same indexer's snapshot.
  const parsed = await withTimeout(
    parsedConn.getParsedTransactions(
      sigs.map((s) => s.signature),
      { commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ),
    FETCH_TIMEOUT_MS,
    'history.getParsedTransactions',
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
