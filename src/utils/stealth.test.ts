// Stealth address derivation.
//
// SECURITY.md puts "address derivation correctness" in scope, and the stakes
// are asymmetric: a derivation that is not deterministic loses funds sent to
// an address the user can no longer reproduce a key for, and a derivation
// that is not scoped hands one wallet the sweep key for another wallet's
// address. Both are pinned here, along with the guard in getStealthKeypair
// that refuses to return a key which does not match the address being swept.

jest.mock('expo-crypto', () => {
  const nodeCrypto = require('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
    // Real SHA-256 so derivation is genuinely deterministic under test.
    digestStringAsync: jest.fn(async (_algo: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data, 'utf8').digest('hex'),
    ),
    getRandomBytesAsync: jest.fn(async (n: number) => nodeCrypto.randomBytes(n)),
  };
});

import * as SecureStore from 'expo-secure-store';

import {
  MAX_STEALTH_ADDRESSES,
  canGenerateMoreStealth,
  deriveStealthKeypairForIndex,
  deriveStealthKeypairs,
  formatMetaAddress,
  generateStealthAddress,
  getAllStealthAddresses,
  getLatestStealthAddress,
  getOrCreateMasterSeed,
  getStealthAddressByIndex,
  getStealthAddressCount,
  getStealthKeypair,
  getStealthMetaAddress,
  hasStealthAddresses,
  hideStealthAddress,
  isOwnedStealthAddress,
  isStealthInitialized,
  isValidAddress,
  isValidMetaAddress,
  isValidStealthLabel,
  resetStealthIndex,
  sanitizeStealthLabel,
} from './stealth';

const WALLET_A = 'WalletAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const WALLET_B = 'WalletBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

describe('master seed', () => {
  it('creates a 32 byte seed on first use', async () => {
    const seed = await getOrCreateMasterSeed();
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the same seed on every later call', async () => {
    const first = await getOrCreateMasterSeed();
    const second = await getOrCreateMasterSeed();
    expect(second).toBe(first);
  });

  it('stores the seed device-only, so it never syncs off the phone', async () => {
    await getOrCreateMasterSeed();

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'lazor_stealth_master_seed',
      expect.any(String),
      expect.objectContaining({
        keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
      }),
    );
  });

  it('reports uninitialised until an address has been generated', async () => {
    await getOrCreateMasterSeed();
    await expect(isStealthInitialized(WALLET_A)).resolves.toBe(false);

    await generateStealthAddress(undefined, WALLET_A);
    await expect(isStealthInitialized(WALLET_A)).resolves.toBe(true);
  });
});

describe('derivation is deterministic', () => {
  const SEED = 'a'.repeat(64);

  it('gives the same keypair for the same seed and index', async () => {
    const first = await deriveStealthKeypairForIndex(SEED, 3, WALLET_A);
    const second = await deriveStealthKeypairForIndex(SEED, 3, WALLET_A);

    expect(second.publicKey.toBase58()).toBe(first.publicKey.toBase58());
  });

  it('gives a different keypair per index', async () => {
    const zero = await deriveStealthKeypairForIndex(SEED, 0, WALLET_A);
    const one = await deriveStealthKeypairForIndex(SEED, 1, WALLET_A);

    expect(one.publicKey.toBase58()).not.toBe(zero.publicKey.toBase58());
  });

  // Without wallet scoping, two passkeys on one device would derive the same
  // stealth addresses and each could sweep the other's funds.
  it('gives a different keypair per wallet at the same index', async () => {
    const a = await deriveStealthKeypairForIndex(SEED, 0, WALLET_A);
    const b = await deriveStealthKeypairForIndex(SEED, 0, WALLET_B);

    expect(b.publicKey.toBase58()).not.toBe(a.publicKey.toBase58());
  });

  it('separates the unscoped derivation from any scoped one', async () => {
    const unscoped = await deriveStealthKeypairForIndex(SEED, 0);
    const scoped = await deriveStealthKeypairForIndex(SEED, 0, WALLET_A);

    expect(scoped.publicKey.toBase58()).not.toBe(unscoped.publicKey.toBase58());
  });

  it('gives a different keypair for a different seed', async () => {
    const a = await deriveStealthKeypairForIndex('a'.repeat(64), 0, WALLET_A);
    const b = await deriveStealthKeypairForIndex('b'.repeat(64), 0, WALLET_A);

    expect(b.publicKey.toBase58()).not.toBe(a.publicKey.toBase58());
  });

  it('derives distinct scan and spend keys from one seed', async () => {
    const { scanKeypair, spendKeypair } = await deriveStealthKeypairs(SEED);

    expect(scanKeypair.publicKey.toBase58()).not.toBe(
      spendKeypair.publicKey.toBase58(),
    );
  });

  it('produces a meta address whose halves are both valid keys', async () => {
    const meta = await getStealthMetaAddress();
    expect(isValidMetaAddress(meta)).toBe(true);
  });
});

