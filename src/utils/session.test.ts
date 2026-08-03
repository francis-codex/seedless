// Session key lifecycle.
//
// SECURITY.md lists "storage, scope, expiry and revocation of session keys"
// as in scope for us, and a session key is a signer that can move funds
// without a FaceID prompt. The properties worth pinning are: an expired
// session must never be handed back, expiry must be evaluated against the
// chain rather than trusted blindly, a corrupt record must fail closed, and
// one wallet's session must never be readable under another wallet's id.

import * as SecureStore from 'expo-secure-store';
import { Keypair, PublicKey } from '@solana/web3.js';

const mockGetSlot = jest.fn();

jest.mock('./connection', () => ({
  connection: { getSlot: (...args: unknown[]) => mockGetSlot(...args) },
  fallbackConnection: { getSlot: (...args: unknown[]) => mockGetSlot(...args) },
}));

import {
  SESSION_SLOT_DURATION,
  clearSession,
  computeExpiresAtSlot,
  generateSessionKeypair,
  getActiveSession,
  storeSession,
} from './session';

const WALLET = 'WaLLeTiD1111111111111111111111111111111111';
const OTHER_WALLET = 'OtHeRWaLLeT22222222222222222222222222222222';

// A session is stored against a slot window, so every test needs a chain
// position to anchor to. 1_000_000 is arbitrary and far from any boundary.
const NOW_SLOT = 1_000_000;

async function seedSession(opts: {
  walletId?: string;
  expiresAtSlot: bigint;
}): Promise<{ keypair: Keypair; pda: PublicKey }> {
  const keypair = generateSessionKeypair();
  const pda = Keypair.generate().publicKey;
  await storeSession(opts.walletId, keypair, pda, opts.expiresAtSlot);
  return { keypair, pda };
}

beforeEach(() => {
  mockGetSlot.mockReset();
  mockGetSlot.mockResolvedValue(NOW_SLOT);
  jest.useRealTimers();
});

describe('computeExpiresAtSlot', () => {
  it('anchors expiry a fixed window ahead of the confirmed slot', async () => {
    await expect(computeExpiresAtSlot()).resolves.toBe(
      BigInt(NOW_SLOT) + SESSION_SLOT_DURATION,
    );
  });

  it('probes the chain rather than extrapolating, because expiry anchors on it', async () => {
    await computeExpiresAtSlot();
    expect(mockGetSlot).toHaveBeenCalledWith('confirmed');
  });

  it('gives roughly a thirty minute window at 400ms per slot', () => {
    const minutes = (Number(SESSION_SLOT_DURATION) * 400) / 60_000;
    expect(minutes).toBeCloseTo(30, 0);
  });
});

describe('getActiveSession', () => {
  it('returns null when nothing is stored', async () => {
    await expect(getActiveSession(WALLET)).resolves.toBeNull();
  });

  it('returns a live session inside the window', async () => {
    const { pda } = await seedSession({
      walletId: WALLET,
      expiresAtSlot: BigInt(NOW_SLOT) + 1_000n,
    });

    const active = await getActiveSession(WALLET);
    expect(active).not.toBeNull();
    expect(active!.sessionPda.toBase58()).toBe(pda.toBase58());
    expect(active!.remainingMs).toBe(1_000 * 400);
  });

  it('round-trips the secret key so the restored signer matches', async () => {
    const { keypair } = await seedSession({
      walletId: WALLET,
      expiresAtSlot: BigInt(NOW_SLOT) + 1_000n,
    });

    const active = await getActiveSession(WALLET);
    expect(active!.sessionKeypair.publicKey.toBase58()).toBe(
      keypair.publicKey.toBase58(),
    );
  });

  it('refuses a session whose expiry slot has passed', async () => {
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) - 1n });
    await expect(getActiveSession(WALLET)).resolves.toBeNull();
  });

  it('refuses a session expiring exactly on the current slot', async () => {
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) });
    await expect(getActiveSession(WALLET)).resolves.toBeNull();
  });

  it('wipes the stored secret when it refuses an expired session', async () => {
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) - 1n });
    await getActiveSession(WALLET);

    const keychain: Map<string, string> = (global as any).__keychain;
    const leftovers = [...keychain.keys()].filter((k) => k.includes('lazor_session'));
    expect(leftovers).toEqual([]);
  });

  it('fails closed and clears when the stored expiry is corrupt', async () => {
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) + 1_000n });
    await SecureStore.setItemAsync(
      `lazor_session_expires_${WALLET.slice(0, 16)}`,
      'not-a-slot',
    );

    await expect(getActiveSession(WALLET)).resolves.toBeNull();

    const keychain: Map<string, string> = (global as any).__keychain;
    const leftovers = [...keychain.keys()].filter((k) => k.includes('lazor_session'));
    expect(leftovers).toEqual([]);
  });

  it('returns null on a partial record rather than reconstructing a signer', async () => {
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) + 1_000n });
    await SecureStore.deleteItemAsync(`lazor_session_pda_${WALLET.slice(0, 16)}`);

    await expect(getActiveSession(WALLET)).resolves.toBeNull();
  });
});

