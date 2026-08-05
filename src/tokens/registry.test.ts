// Amount conversion for the token registry.
//
// Every send and swap funnels a user-typed string through uiAmountToRaw, so
// this is the last place a bad number can be caught before it becomes an
// on-chain instruction. The cases worth pinning are the ones where JavaScript
// number parsing is more permissive than a user would expect.

import {
  SUPPORTED_TOKENS,
  TOKEN_REGISTRY,
  getTokenByMint,
  getTokenBySymbol,
  rawToUiAmount,
  tokenMintPubkey,
  uiAmountToRaw,
} from './registry';

const SOL = TOKEN_REGISTRY.SOL;
const USDC = TOKEN_REGISTRY.USDC;

describe('registry shape', () => {
  it('marks only SOL as native', () => {
    const native = SUPPORTED_TOKENS.filter((t) => t.isNative).map((t) => t.symbol);
    expect(native).toEqual(['SOL']);
  });

  it('gives every token a distinct mint', () => {
    const mints = SUPPORTED_TOKENS.map((t) => t.mint);
    expect(new Set(mints).size).toBe(mints.length);
  });

  it('exposes a valid public key for every mint', () => {
    for (const token of SUPPORTED_TOKENS) {
      expect(() => tokenMintPubkey(token)).not.toThrow();
    }
  });

  it('resolves a token by mint', () => {
    expect(getTokenByMint(USDC.mint)?.symbol).toBe('USDC');
  });

  it('returns undefined for an unknown mint rather than a wrong token', () => {
    expect(getTokenByMint('NotAMintAddress')).toBeUndefined();
  });

  it('resolves a token by symbol', () => {
    expect(getTokenBySymbol('SEED').symbol).toBe('SEED');
  });
});

describe('uiAmountToRaw', () => {
  it('scales by the token decimals', () => {
    expect(uiAmountToRaw('1', SOL)).toBe(1_000_000_000n);
    expect(uiAmountToRaw('1', USDC)).toBe(1_000_000n);
  });

  it('handles a fractional amount without float drift', () => {
    expect(uiAmountToRaw('1.5', USDC)).toBe(1_500_000n);
    expect(uiAmountToRaw('0.1', SOL)).toBe(100_000_000n);
    expect(uiAmountToRaw('0.000001', USDC)).toBe(1n);
  });

  it.each(['', ' ', 'abc', 'NaN', 'Infinity', '-1', '0'])(
    'rejects %p',
    (input) => {
      expect(uiAmountToRaw(input, USDC)).toBeNull();
    },
  );

  it('rejects an amount that rounds to zero at this precision', () => {
    // Below one base unit for a 6-decimal token — must not silently send 0.
    expect(uiAmountToRaw('0.0000001', USDC)).toBeNull();
  });

  it('rejects an amount too large to represent exactly', () => {
    // Beyond Number.MAX_SAFE_INTEGER once scaled, where the rounded value
    // would no longer be the number the user typed.
    expect(uiAmountToRaw('10000000000', SOL)).toBeNull();
  });

  it('accepts the largest amount that still scales exactly', () => {
    expect(uiAmountToRaw('9000000', SOL)).toBe(9_000_000_000_000_000n);
  });

  // Documenting real behaviour, not endorsing it. Number() accepts these
  // forms, so a paste or an autofill can produce a value the user did not
  // mean to type. If input validation ever tightens, these should flip.
  it('accepts exponent notation, because Number does', () => {
    expect(uiAmountToRaw('1e3', USDC)).toBe(1_000_000_000n);
  });

  it('accepts hex notation, because Number does', () => {
    expect(uiAmountToRaw('0x10', USDC)).toBe(16_000_000n);
  });

  it('accepts surrounding whitespace, because Number does', () => {
    expect(uiAmountToRaw('  2.5  ', USDC)).toBe(2_500_000n);
  });

  it('rejects a comma-grouped amount rather than misreading it', () => {
    expect(uiAmountToRaw('1,000', USDC)).toBeNull();
  });
});

describe('rawToUiAmount', () => {
  it('is the inverse of uiAmountToRaw for representable amounts', () => {
    for (const input of ['1', '1.5', '0.25', '1000']) {
      const raw = uiAmountToRaw(input, USDC)!;
      expect(rawToUiAmount(raw, USDC)).toBeCloseTo(Number(input), 6);
    }
  });

  it('renders a single base unit at full precision', () => {
    expect(rawToUiAmount(1n, USDC)).toBe(0.000001);
    expect(rawToUiAmount(1n, SOL)).toBe(1e-9);
  });

  it('renders zero as zero', () => {
    expect(rawToUiAmount(0n, SOL)).toBe(0);
  });
});
