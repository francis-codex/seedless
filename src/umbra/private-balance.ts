// Fetch the user's encrypted (private) balance from Umbra.
//
// Uses the SDK's queryEncryptedBalance function against the stored signer.
// Returns 0 when the signer is unregistered or the mint has no balance.

import { getEncryptedBalanceQuerierFunction } from '@umbra-privacy/sdk/query';
import type { IUmbraClient } from '@umbra-privacy/sdk';

export interface PrivateBalanceResult {
  lamports: bigint;
  registered: boolean;
}

// Fetch encrypted balance for a single mint. Wrapped in try/catch because the
// SDK throws when the signer hasn't been registered yet — we treat that as
// "0 + unregistered" so the UI can show a setup prompt instead of an error.
export async function fetchPrivateBalanceForMint(
  client: IUmbraClient,
  mint: string,
): Promise<PrivateBalanceResult> {
  try {
    const query = getEncryptedBalanceQuerierFunction({ client });
    const result = await query([mint as any] as any);
    // SDK returns a Map<Address, QueryEncryptedBalanceResult>; pull the entry
    // for our mint defensively. If the entry is "non_existent" the user is
    // registered but hasn't deposited this mint yet — return 0.
    const entry: any = result instanceof Map ? result.get(mint as any) : (result as any)?.[mint];
    if (!entry || entry.state === 'non_existent') {
      return { lamports: 0n, registered: true };
    }
    const raw = entry.data?.balance ?? entry.balance ?? 0n;
    const lamports = typeof raw === 'bigint' ? raw : BigInt(raw ?? 0);
    return { lamports, registered: true };
  } catch (err: any) {
    const msg = String(err?.message ?? err).toLowerCase();
    // SDK error patterns when the signer isn't registered yet.
    if (msg.includes('not registered') || msg.includes('non_existent') || msg.includes('user account')) {
      return { lamports: 0n, registered: false };
    }
    throw err;
  }
}