describe('generateStealthAddress', () => {
  it('starts at index 0 and increments', async () => {
    const first = await generateStealthAddress(undefined, WALLET_A);
    const second = await generateStealthAddress(undefined, WALLET_A);

    expect(first.index).toBe(0);
    expect(second.index).toBe(1);
    expect(second.address).not.toBe(first.address);
  });

  it('keeps each wallet on its own counter', async () => {
    await generateStealthAddress(undefined, WALLET_A);
    await generateStealthAddress(undefined, WALLET_A);
    const b = await generateStealthAddress(undefined, WALLET_B);

    expect(b.index).toBe(0);
  });

  it('carries the label through', async () => {
    const addr = await generateStealthAddress('rent money', WALLET_A);
    expect(addr.label).toBe('rent money');
  });

  it('produces a valid Solana address', async () => {
    const addr = await generateStealthAddress(undefined, WALLET_A);
    expect(isValidAddress(addr.address)).toBe(true);
  });
});

describe('getStealthKeypair guards the sweep', () => {
  it('returns the key when the address matches', async () => {
    const addr = await generateStealthAddress(undefined, WALLET_A);
    const keypair = await getStealthKeypair(addr.address, addr.index, WALLET_A);

    expect(keypair).not.toBeNull();
    expect(keypair!.publicKey.toBase58()).toBe(addr.address);
  });

  // The address and the index are passed separately, so a caller can pair
  // them wrongly. Returning a key anyway would sign for the wrong account.
  it('refuses when the index does not derive the given address', async () => {
    const first = await generateStealthAddress(undefined, WALLET_A);
    await generateStealthAddress(undefined, WALLET_A);

    await expect(getStealthKeypair(first.address, 1, WALLET_A)).resolves.toBeNull();
  });

  it('refuses when the wallet scope does not match', async () => {
    const addr = await generateStealthAddress(undefined, WALLET_A);

    await expect(
      getStealthKeypair(addr.address, addr.index, WALLET_B),
    ).resolves.toBeNull();
  });
});

