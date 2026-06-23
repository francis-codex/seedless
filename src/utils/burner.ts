// Burner wallet management
// These are isolated ed25519 keypairs with no on-chain link to the main wallet
// They need SOL for gas since they're not passkey-controlled PDAs

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { SOLANA_RPC_URL, IS_DEVNET, MAX_BURNER_WALLETS, BURNER_LIMITS as LIMITS } from '../constants';
import { SUPPORTED_TOKENS, type Token, type TokenSymbol } from '../tokens/registry';

export const BURNER_LIMITS = LIMITS;

import { connection, fallbackConnection } from './connection';

const BURNER_LIST_KEY = 'lazor_burner_list';
const BURNER_KEY_PREFIX = 'lazor_burner_';

// Scope storage keys to connected wallet so each passkey gets its own burners
function scopeKey(key: string, walletId?: string): string {
    if (!walletId) return key;
    return `${key}_${walletId.slice(0, 16)}`;
}

export interface BurnerWallet {
    id: string;
    label: string;
    publicKey: string;
    createdAt: number;
}

export interface BurnerWalletWithBalance extends BurnerWallet {
    balance: number;
    tokenBalances?: Record<TokenSymbol, number>;
}

export async function listBurners(walletId?: string): Promise<BurnerWallet[]> {
    const listJson = await SecureStore.getItemAsync(scopeKey(BURNER_LIST_KEY, walletId));
    if (!listJson) return [];

    try {
        return JSON.parse(listJson);
    } catch {
        return [];
    }
}

async function saveBurnerList(burners: BurnerWallet[], walletId?: string): Promise<void> {
    await SecureStore.setItemAsync(scopeKey(BURNER_LIST_KEY, walletId), JSON.stringify(burners));
}

async function generateBurnerId(): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(8);
    return Buffer.from(randomBytes).toString('hex');
}

export async function createBurner(label: string, walletId?: string): Promise<BurnerWallet> {
    const existing = await listBurners(walletId);
    if (existing.length >= MAX_BURNER_WALLETS) {
        throw new Error(`Maximum of ${MAX_BURNER_WALLETS} burner wallets reached`);
    }

    const keypair = Keypair.generate();
    const id = await generateBurnerId();

    // Store secret key encrypted
    const secretKeyBase64 = Buffer.from(keypair.secretKey).toString('base64');
    await SecureStore.setItemAsync(`${BURNER_KEY_PREFIX}${id}`, secretKeyBase64, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });

    const burner: BurnerWallet = {
        id,
        label,
        publicKey: keypair.publicKey.toBase58(),
        createdAt: Date.now(),
    };

    const burners = await listBurners(walletId);
    burners.push(burner);
    await saveBurnerList(burners, walletId);

    return burner;
}

export async function getBurnerKeypair(id: string): Promise<Keypair | null> {
    const secretKeyBase64 = await SecureStore.getItemAsync(`${BURNER_KEY_PREFIX}${id}`);
    if (!secretKeyBase64) return null;

    try {
        const secretKey = Buffer.from(secretKeyBase64, 'base64');
        return Keypair.fromSecretKey(new Uint8Array(secretKey));
    } catch {
        return null;
    }
}

export async function getBurnerBalance(publicKey: string): Promise<number> {
    const pubkey = new PublicKey(publicKey);
    try {
        const balance = await connection.getBalance(pubkey);
        return balance / LAMPORTS_PER_SOL;
    } catch {
        // Fallback to public RPC
        try {
            const balance = await fallbackConnection.getBalance(pubkey);
            return balance / LAMPORTS_PER_SOL;
        } catch {
            return 0;
        }
    }
}

/**
 * Fetch SPL token balance for a burner address. Returns 0 when the burner has
 * no ATA for the mint yet (so the UI shows the empty state instead of an
 * error).
 */
export async function getBurnerSplBalance(publicKey: string, token: Token): Promise<number> {
    if (token.isNative) return getBurnerBalance(publicKey);
    const owner = new PublicKey(publicKey);
    const mint = new PublicKey(token.mint);
    try {
        const ata = await getAssociatedTokenAddress(mint, owner, true);
        const account = await getAccount(connection, ata);
        return Number(account.amount) / Math.pow(10, token.decimals);
    } catch {
        return 0;
    }
}

/** Per-token balances for a single burner — used by the burner send modal. */
export async function getBurnerTokenBalances(
    publicKey: string,
    tokens: readonly Token[],
): Promise<Record<TokenSymbol, number>> {
    const entries = await Promise.all(
        tokens.map(async (t) => [t.symbol, await getBurnerSplBalance(publicKey, t)] as const),
    );
    return Object.fromEntries(entries) as Record<TokenSymbol, number>;
}

