// Session key management for LazorKit v2
// Session keys are ephemeral ed25519 keypairs authorized by the wallet for a
// fixed slot window. While active, sends can be signed locally without a
// FaceID prompt, eliminating the repeat auth tax on common actions.

import * as SecureStore from 'expo-secure-store';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { SOLANA_RPC_URL } from '../constants';

const SESSION_SK_KEY = 'lazor_session_sk';
const SESSION_PDA_KEY = 'lazor_session_pda';
const SESSION_EXPIRES_KEY = 'lazor_session_expires';

// ~400ms per slot; 4500 slots ≈ 30 minutes
export const SESSION_SLOT_DURATION = 4500n;
const SLOT_TIME_MS = 400;

function scopeKey(key: string, walletId?: string): string {
    if (!walletId) return key;
    return `${key}_${walletId.slice(0, 16)}`;
}

const connection = new Connection(SOLANA_RPC_URL, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
});

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
    const currentSlot = await connection.getSlot('confirmed');
    return BigInt(currentSlot) + SESSION_SLOT_DURATION;
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
    const secretKeyBase64 = await SecureStore.getItemAsync(scopeKey(SESSION_SK_KEY, walletId));
    const sessionPdaStr = await SecureStore.getItemAsync(scopeKey(SESSION_PDA_KEY, walletId));
    const expiresStr = await SecureStore.getItemAsync(scopeKey(SESSION_EXPIRES_KEY, walletId));

    if (!secretKeyBase64 || !sessionPdaStr || !expiresStr) return null;

    let expiresAtSlot: bigint;
    try {
        expiresAtSlot = BigInt(expiresStr);
    } catch {
        await clearSession(walletId);
        return null;
    }

    const currentSlot = BigInt(await connection.getSlot('confirmed'));
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
    await SecureStore.deleteItemAsync(scopeKey(SESSION_SK_KEY, walletId));
    await SecureStore.deleteItemAsync(scopeKey(SESSION_PDA_KEY, walletId));
    await SecureStore.deleteItemAsync(scopeKey(SESSION_EXPIRES_KEY, walletId));
}
