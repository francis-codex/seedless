// Stealth address utilities using deterministic key derivation
// Master seed is stored encrypted in SecureStore, separate from passkey auth

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Keypair, PublicKey } from '@solana/web3.js';

const MASTER_SEED_KEY = 'lazor_stealth_master_seed';
const STEALTH_INDEX_KEY = 'lazor_stealth_index';

// No limits - production ready
export const STEALTH_LIMITS = {
  MAX_SWEEP_SOL: Infinity,
  MAX_SWEEP_USDC: Infinity,
  MAX_REQUEST_SOL: Infinity,
  MAX_REQUEST_USDC: Infinity,
} as const;

export interface StealthMetaAddress {
  scanPubkey: string;
  spendPubkey: string;
}

export interface StealthAddress {
  index: number;
  address: string;
  createdAt: number;
  label?: string;
}

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Hash a string using digestStringAsync (avoids TypedArray issues in Expo)
async function hashString(input: string): Promise<Uint8Array> {
  const hashHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return hexToBytes(hashHex);
}

// Get or create the master seed (stored encrypted)
export async function getOrCreateMasterSeed(): Promise<string> {
  try {
    let seed = await SecureStore.getItemAsync(MASTER_SEED_KEY);

    if (!seed) {
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      seed = bytesToHex(new Uint8Array(randomBytes));

      await SecureStore.setItemAsync(MASTER_SEED_KEY, seed, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    }

    return seed;
  } catch (error) {
    console.error('Failed to get/create master seed:', error);
    throw new Error('Failed to initialize stealth wallet. Please try again.');
  }
}

export async function isStealthInitialized(): Promise<boolean> {
  try {
    const seed = await SecureStore.getItemAsync(MASTER_SEED_KEY);
    return seed !== null;
  } catch {
    return false;
  }
}

// Derive scan/spend keypairs from master seed
export async function deriveStealthKeypairs(masterSeed: string): Promise<{
  scanKeypair: Keypair;
  spendKeypair: Keypair;
}> {
  // Use digestStringAsync to avoid TypedArray casting issues
  // We concatenate masterSeed (hex) with derivation path as a single string
  const scanHash = await hashString(masterSeed + ':scan');
  const scanKeypair = Keypair.fromSeed(scanHash);

  const spendHash = await hashString(masterSeed + ':spend');
  const spendKeypair = Keypair.fromSeed(spendHash);

  return { scanKeypair, spendKeypair };
}

// Public meta-address for sharing with payers
export async function getStealthMetaAddress(): Promise<StealthMetaAddress> {
  const masterSeed = await getOrCreateMasterSeed();
  const { scanKeypair, spendKeypair } = await deriveStealthKeypairs(masterSeed);

  return {
    scanPubkey: scanKeypair.publicKey.toBase58(),
    spendPubkey: spendKeypair.publicKey.toBase58(),
  };
}

// Create a new one-time receiving address 
export async function generateStealthAddress(label?: string): Promise<StealthAddress> {
  const masterSeed = await getOrCreateMasterSeed();

  const indexStr = await SecureStore.getItemAsync(STEALTH_INDEX_KEY);
  const index = indexStr ? parseInt(indexStr, 10) : 0;

  await SecureStore.setItemAsync(STEALTH_INDEX_KEY, (index + 1).toString());

  const keypair = await deriveStealthKeypairForIndex(masterSeed, index);

  return {
    index,
    address: keypair.publicKey.toBase58(),
    createdAt: Date.now(),
    label,
  };
}

// Derive keypair for a specific index (for sweeping)
export async function deriveStealthKeypairForIndex(
  masterSeed: string,
  index: number
): Promise<Keypair> {
  // Use digestStringAsync with string concatenation 
  const hash = await hashString(masterSeed + ':stealth:' + index.toString());
  return Keypair.fromSeed(hash);
}

// Get keypair for sweeping funds from a stealth address 
export async function getStealthKeypair(
  address: string,
  index: number
): Promise<Keypair | null> {
  try {
    const masterSeed = await getOrCreateMasterSeed();
    const keypair = await deriveStealthKeypairForIndex(masterSeed, index);

    if (keypair.publicKey.toBase58() !== address) {
      return null;
    }

    return keypair;
  } catch {
    return null;
  }
}

// Get all previously generated stealth addresses
export async function getAllStealthAddresses(): Promise<StealthAddress[]> {
  try {
    const masterSeed = await getOrCreateMasterSeed();
    const indexStr = await SecureStore.getItemAsync(STEALTH_INDEX_KEY);
    const maxIndex = indexStr ? parseInt(indexStr, 10) : 0;

    const addresses: StealthAddress[] = [];

    for (let i = 0; i < maxIndex; i++) {
      const keypair = await deriveStealthKeypairForIndex(masterSeed, i);
      addresses.push({
        index: i,
        address: keypair.publicKey.toBase58(),
        createdAt: 0,
      });
    }

    return addresses;
  } catch (error) {
    console.error('Failed to get stealth addresses:', error);
    return [];
  }
}

// Reset index counter (testing only)
export async function resetStealthIndex(): Promise<void> {
  await SecureStore.deleteItemAsync(STEALTH_INDEX_KEY);
}

export function formatMetaAddress(metaAddress: StealthMetaAddress): string {
  const scanShort = `${metaAddress.scanPubkey.slice(0, 4)}...${metaAddress.scanPubkey.slice(-4)}`;
  const spendShort = `${metaAddress.spendPubkey.slice(0, 4)}...${metaAddress.spendPubkey.slice(-4)}`;
  return `${scanShort}:${spendShort}`;
}

export function isValidAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// Validate stealth meta-address format
export function isValidMetaAddress(metaAddress: StealthMetaAddress): boolean {
  return isValidAddress(metaAddress.scanPubkey) && isValidAddress(metaAddress.spendPubkey);
}

// Check if an address belongs to our stealth wallet
export async function isOwnedStealthAddress(address: string): Promise<boolean> {
  try {
    const addresses = await getAllStealthAddresses();
    return addresses.some((a) => a.address === address);
  } catch {
    return false;
  }
}

// Derivation status for UI feedback
export type StealthDerivationStatus = 'idle' | 'deriving' | 'ready' | 'error';
