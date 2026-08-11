// Token detection and the curation layer.
//
// This is the anti-phishing surface named in SECURITY.md: "any false-positive
// token surfacing that could enable a phishing interface". An airdropped mint
// calling itself USDC must never reach the wallet view, and for a token that
// does pass, the symbol and name shown must come from the verified list
// rather than from the account, since account data is attacker-controlled.
//
// The module builds its Connection and its verified-list cache at import
// time, so each test re-imports it to get a clean cache.

import { PublicKey } from '@solana/web3.js';

const mockGetParsedTokenAccountsByOwner = jest.fn();

jest.mock('@solana/web3.js', () => {
  const actual = jest.requireActual('@solana/web3.js');
  return {
    ...actual,
    Connection: jest.fn().mockImplementation(() => ({
      getParsedTokenAccountsByOwner: (...args: unknown[]) =>
        mockGetParsedTokenAccountsByOwner(...args),
    })),
  };
});

const OWNER = new PublicKey('So11111111111111111111111111111111111111112');

const REAL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const FAKE_USDC = 'FakeUSDC1111111111111111111111111111111111a';

const VERIFIED_LIST = [
  {
    address: REAL_USDC,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://example.test/usdc.png',
  },
];

function tokenAccount(mint: string, uiAmount: number, amount: string, decimals = 6) {
  return {
    account: {
      data: {
        parsed: {
          info: {
            mint,
            tokenAmount: { uiAmount, amount, decimals },
          },
        },
      },
    },
  };
}

function loadModule() {
  let mod: typeof import('./detectTokens');
  jest.isolateModules(() => {
    mod = require('./detectTokens');
  });
  return mod!;
}

beforeEach(() => {
  mockGetParsedTokenAccountsByOwner.mockReset();
  mockGetParsedTokenAccountsByOwner.mockResolvedValue({ value: [] });

  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => VERIFIED_LIST,
  })) as unknown as typeof fetch;
});

describe('curation', () => {
  it('surfaces a verified token the wallet holds', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 12.5, '12500000')],
    });

    const detected = await loadModule().detectWalletTokens(OWNER);

    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      mint: REAL_USDC,
      symbol: 'USDC',
      uiAmount: 12.5,
      rawAmount: 12_500_000n,
      verified: true,
    });
  });

  // The whole point of the curation layer.
  it('drops an unverified mint even when it holds a real balance', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(FAKE_USDC, 1_000_000, '1000000000000')],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toEqual([]);
  });

  it('keeps the real token and drops the impostor sitting beside it', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [
        tokenAccount(FAKE_USDC, 999_999, '999999000000'),
        tokenAccount(REAL_USDC, 5, '5000000'),
      ],
    });

    const detected = await loadModule().detectWalletTokens(OWNER);

    expect(detected).toHaveLength(1);
    expect(detected[0].mint).toBe(REAL_USDC);
  });

  // Account data is attacker-controlled. Display metadata must not come
  // from it.
  it('takes the symbol and name from the verified list, not the account', async () => {
    const spoofed = tokenAccount(REAL_USDC, 1, '1000000') as any;
    spoofed.account.data.parsed.info.symbol = 'FREE MONEY';
    spoofed.account.data.parsed.info.name = 'Claim at evil.test';

    mockGetParsedTokenAccountsByOwner.mockResolvedValue({ value: [spoofed] });

    const detected = await loadModule().detectWalletTokens(OWNER);

    expect(detected[0].symbol).toBe('USDC');
    expect(detected[0].name).toBe('USD Coin');
  });

  it('takes decimals from the verified list rather than the account', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 1, '1000000', 99)],
    });

    const detected = await loadModule().detectWalletTokens(OWNER);
    expect(detected[0].decimals).toBe(6);
  });
});

describe('dust and malformed accounts', () => {
  it('drops a balance below the dust threshold', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 0.0000001, '0')],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toEqual([]);
  });

  it('keeps a balance exactly on the threshold', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 0.000001, '1')],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toHaveLength(1);
  });

  it('drops a zero balance account', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 0, '0')],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toEqual([]);
  });

  it('skips an account with no parsed info instead of throwing', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [{ account: { data: { parsed: null } } }],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toEqual([]);
  });

  it('skips an account with no token amount', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [{ account: { data: { parsed: { info: { mint: REAL_USDC } } } } }],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toEqual([]);
  });

  it('treats a null uiAmount as zero rather than NaN', async () => {
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [
        {
          account: {
            data: {
              parsed: {
                info: { mint: REAL_USDC, tokenAmount: { uiAmount: null, amount: '0' } },
              },
            },
          },
        },
      ],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toEqual([]);
  });
});

describe('ordering', () => {
  it('puts the largest balance first', async () => {
    const second = 'SecondVerifiedMint11111111111111111111111111';
    (global.fetch as jest.Mock).mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        ...VERIFIED_LIST,
        { address: second, symbol: 'BONK', name: 'Bonk', decimals: 5 },
      ],
    }));

    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 5, '5000000'), tokenAccount(second, 900, '90000000')],
    });

    const detected = await loadModule().detectWalletTokens(OWNER);
    expect(detected.map((t) => t.symbol)).toEqual(['BONK', 'USDC']);
  });
});

describe('the verified list fetch fails closed', () => {
  it('surfaces nothing when the list cannot be fetched and nothing is cached', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 10, '10000000')],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toEqual([]);
  });

  it('surfaces nothing on a non-200 from Jupiter', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => [],
    });
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 10, '10000000')],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toEqual([]);
  });

  it('reuses the cached list rather than refetching on every scan', async () => {
    const mod = loadModule();
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 1, '1000000')],
    });

    await mod.detectWalletTokens(OWNER);
    await mod.detectWalletTokens(OWNER);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the cached list when a later fetch fails', async () => {
    const mod = loadModule();
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 1, '1000000')],
    });

    await mod.detectWalletTokens(OWNER);

    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(mod.detectWalletTokens(OWNER)).resolves.toHaveLength(1);
  });

  it('ignores list entries with no address', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [null, { symbol: 'NOADDR' }, ...VERIFIED_LIST],
    });
    mockGetParsedTokenAccountsByOwner.mockResolvedValue({
      value: [tokenAccount(REAL_USDC, 1, '1000000')],
    });

    await expect(loadModule().detectWalletTokens(OWNER)).resolves.toHaveLength(1);
  });
});

describe('getVerifiedMetaByMint', () => {
  it('returns metadata for a verified mint', async () => {
    await expect(loadModule().getVerifiedMetaByMint(REAL_USDC)).resolves.toMatchObject({
      symbol: 'USDC',
    });
  });

  it('returns null for an unverified mint', async () => {
    await expect(loadModule().getVerifiedMetaByMint(FAKE_USDC)).resolves.toBeNull();
  });
});
