// Session key management for LazorKit v2
// Session keys are ephemeral ed25519 keypairs authorized by the wallet for a
// fixed slot window. While active, sends can be signed locally without a
// FaceID prompt, eliminating the repeat auth tax on common actions.

import * as SecureStore from 'expo-secure-store';
import { Keypair, PublicKey } from '@solana/web3.js';
// Reuse the shared singleton instead of spinning a second Connection. Cuts
// duplicate socket pools + lets RPC-level caching land for repeated reads.
import { connection } from './connection';

const SESSION_SK_KEY = 'lazor_session_sk';
const SESSION_PDA_KEY = 'lazor_session_pda';
const SESSION_EXPIRES_KEY = 'lazor_session_expires';

// ~400ms per slot; 4500 slots ≈ 30 minutes
export const SESSION_SLOT_DURATION = 4500n;
const SLOT_TIME_MS = 400;
// Slot safety buffer for the local-clock estimate. If the session expiry is
// further than this from our extrapolated "now", skip the RPC roundtrip
// entirely and trust the math. 120 slots = ~48s — well beyond any realistic
// network/UI lag between the slot probe and the actual send.
const SLOT_SAFETY_BUFFER = 120n;
// How long a getSlot reading stays "fresh enough" to extrapolate from
// instead of re-probing. Beyond this we re-probe so drift doesn't compound.
const SLOT_CACHE_FRESH_MS = 30_000;

function scopeKey(key: string, walletId?: string): string {
    if (!walletId) return key;
    return `${key}_${walletId.slice(0, 16)}`;
}

// Module-level cache of the most recent confirmed-slot reading. Lets
// getActiveSession() answer "is the session still valid?" without hitting
// the RPC on every send when the session is comfortably in-window.
let lastKnownSlot: { slot: bigint; at: number } | null = null;

async function estimateCurrentSlot(): Promise<bigint> {
    if (lastKnownSlot) {
        const ageMs = Date.now() - lastKnownSlot.at;
        if (ageMs < SLOT_CACHE_FRESH_MS) {
            const elapsedSlots = BigInt(Math.floor(ageMs / SLOT_TIME_MS));
            return lastKnownSlot.slot + elapsedSlots;
        }
    }
    const slot = BigInt(await connection.getSlot('confirmed'));
    lastKnownSlot = { slot, at: Date.now() };
    return slot;
}

export interface ActiveSession {
    sessionKeypair: Keypair;
    sessionPda: PublicKey;
    expiresAtSlot: bigint;
    remainingMs: number;
}

export function generateSessionKeypair(): Keypair {
    return Keypair.generate();
}

export async function computeExpiresAtSlot(): Promise<bigint> {
    // Real probe — session creation is rare and we want the fresh slot
    // anchoring the expiry. Side effect: refreshes the module cache.
    const slot = BigInt(await connection.getSlot('confirmed'));
    lastKnownSlot = { slot, at: Date.now() };
    return slot + SESSION_SLOT_DURATION;
}

export async function storeSession(
    walletId: string | undefined,
    sessionKeypair: Keypair,
    sessionPda: PublicKey,
    expiresAtSlot: bigint,
): Promise<void> {
    const secretKeyBase64 = Buffer.from(sessionKeypair.secretKey).toString('base64');
    await SecureStore.setItemAsync(scopeKey(SESSION_SK_KEY, walletId), secretKeyBase64, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    await SecureStore.setItemAsync(scopeKey(SESSION_PDA_KEY, walletId), sessionPda.toBase58());
    await SecureStore.setItemAsync(scopeKey(SESSION_EXPIRES_KEY, walletId), expiresAtSlot.toString());
}

export async function getActiveSession(walletId?: string): Promise<ActiveSession | null> {
    // Parallelize the three SecureStore reads — they're independent and the
    // sequential pattern was ~3x the latency it needed to be on cold cache.
    const [secretKeyBase64, sessionPdaStr, expiresStr] = await Promise.all([
        SecureStore.getItemAsync(scopeKey(SESSION_SK_KEY, walletId)),
        SecureStore.getItemAsync(scopeKey(SESSION_PDA_KEY, walletId)),
        SecureStore.getItemAsync(scopeKey(SESSION_EXPIRES_KEY, walletId)),
    ]);

    if (!secretKeyBase64 || !sessionPdaStr || !expiresStr) return null;

    let expiresAtSlot: bigint;
    try {
        expiresAtSlot = BigInt(expiresStr);
    } catch {
        await clearSession(walletId);
        return null;
    }

    // Fast path: local-clock estimate of current slot. If we're well clear
    // of expiry, skip the RPC roundtrip (which was ~200-500ms on every send
    // pre-Jun 23). Only fall back to a real getSlot when the session is
    // within the safety buffer of expiring.
    let currentSlot = await estimateCurrentSlot();
    if (currentSlot + SLOT_SAFETY_BUFFER >= expiresAtSlot) {
        // Too close to call without a fresh probe — confirm against the chain.
        currentSlot = BigInt(await connection.getSlot('confirmed'));
        lastKnownSlot = { slot: currentSlot, at: Date.now() };
    }

    if (currentSlot >= expiresAtSlot) {
        await clearSession(walletId);
        return null;
    }

    const secretKey = Uint8Array.from(Buffer.from(secretKeyBase64, 'base64'));
    const sessionKeypair = Keypair.fromSecretKey(secretKey);
    const sessionPda = new PublicKey(sessionPdaStr);
    const remainingMs = Number(expiresAtSlot - currentSlot) * SLOT_TIME_MS;

    return { sessionKeypair, sessionPda, expiresAtSlot, remainingMs };
}

export async function clearSession(walletId?: string): Promise<void> {
    // Parallel deletes mirror the parallel reads in getActiveSession.
    await Promise.all([
        SecureStore.deleteItemAsync(scopeKey(SESSION_SK_KEY, walletId)),
        SecureStore.deleteItemAsync(scopeKey(SESSION_PDA_KEY, walletId)),
        SecureStore.deleteItemAsync(scopeKey(SESSION_EXPIRES_KEY, walletId)),
    ]);
}
