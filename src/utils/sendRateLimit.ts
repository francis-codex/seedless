// Per-wallet rate limit for Kora-sponsored sends.
//
// Kay (LazorKit, May 21 2026) confirmed Kora can't validate at the individual
// wallet level — spending controls have to live on our side, "at the app
// level by blocking requests or setting specific rate limits." A leaked
// EXPO_PUBLIC paymaster key can't drain funds (Kora recoups the fee on every
// tx), but it can generate abusive sponsored-tx volume that gets our key
// rate-limited or flagged. This caps how fast a single smart wallet can fire
// sponsored sends so one wallet (or a leaked-key script reusing one wallet)
// can't spam the relayer.
//
// Sliding 60s window, persisted to SecureStore so it survives reloads.

import * as SecureStore from 'expo-secure-store';

const WINDOW_MS = 60_000;
const MAX_SENDS_PER_WINDOW = 5;
const KEY_PREFIX = 'kora_send_window_v1:';

// SecureStore keys can't contain certain characters; a base58 pubkey is safe,
// but keep the read/write defensive so a malformed key never throws into the
// send path.
function storageKey(walletPubkey: string): string {
  return `${KEY_PREFIX}${walletPubkey}`;
}

async function readWindow(walletPubkey: string): Promise<number[]> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(walletPubkey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

async function writeWindow(walletPubkey: string, timestamps: number[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(storageKey(walletPubkey), JSON.stringify(timestamps));
  } catch {
    // Persistence is best-effort; an unwritable window just means the next
    // check starts fresh, which fails open (lenient), never blocks a genuine
    // send.
  }
}

export interface RateLimitResult {
  allowed: boolean;
  // Milliseconds until the next send slot frees up. Only set when blocked.
  retryAfterMs?: number;
}

// Reserve a sponsored-send slot for this wallet. Call this right before firing
// the send — submitting the tx is what costs Kora, so we reserve on attempt
// rather than on confirmation. Returns allowed=false (with retryAfterMs) when
// the wallet has already used its allotment in the current window.
export async function consumeSendSlot(walletPubkey: string): Promise<RateLimitResult> {
  const now = Date.now();
  const recent = (await readWindow(walletPubkey)).filter((ts) => now - ts < WINDOW_MS);

  if (recent.length >= MAX_SENDS_PER_WINDOW) {
    const oldest = Math.min(...recent);
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }

  recent.push(now);
  await writeWindow(walletPubkey, recent);
  return { allowed: true };
}
