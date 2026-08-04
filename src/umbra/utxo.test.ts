// Recipient pre-flight for private sends.
//
// Two things are being protected here. First, correctness: a half-registered
// account can report `isUserCommitmentRegistered: true` while its X25519 key
// is still 32 zero bytes, and a Uint8Array is truthy no matter what it holds,
// so a naive check waves through a recipient who cannot actually decrypt.
// Second, privacy: this function receives the recipient address, and writing
// that to logcat in a release build would undo the linkage that private sends
// exist to break. That leak shipped once and was fixed in 776da52.

const mockQuery = jest.fn();

jest.mock('@umbra-privacy/sdk/query', () => ({
  getUserAccountQuerierFunction: () => mockQuery,
}));
jest.mock('@umbra-privacy/sdk/deposit', () => ({
  getATAIntoReceiverBurnableStealthPoolNoteCreatorFunction: jest.fn(),
}));
jest.mock('@umbra-privacy/sdk/burn', () => ({
  getBurnableStealthPoolNoteScannerFunction: jest.fn(),
}));
jest.mock('@umbra-privacy/sdk/types', () => ({
  createU64: ({ value }: { value: bigint }) => value,
}));
jest.mock('./zk/provers', () => ({
  createCreateUtxoFromPublicBalanceWithReceiverUnlockerZkProver: jest.fn(),
}));

import { checkRecipientUmbraStatus, scanClaimableUtxosAcrossTrees } from './utxo';

const RECIPIENT = 'RecipientAddress1111111111111111111111111111';
const client = {} as any;

const ZERO_KEY = new Uint8Array(32);
const REAL_KEY = new Uint8Array(32).fill(7);

describe('checkRecipientUmbraStatus', () => {
  it('reports an unregistered account', async () => {
    mockQuery.mockResolvedValue({ state: 'non_existent' });

    await expect(checkRecipientUmbraStatus(client, RECIPIENT)).resolves.toEqual({
      registered: false,
      hasX25519: false,
    });
  });

  it('accepts a fully registered recipient', async () => {
    mockQuery.mockResolvedValue({
      state: 'exists',
      data: { x25519PublicKey: REAL_KEY, isUserCommitmentRegistered: true },
    });

    await expect(checkRecipientUmbraStatus(client, RECIPIENT)).resolves.toEqual({
      registered: true,
      hasX25519: true,
    });
  });

  // The half-registered case: step 1 ran, step 2 did not.
  it('rejects an all-zero X25519 key even when the flag claims registered', async () => {
    mockQuery.mockResolvedValue({
      state: 'exists',
      data: { x25519PublicKey: ZERO_KEY, isUserCommitmentRegistered: true },
    });

    await expect(checkRecipientUmbraStatus(client, RECIPIENT)).resolves.toEqual({
      registered: true,
      hasX25519: false,
    });
  });

  it('rejects a real key when the commitment is not registered', async () => {
    mockQuery.mockResolvedValue({
      state: 'exists',
      data: { x25519PublicKey: REAL_KEY, isUserCommitmentRegistered: false },
    });

    await expect(checkRecipientUmbraStatus(client, RECIPIENT)).resolves.toMatchObject({
      hasX25519: false,
    });
  });

  it('rejects a missing key rather than throwing', async () => {
    mockQuery.mockResolvedValue({
      state: 'exists',
      data: { isUserCommitmentRegistered: true },
    });

    await expect(checkRecipientUmbraStatus(client, RECIPIENT)).resolves.toMatchObject({
      registered: true,
      hasX25519: false,
    });
  });

  it.each(['x25519PublicKey', 'x25519Pubkey', 'confidentialKey'])(
    'reads the key from %s',
    async (field) => {
      mockQuery.mockResolvedValue({
        state: 'exists',
        data: { [field]: REAL_KEY, isUserCommitmentRegistered: true },
      });

      await expect(checkRecipientUmbraStatus(client, RECIPIENT)).resolves.toMatchObject({
        hasX25519: true,
      });
    },
  );

  it('treats a plain number array key the same as a Uint8Array', async () => {
    mockQuery.mockResolvedValue({
      state: 'exists',
      data: { x25519PublicKey: [0, 0, 3], isUserCommitmentRegistered: true },
    });

    await expect(checkRecipientUmbraStatus(client, RECIPIENT)).resolves.toMatchObject({
      hasX25519: true,
    });
  });

  it('marks the result unknown when the RPC pre-flight fails', async () => {
    mockQuery.mockRejectedValue(new Error('-32401 unauthorized'));

    const result = await checkRecipientUmbraStatus(client, RECIPIENT);
    expect(result).toMatchObject({ registered: false, hasX25519: false, unknown: true });
    expect(result.unknownReason).toContain('-32401');
  });

  it('does not set unknown on a clean negative, so the caller can trust it', async () => {
    mockQuery.mockResolvedValue({ state: 'non_existent' });

    const result = await checkRecipientUmbraStatus(client, RECIPIENT);
    expect(result.unknown).toBeUndefined();
  });
});

describe('recipient address never reaches the production log', () => {
  const original = (global as any).__DEV__;
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockQuery.mockResolvedValue({
      state: 'exists',
      data: { x25519PublicKey: REAL_KEY, isUserCommitmentRegistered: true },
    });
  });

  afterEach(() => {
    (global as any).__DEV__ = original;
    spy.mockRestore();
  });

  // The regression that shipped: an ungated console.log wrote the recipient
  // address to logcat on every private send, readable off-device.
  it('logs nothing in a release build', async () => {
    (global as any).__DEV__ = false;

    await checkRecipientUmbraStatus(client, RECIPIENT);

    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).not.toContain(RECIPIENT);
    expect(spy).not.toHaveBeenCalled();
  });

  it('still logs in a dev build, where the diagnostic is wanted', async () => {
    (global as any).__DEV__ = true;

    await checkRecipientUmbraStatus(client, RECIPIENT);

    expect(spy).toHaveBeenCalled();
  });
});

describe('scanClaimableUtxosAcrossTrees', () => {
  const scanner = require('@umbra-privacy/sdk/burn')
    .getBurnableStealthPoolNoteScannerFunction as jest.Mock;

  it('defaults every bucket when the scanner returns a bare object', async () => {
    scanner.mockReturnValue(async () => ({}));

    await expect(scanClaimableUtxosAcrossTrees({ client })).resolves.toMatchObject({
      selfBurnable: [],
      received: [],
      publicSelfBurnable: [],
      publicReceived: [],
      treesScanned: 0,
    });
  });

  it('passes the four buckets through and counts scanned trees', async () => {
    scanner.mockReturnValue(async () => ({
      selfBurnable: [{ a: 1 }],
      received: [{ b: 2 }, { c: 3 }],
      publicSelfBurnable: [],
      publicReceived: [{ d: 4 }],
      scannedTrees: [0, 1, 2],
    }));

    const result = await scanClaimableUtxosAcrossTrees({ client });
    expect(result.received).toHaveLength(2);
    expect(result.treesScanned).toBe(3);
    expect(result.perTree[0].counts).toBe('1sb/2r/0psb/1pr');
  });

  it('tolerates a non-array scannedTrees rather than throwing', async () => {
    scanner.mockReturnValue(async () => ({ scannedTrees: null }));

    await expect(scanClaimableUtxosAcrossTrees({ client })).resolves.toMatchObject({
      treesScanned: 0,
    });
  });
});