// SecureStore key for cached per-burner token balances. Persisted so the
// burners screen opens instantly with last-known values, then refreshes in
// the background. The shape is { [publicKey]: { SOL, USDC, SEED } }.
const BURNER_BALANCE_CACHE_KEY = 'burner_balance_cache_v1';

async function readCachedBalances(): Promise<Record<string, Record<TokenSymbol, number>>> {
    try {
        const raw = await SecureStore.getItemAsync(BURNER_BALANCE_CACHE_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch { return {}; }
}

async function writeCachedBalances(cache: Record<string, Record<TokenSymbol, number>>): Promise<void> {
    try {
        const serialised = JSON.stringify(cache);
        // SecureStore warns + may throw above ~2KB. Cache is convenience only,
        // skip silently when oversized rather than spamming the dev log.
        if (serialised.length > 1900) return;
        await SecureStore.setItemAsync(BURNER_BALANCE_CACHE_KEY, serialised);
    } catch {
        // Cache write is best-effort; the live fetch is the source of truth.
    }
}

export async function listBurnersWithBalances(walletId?: string): Promise<BurnerWalletWithBalance[]> {
    const burners = await listBurners(walletId);

    // Fetch native SOL + per-token balances per burner in parallel.
    const tokenBalancesByBurner = await Promise.all(
        burners.map(b => getBurnerTokenBalances(b.publicKey, SUPPORTED_TOKENS)),
    );

    // Persist to cache so the next open is instant. Fire-and-forget.
    const cache = burners.reduce<Record<string, Record<TokenSymbol, number>>>(
        (acc, b, i) => { acc[b.publicKey] = tokenBalancesByBurner[i]; return acc; },
        {},
    );
    void writeCachedBalances(cache);

    return burners.map((burner, i) => ({
        ...burner,
        balance: tokenBalancesByBurner[i].SOL ?? 0,
        tokenBalances: tokenBalancesByBurner[i],
    }));
}

// Synchronous-ish read: returns burners with CACHED balances immediately,
// or empty balances if no cache exists. UI shows these while the live
// fetch (listBurnersWithBalances) runs in parallel.
export async function listBurnersWithCachedBalances(walletId?: string): Promise<BurnerWalletWithBalance[]> {
    const [burners, cache] = await Promise.all([
        listBurners(walletId),
        readCachedBalances(),
    ]);
    return burners.map((b) => {
        const cached = cache[b.publicKey];
        const tokenBalances = cached ?? ({ SOL: 0, USDC: 0, SEED: 0 } as Record<TokenSymbol, number>);
        return { ...b, balance: tokenBalances.SOL ?? 0, tokenBalances };
    });
}

export async function sendFromBurner(
    burnerId: string,
    recipient: string,
    amount: number
): Promise<string> {
    if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid amount');
    }

    if (amount > BURNER_LIMITS.MAX_SEND_SOL) {
        throw new Error(`Amount exceeds limit of ${BURNER_LIMITS.MAX_SEND_SOL} SOL`);
    }

    // Validate recipient address
    let recipientPubkey: PublicKey;
    try {
        recipientPubkey = new PublicKey(recipient);
    } catch {
        throw new Error('Invalid recipient address');
    }

    const keypair = await getBurnerKeypair(burnerId);
    if (!keypair) {
        throw new Error('Burner wallet not found');
    }

    const lamports = Math.round(amount * LAMPORTS_PER_SOL);

    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: keypair.publicKey,
    }).add(
        SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: recipientPubkey,
            lamports,
        })
    );

    transaction.sign(keypair);
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    return signature;
}

/**
 * Send any SPL token from a burner. The burner self-pays the network fee in
 * SOL (burners aren't passkey-gated and don't route through Kora), so the
 * burner must hold a small SOL buffer in addition to the SPL balance. If the
 * recipient doesn't have an ATA for the mint, we create it as part of the
 * same transaction — the burner pays the ATA rent too.
 */
