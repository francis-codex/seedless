// Address book — SecureStore-backed list of saved recipient addresses.
// Lives outside any wallet scope so it survives wallet reconnects.

import * as SecureStore from 'expo-secure-store';
import { PublicKey } from '@solana/web3.js';

const ADDRESS_BOOK_KEY = 'address_book_v1';

export interface AddressBookEntry {
  id: string;
  label: string;
  address: string;
  createdAt: number;
}

export async function getAddressBook(): Promise<AddressBookEntry[]> {
  const raw = await SecureStore.getItemAsync(ADDRESS_BOOK_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is AddressBookEntry =>
        e && typeof e.id === 'string' && typeof e.label === 'string' && typeof e.address === 'string',
    );
  } catch {
    return [];
  }
}

async function writeAddressBook(entries: AddressBookEntry[]): Promise<void> {
  await SecureStore.setItemAsync(ADDRESS_BOOK_KEY, JSON.stringify(entries));
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export async function addAddress(label: string, address: string): Promise<AddressBookEntry> {
  const trimmedLabel = label.trim();
  const trimmedAddress = address.trim();
  if (!trimmedLabel) throw new Error('Label is required');
  if (!isValidSolanaAddress(trimmedAddress)) throw new Error('Not a valid Solana address');

  const entries = await getAddressBook();
  if (entries.some((e) => e.address === trimmedAddress)) {
    throw new Error('This address is already saved');
  }

  const entry: AddressBookEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: trimmedLabel,
    address: trimmedAddress,
    createdAt: Date.now(),
  };
  await writeAddressBook([entry, ...entries]);
  return entry;
}

export async function updateAddress(id: string, label: string): Promise<void> {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) throw new Error('Label is required');
  const entries = await getAddressBook();
  const next = entries.map((e) => (e.id === id ? { ...e, label: trimmedLabel } : e));
  await writeAddressBook(next);
}

export async function removeAddress(id: string): Promise<void> {
  const entries = await getAddressBook();
  await writeAddressBook(entries.filter((e) => e.id !== id));
}

export async function findByAddress(address: string): Promise<AddressBookEntry | null> {
  const entries = await getAddressBook();
  return entries.find((e) => e.address === address) ?? null;
}