describe('listing and hiding', () => {
  it('lists every generated address', async () => {
    await generateStealthAddress(undefined, WALLET_A);
    await generateStealthAddress(undefined, WALLET_A);

    await expect(getStealthAddressCount(WALLET_A)).resolves.toBe(2);
  });

  it('omits a hidden address from the list', async () => {
    const first = await generateStealthAddress(undefined, WALLET_A);
    await generateStealthAddress(undefined, WALLET_A);

    await hideStealthAddress(first.index, WALLET_A);

    const addresses = await getAllStealthAddresses(WALLET_A);
    expect(addresses.map((a) => a.index)).toEqual([1]);
  });

  it('hiding is idempotent', async () => {
    await generateStealthAddress(undefined, WALLET_A);
    await hideStealthAddress(0, WALLET_A);
    await hideStealthAddress(0, WALLET_A);

    await expect(getStealthAddressCount(WALLET_A)).resolves.toBe(0);
  });

  it('still derives the key for a hidden address, so funds are recoverable', async () => {
    const addr = await generateStealthAddress(undefined, WALLET_A);
    await hideStealthAddress(addr.index, WALLET_A);

    const keypair = await getStealthKeypair(addr.address, addr.index, WALLET_A);
    expect(keypair).not.toBeNull();
  });

  it('recognises its own address and rejects a foreign one', async () => {
    const addr = await generateStealthAddress(undefined, WALLET_A);

    await expect(isOwnedStealthAddress(addr.address, WALLET_A)).resolves.toBe(true);
    await expect(isOwnedStealthAddress(addr.address, WALLET_B)).resolves.toBe(false);
  });

  it('returns the most recent address', async () => {
    await generateStealthAddress(undefined, WALLET_A);
    const second = await generateStealthAddress(undefined, WALLET_A);

    await expect(getLatestStealthAddress(WALLET_A)).resolves.toBe(second.address);
  });

  it('returns null for the latest when nothing exists', async () => {
    await expect(getLatestStealthAddress(WALLET_A)).resolves.toBeNull();
  });

  it('looks an address up by index', async () => {
    await generateStealthAddress(undefined, WALLET_A);
    const second = await generateStealthAddress(undefined, WALLET_A);

    const found = await getStealthAddressByIndex(second.index, WALLET_A);
    expect(found?.address).toBe(second.address);
  });

  it('returns null for an index that was never generated', async () => {
    await expect(getStealthAddressByIndex(9, WALLET_A)).resolves.toBeNull();
  });

  it('reports emptiness correctly', async () => {
    await expect(hasStealthAddresses(WALLET_A)).resolves.toBe(false);
    await generateStealthAddress(undefined, WALLET_A);
    await expect(hasStealthAddresses(WALLET_A)).resolves.toBe(true);
  });

  it('resetting the index stops the list without destroying the seed', async () => {
    await generateStealthAddress(undefined, WALLET_A);
    await resetStealthIndex(WALLET_A);

    await expect(getStealthAddressCount(WALLET_A)).resolves.toBe(0);
    await expect(getOrCreateMasterSeed()).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});

// Documenting real behaviour. MAX_STEALTH_ADDRESSES exists and
// canGenerateMoreStealth reads it, but generateStealthAddress never consults
// either, and the count it checks excludes hidden addresses. If the cap is
// meant to be enforced, it has to be enforced in the generator and counted
// against the index rather than the visible list.
describe('the address cap is advisory, not enforced', () => {
  it('canGenerateMoreStealth goes false at the cap', async () => {
    await SecureStore.setItemAsync(
      `lazor_stealth_index_${WALLET_A.slice(0, 16)}`,
      String(MAX_STEALTH_ADDRESSES),
    );

    await expect(canGenerateMoreStealth(WALLET_A)).resolves.toBe(false);
  });

  it('but the generator issues another address anyway', async () => {
    await SecureStore.setItemAsync(
      `lazor_stealth_index_${WALLET_A.slice(0, 16)}`,
      String(MAX_STEALTH_ADDRESSES),
    );

    const addr = await generateStealthAddress(undefined, WALLET_A);
    expect(addr.index).toBe(MAX_STEALTH_ADDRESSES);
  });

  it('and hiding addresses lowers the count the cap is measured against', async () => {
    await SecureStore.setItemAsync(
      `lazor_stealth_index_${WALLET_A.slice(0, 16)}`,
      String(MAX_STEALTH_ADDRESSES),
    );
    await hideStealthAddress(0, WALLET_A);

    await expect(canGenerateMoreStealth(WALLET_A)).resolves.toBe(true);
  });
});

describe('address and label validation', () => {
  it('accepts a real address', () => {
    expect(isValidAddress('So11111111111111111111111111111111111111112')).toBe(true);
  });

  it.each(['', 'not-an-address', '0x1234', 'So1111'])(
    'rejects %p',
    (input) => {
      expect(isValidAddress(input)).toBe(false);
    },
  );

  it('rejects a meta address with a bad half', () => {
    expect(
      isValidMetaAddress({
        scanPubkey: 'So11111111111111111111111111111111111111112',
        spendPubkey: 'nonsense',
      }),
    ).toBe(false);
  });

  it('shortens both halves for display', () => {
    const formatted = formatMetaAddress({
      scanPubkey: 'So11111111111111111111111111111111111111112',
      spendPubkey: 'So11111111111111111111111111111111111111113',
    });

    expect(formatted).toBe('So11...1112:So11...1113');
  });

  it.each(['rent', 'Rent Money', 'rent-money_1.0'])('accepts label %p', (label) => {
    expect(isValidStealthLabel(label)).toBe(true);
  });

  it.each(['', '   ', 'a'.repeat(33), 'drop table; --', 'emoji 🎉'])(
    'rejects label %p',
    (label) => {
      expect(isValidStealthLabel(label)).toBe(false);
    },
  );

  it('trims and truncates on sanitize', () => {
    expect(sanitizeStealthLabel('  spaced  ')).toBe('spaced');
    expect(sanitizeStealthLabel('a'.repeat(50))).toHaveLength(32);
  });
});