export async function sendSplFromBurner(
    burnerId: string,
    token: Token,
    recipient: string,
    amount: number,
): Promise<string> {
    if (token.isNative) {
        // Caller chose SOL — defer to the native path.
        return sendFromBurner(burnerId, recipient, amount);
    }
    if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid amount');
    }

    let recipientPubkey: PublicKey;
    try {
        recipientPubkey = new PublicKey(recipient);
    } catch {
        throw new Error('Invalid recipient address');
    }

    const keypair = await getBurnerKeypair(burnerId);
    if (!keypair) {
        throw new Error('Burner wallet not found');
    }

    const mint = new PublicKey(token.mint);
    const fromAta = await getAssociatedTokenAddress(mint, keypair.publicKey, true);
    const toAta = await getAssociatedTokenAddress(mint, recipientPubkey, true);

    const rawAmount = BigInt(Math.round(amount * Math.pow(10, token.decimals)));
    if (rawAmount <= 0n) {
        throw new Error('Invalid amount');
    }

    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: keypair.publicKey,
    });

    // Create recipient ATA in the same tx if missing — keeps the UX one-shot.
    const recipientAtaInfo = await connection.getAccountInfo(toAta);
    if (!recipientAtaInfo) {
        transaction.add(
            createAssociatedTokenAccountInstruction(keypair.publicKey, toAta, recipientPubkey, mint),
        );
    }

    transaction.add(
        createTransferCheckedInstruction(
            fromAta,
            mint,
            toAta,
            keypair.publicKey,
            rawAmount,
            token.decimals,
        ),
    );

    transaction.sign(keypair);
    const signature = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    return signature;
}

// Destroy burner and optionally sweep remaining funds first
export async function destroyBurner(
    burnerId: string,
    sweepTo?: string,
    walletId?: string
): Promise<string | null> {
    const keypair = await getBurnerKeypair(burnerId);
    let sweepSignature: string | null = null;

    if (keypair && sweepTo) {
        const balance = await connection.getBalance(keypair.publicKey);
        const fee = 5000;
        const sendAmount = balance - fee;

        if (sendAmount > 0) {
            try {
                const { blockhash } = await connection.getLatestBlockhash();
                const transaction = new Transaction({
                    recentBlockhash: blockhash,
                    feePayer: keypair.publicKey,
                }).add(
                    SystemProgram.transfer({
                        fromPubkey: keypair.publicKey,
                        toPubkey: new PublicKey(sweepTo),
                        lamports: sendAmount,
                    })
                );

                transaction.sign(keypair);
                sweepSignature = await connection.sendRawTransaction(transaction.serialize());
                await connection.confirmTransaction(sweepSignature, 'confirmed');
            } catch (error) {
                if (__DEV__) console.error('Failed to sweep:', error);
            }
        }
    }

    // Delete private key and remove from list
    await SecureStore.deleteItemAsync(`${BURNER_KEY_PREFIX}${burnerId}`);

    const burners = await listBurners(walletId);
    const updatedBurners = burners.filter((b) => b.id !== burnerId);
    await saveBurnerList(updatedBurners, walletId);

    return sweepSignature;
}

export async function updateBurnerLabel(burnerId: string, newLabel: string, walletId?: string): Promise<void> {
    const burners = await listBurners(walletId);
    const index = burners.findIndex((b) => b.id === burnerId);

    if (index !== -1) {
        burners[index].label = newLabel;
        await saveBurnerList(burners, walletId);
    }
}

export function shortenAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Burner wallet status for UI
export type BurnerStatus = 'idle' | 'creating' | 'sending' | 'sweeping' | 'destroying';

// Get total count of burner wallets
export async function getBurnerCount(walletId?: string): Promise<number> {
    const burners = await listBurners(walletId);
    return burners.length;
}

// Check if a burner wallet exists
export async function burnerExists(burnerId: string, walletId?: string): Promise<boolean> {
    const burners = await listBurners(walletId);
    return burners.some((b) => b.id === burnerId);
}

// Get total balance across all burners
export async function getTotalBurnerBalance(walletId?: string): Promise<number> {
    const burners = await listBurnersWithBalances(walletId);
    return burners.reduce((sum, b) => sum + b.balance, 0);
}

// Get burners with non-zero balance
export async function getActiveBurners(walletId?: string): Promise<BurnerWallet[]> {
    const burners = await listBurnersWithBalances(walletId);
    return burners.filter((b) => b.balance > 0);
}

// Check if any burner has funds to sweep
export async function hasSweepableFunds(walletId?: string): Promise<boolean> {
    const active = await getActiveBurners(walletId);
    return active.length > 0;
}

// Burner sweep status for UI
export type BurnerSweepStatus = 'idle' | 'sweeping' | 'confirming' | 'success' | 'failed';

// Get the oldest burner wallet (first created)
export async function getOldestBurner(): Promise<BurnerWallet | null> {
  const burners = await listBurners();
  if (burners.length === 0) return null;
  return burners.reduce((oldest, b) => b.createdAt < oldest.createdAt ? b : oldest);
}

// Get burner by public key
export async function getBurnerByAddress(publicKey: string, walletId?: string): Promise<BurnerWallet | null> {
  const burners = await listBurners(walletId);
  return burners.find(b => b.publicKey === publicKey) || null;
}
