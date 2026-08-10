// Address book.
//
// A saved label is a trust signal: the user reads "Mum" and stops checking
// the base58. That makes two things load-bearing — an address must be
// validated before it can ever be saved under a friendly name, and a lookup
// must match the full address exactly, never a prefix or a case-folded
// variant, or a lookalike address inherits a trusted label.

import * as SecureStore from 'expo-secure-store';

import {
  addAddress,
  findByAddress,
  getAddressBook,
  isValidSolanaAddress,
  removeAddress,
  updateAddress,
} from './addressBook';

const KEY = 'address_book_v1';
const ADDR_A = 'So11111111111111111111111111111111111111112';
const ADDR_B = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('reading a damaged store', () => {
  it('returns empty when nothing is saved', async () => {
    await expect(getAddressBook()).resolves.toEqual([]);
  });

  it('returns empty on unparseable JSON rather than throwing', async () => {
    await SecureStore.setItemAsync(KEY, '{not json');
    await expect(getAddressBook()).resolves.toEqual([]);
  });

  it('returns empty when the stored value is not a list', async () => {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ label: 'Mum' }));
    await expect(getAddressBook()).resolves.toEqual([]);
  });

  it('drops malformed entries but keeps the good ones', async () => {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify([
        { id: '1', label: 'Mum', address: ADDR_A, createdAt: 1 },
        { id: '2', label: 'no address' },
        null,
        { address: ADDR_B },
      ]),
    );

    const entries = await getAddressBook();
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('Mum');
  });
});

describe('adding', () => {
  it('saves a valid entry', async () => {
    const entry = await addAddress('Mum', ADDR_A);

    expect(entry.label).toBe('Mum');
    expect(entry.address).toBe(ADDR_A);
    await expect(getAddressBook()).resolves.toHaveLength(1);
  });

  it('trims whitespace off both fields', async () => {
    const entry = await addAddress('  Mum  ', `  ${ADDR_A}  `);

    expect(entry.label).toBe('Mum');
    expect(entry.address).toBe(ADDR_A);
  });

  it('refuses an empty label', async () => {
    await expect(addAddress('   ', ADDR_A)).rejects.toThrow('Label is required');
  });

  // An unvalidated address saved under a friendly name is a send into
  // nothing, disguised as a send to someone the user trusts.
  it('refuses an address that is not a valid public key', async () => {
    await expect(addAddress('Mum', 'not-an-address')).rejects.toThrow(
      'Not a valid Solana address',
    );
  });

  it('refuses a duplicate address even under a different label', async () => {
    await addAddress('Mum', ADDR_A);
    await expect(addAddress('Mother', ADDR_A)).rejects.toThrow('already saved');
  });

  it('does not write the duplicate before rejecting it', async () => {
    await addAddress('Mum', ADDR_A);
    await expect(addAddress('Mother', ADDR_A)).rejects.toThrow();

    const entries = await getAddressBook();
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('Mum');
  });

  it('allows the same label on two different addresses', async () => {
    await addAddress('Exchange', ADDR_A);
    await expect(addAddress('Exchange', ADDR_B)).resolves.toBeDefined();
  });

  it('puts the newest entry first', async () => {
    await addAddress('First', ADDR_A);
    await addAddress('Second', ADDR_B);

    const entries = await getAddressBook();
    expect(entries.map((e) => e.label)).toEqual(['Second', 'First']);
  });

  it('gives every entry a distinct id', async () => {
    const a = await addAddress('Mum', ADDR_A);
    const b = await addAddress('Dad', ADDR_B);

    expect(a.id).not.toBe(b.id);
  });
});

describe('updating and removing', () => {
  it('renames an entry without touching its address', async () => {
    const entry = await addAddress('Mum', ADDR_A);
    await updateAddress(entry.id, 'Mother');

    const entries = await getAddressBook();
    expect(entries[0].label).toBe('Mother');
    expect(entries[0].address).toBe(ADDR_A);
  });

  it('refuses to blank a label', async () => {
    const entry = await addAddress('Mum', ADDR_A);
    await expect(updateAddress(entry.id, '  ')).rejects.toThrow('Label is required');
  });

  it('leaves other entries alone when renaming', async () => {
    const a = await addAddress('Mum', ADDR_A);
    await addAddress('Dad', ADDR_B);

    await updateAddress(a.id, 'Mother');

    const labels = (await getAddressBook()).map((e) => e.label);
    expect(labels).toContain('Dad');
    expect(labels).toContain('Mother');
  });

  it('ignores an update for an unknown id', async () => {
    await addAddress('Mum', ADDR_A);
    await updateAddress('no-such-id', 'Whoever');

    await expect(getAddressBook()).resolves.toHaveLength(1);
  });

  it('removes only the named entry', async () => {
    const a = await addAddress('Mum', ADDR_A);
    await addAddress('Dad', ADDR_B);

    await removeAddress(a.id);

    const entries = await getAddressBook();
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe('Dad');
  });

  it('is a no-op for an unknown id', async () => {
    await addAddress('Mum', ADDR_A);
    await removeAddress('no-such-id');

    await expect(getAddressBook()).resolves.toHaveLength(1);
  });
});

describe('lookup matches the whole address exactly', () => {
  it('finds a saved address', async () => {
    await addAddress('Mum', ADDR_A);
    await expect(findByAddress(ADDR_A)).resolves.toMatchObject({ label: 'Mum' });
  });

  it('returns null for an address that is not saved', async () => {
    await addAddress('Mum', ADDR_A);
    await expect(findByAddress(ADDR_B)).resolves.toBeNull();
  });

  // Base58 is case sensitive, and a lookalike differing only in case is a
  // different account. It must not inherit the trusted label.
  it('does not match on a case-folded variant', async () => {
    await addAddress('Mum', ADDR_A);
    await expect(findByAddress(ADDR_A.toLowerCase())).resolves.toBeNull();
  });

  it('does not match on a prefix', async () => {
    await addAddress('Mum', ADDR_A);
    await expect(findByAddress(ADDR_A.slice(0, 20))).resolves.toBeNull();
  });

  it('does not match on trailing whitespace', async () => {
    await addAddress('Mum', ADDR_A);
    await expect(findByAddress(`${ADDR_A} `)).resolves.toBeNull();
  });
});

describe('isValidSolanaAddress', () => {
  it.each([ADDR_A, ADDR_B])('accepts %s', (addr) => {
    expect(isValidSolanaAddress(addr)).toBe(true);
  });

  it.each(['', ' ', 'abc', '0x0000000000000000000000000000000000000000', `${ADDR_A}X`])(
    'rejects %p',
    (addr) => {
      expect(isValidSolanaAddress(addr)).toBe(false);
    },
  );
});
