// Token detection — scans the user's SPL token accounts and joins them
// against Jupiter's verified token list to surface what the wallet actually
// holds, without dumping airdropped scam tokens in their face.
//
// Curation layer is non-negotiable per the batch plan. The "for people who
// don't live in crypto" positioning would break the moment a fake $USDC
// airdrop showed up next to the real one.

import { Connection, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SOLANA_RPC_URL } from '../constants';

const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
});

export interface DetectedToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  uiAmount: number;
  rawAmount: bigint;
  verified: boolean;
}

interface VerifiedTokenMeta {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// In-memory cache only. The Jupiter verified list runs into the hundreds of KB
// and was previously flooding SecureStore with oversize-payload warnings (and
// will throw in a future SDK). Refetch on cold start is one HTTP call; not
// worth persisting.
let inMemoryCache: CacheShape | null = null;

// Dust threshold — accounts holding less than this in UI units are dropped
// from the surfaced list to keep airdrop spam from cluttering the wallet
// view. Per-decimal sensible default.
const DUST_UI_THRESHOLD = 0.000001;

interface CacheShape {
  fetchedAt: number;
  tokens: Record<string, VerifiedTokenMeta>;
}

async function getVerifiedMap(): Promise<Record<string, VerifiedTokenMeta>> {
  if (inMemoryCache && Date.now() - inMemoryCache.fetchedAt < CACHE_TTL_MS) {
    return inMemoryCache.tokens;
  }

  try {
    const res = await fetch('https://lite-api.jup.ag/tokens/v1/tagged/verified', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Jupiter verified list returned ${res.status}`);
    const list: VerifiedTokenMeta[] = await res.json();
    const map: Record<string, VerifiedTokenMeta> = {};
    for (const t of list) {
      if (t && t.address) map[t.address] = t;
    }
    inMemoryCache = { fetchedAt: Date.now(), tokens: map };
    return map;
  } catch {
    return inMemoryCache?.tokens ?? {};
  }
}

export async function detectWalletTokens(owner: PublicKey): Promise<DetectedToken[]> {
  const [accounts, verifiedMap] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, 'confirmed'),
    getVerifiedMap(),
  ]);

  const detected: DetectedToken[] = [];

  for (const acc of accounts.value) {
    const data = acc.account.data as ParsedAccountData;
    const info = data.parsed?.info;
    if (!info) continue;
    const mint: string = info.mint;
    const tokenAmount = info.tokenAmount;
    if (!tokenAmount) continue;
    const uiAmount: number = Number(tokenAmount.uiAmount ?? 0);
    if (uiAmount < DUST_UI_THRESHOLD) continue;

    const meta = verifiedMap[mint];
    if (!meta) {
      // Unverified — skip. Curation layer per "don't live in crypto" rule.
      continue;
    }

    detected.push({
      mint,
      symbol: meta.symbol,
      name: meta.name,
      decimals: meta.decimals,
      logoURI: meta.logoURI,
      uiAmount,
      rawAmount: BigInt(tokenAmount.amount ?? '0'),
      verified: true,
    });
  }

  // Sort by USD value proxy: native first never applies here (SOL isn't an SPL
  // token account). Sort by UI amount descending so the biggest balance is on
  // top. Fine for now; can layer USD pricing later.
  detected.sort((a, b) => b.uiAmount - a.uiAmount);
  return detected;
}

// Lookup helper for the swap screen — verified meta by mint, no scan required.
export async function getVerifiedMetaByMint(mint: string): Promise<VerifiedTokenMeta | null> {
  const map = await getVerifiedMap();
  return map[mint] ?? null;
}