describe('wallet scoping', () => {
  it('does not leak one wallet session to another wallet id', async () => {
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) + 1_000n });
    await expect(getActiveSession(OTHER_WALLET)).resolves.toBeNull();
  });

  it('keeps two wallet sessions independent', async () => {
    const a = await seedSession({
      walletId: WALLET,
      expiresAtSlot: BigInt(NOW_SLOT) + 1_000n,
    });
    const b = await seedSession({
      walletId: OTHER_WALLET,
      expiresAtSlot: BigInt(NOW_SLOT) + 2_000n,
    });

    const activeA = await getActiveSession(WALLET);
    const activeB = await getActiveSession(OTHER_WALLET);

    expect(activeA!.sessionPda.toBase58()).toBe(a.pda.toBase58());
    expect(activeB!.sessionPda.toBase58()).toBe(b.pda.toBase58());
  });

  it('clearing one wallet session leaves the other intact', async () => {
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) + 1_000n });
    await seedSession({ walletId: OTHER_WALLET, expiresAtSlot: BigInt(NOW_SLOT) + 1_000n });

    await clearSession(WALLET);

    await expect(getActiveSession(WALLET)).resolves.toBeNull();
    await expect(getActiveSession(OTHER_WALLET)).resolves.not.toBeNull();
  });

  it('scopes on a wallet id prefix, so ids sharing that prefix collide', async () => {
    // Documenting real behaviour rather than asserting it is desirable: the
    // scope key truncates to 16 chars. Solana addresses are base58 and a
    // shared 16-character prefix is not realistic, but if the id source ever
    // changes to something with a common prefix, this test fails loudly.
    const long = 'SamePrefix123456_AAAA';
    const alsoLong = 'SamePrefix123456_BBBB';

    await seedSession({ walletId: long, expiresAtSlot: BigInt(NOW_SLOT) + 1_000n });
    await expect(getActiveSession(alsoLong)).resolves.not.toBeNull();
  });
});

describe('expiry is checked against the chain near the boundary', () => {
  it('re-probes the chain when the session is inside the safety buffer', async () => {
    // Expiry only 10 slots away is well inside the 120 slot buffer, so the
    // local estimate must not be trusted on its own.
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) + 10n });

    mockGetSlot.mockClear();
    await getActiveSession(WALLET);

    expect(mockGetSlot).toHaveBeenCalled();
  });

  it('catches a session that expired between the cached reading and the send', async () => {
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) + 10n });

    // The chain has moved past expiry since the cached slot was taken.
    mockGetSlot.mockResolvedValue(NOW_SLOT + 50);

    await expect(getActiveSession(WALLET)).resolves.toBeNull();
  });
});

describe('clearSession', () => {
  it('removes every part of the record', async () => {
    await seedSession({ walletId: WALLET, expiresAtSlot: BigInt(NOW_SLOT) + 1_000n });
    await clearSession(WALLET);

    const keychain: Map<string, string> = (global as any).__keychain;
    expect([...keychain.keys()]).toEqual([]);
  });

  it('is safe to call when nothing is stored', async () => {
    await expect(clearSession(WALLET)).resolves.toBeUndefined();
  });
});
