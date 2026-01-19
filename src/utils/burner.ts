// Burner wallet management
// These are isolated ed25519 keypairs with no on-chain link to the main wallet
// They need SOL for gas since they're not passkey-controlled PDAs

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import { SOLANA_RPC_URL } from '../constants';

const connection = new Connection(SOLANA_RPC_URL, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
});

const BURNER_LIST_KEY = 'lazor_burner_list';
const BURNER_KEY_PREFIX = 'lazor_burner_';

// No limits - production ready
export const BURNER_LIMITS = {
    MAX_FUND_SOL: Infinity,
    MAX_SEND_SOL: Infinity,
} as const;

export interface BurnerWallet {
    id: string;
    label: string;
    publicKey: string;
    createdAt: number;
}

export interface BurnerWalletWithBalance extends BurnerWallet {
    balance: number;
}

export async function listBurners(): Promise<BurnerWallet[]> {
    const listJson = await SecureStore.getItemAsync(BURNER_LIST_KEY);
    if (!listJson) return [];

    try {
        return JSON.parse(listJson);
    } catch {
        return [];
    }
}

async function saveBurnerList(burners: BurnerWallet[]): Promise<void> {
    await SecureStore.setItemAsync(BURNER_LIST_KEY, JSON.stringify(burners));
}

async function generateBurnerId(): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(8);
    return Buffer.from(randomBytes).toString('hex');
}

export async function createBurner(label: string): Promise<BurnerWallet> {
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

    const burners = await listBurners();
    burners.push(burner);
    await saveBurnerList(burners);

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
    try {
        const pubkey = new PublicKey(publicKey);
        const balance = await connection.getBalance(pubkey);
        return balance / LAMPORTS_PER_SOL;
    } catch {
        return 0;
    }
}

export async function listBurnersWithBalances(): Promise<BurnerWalletWithBalance[]> {
    const burners = await listBurners();
    const result: BurnerWalletWithBalance[] = [];

    for (const burner of burners) {
        const balance = await getBurnerBalance(burner.publicKey);
        result.push({ ...burner, balance });
    }

    return result;
}

export async function sendFromBurner(
    burnerId: string,
    recipient: string,
    amount: number
): Promise<string> {
    if (amount > BURNER_LIMITS.MAX_SEND_SOL) {
        throw new Error(`Amount exceeds limit of ${BURNER_LIMITS.MAX_SEND_SOL} SOL`);
    }

    const keypair = await getBurnerKeypair(burnerId);
    if (!keypair) {
        throw new Error('Burner wallet not found');
    }

    const recipientPubkey = new PublicKey(recipient);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

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

// Destroy burner and optionally sweep remaining funds first
export async function destroyBurner(
    burnerId: string,
    sweepTo?: string
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
                console.error('Failed to sweep:', error);
            }
        }
    }

    // Delete private key and remove from list
    await SecureStore.deleteItemAsync(`${BURNER_KEY_PREFIX}${burnerId}`);

    const burners = await listBurners();
    const updatedBurners = burners.filter((b) => b.id !== burnerId);
    await saveBurnerList(updatedBurners);

    return sweepSignature;
}

export async function updateBurnerLabel(burnerId: string, newLabel: string): Promise<void> {
    const burners = await listBurners();
    const index = burners.findIndex((b) => b.id === burnerId);

    if (index !== -1) {
        burners[index].label = newLabel;
        await saveBurnerList(burners);
    }
}

export function shortenAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Burner wallet status for UI
export type BurnerStatus = 'idle' | 'creating' | 'sending' | 'sweeping' | 'destroying';

// Get total count of burner wallets
export async function getBurnerCount(): Promise<number> {
    const burners = await listBurners();
    return burners.length;
}

// Check if a burner wallet exists
export async function burnerExists(burnerId: string): Promise<boolean> {
    const burners = await listBurners();
    return burners.some((b) => b.id === burnerId);
}

// Get total balance across all burners
export async function getTotalBurnerBalance(): Promise<number> {
    const burners = await listBurnersWithBalances();
    return burners.reduce((sum, b) => sum + b.balance, 0);
}
