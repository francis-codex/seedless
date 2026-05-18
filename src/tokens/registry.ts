// Token registry — single source of truth for every supported token in the app.
//
// Why a registry: send/swap/burner/stealth used to hard-code SOL/USDC/SEED in
// every screen. Adding a new token meant editing 6+ files. The registry lets
// every flow iterate one list and stay aligned.
//
// Add a new token: add an entry to TOKEN_REGISTRY. All token-aware UI picks
// it up automatically.

import { PublicKey } from '@solana/web3.js';

import { SEED_DECIMALS, SEED_MINT, SOL_MINT, USDC_MINT } from '../constants';

export type TokenSymbol = 'SOL' | 'USDC' | 'SEED';

export interface Token {
  /** Short display symbol (SOL, USDC, SEED). */
  symbol: TokenSymbol;
  /** Full display name (Solana, USD Coin, Seed). */
  name: string;
  /** SPL mint address. For native SOL this is wrapped SOL. */
  mint: string;
  /** Decimal scale for converting raw amount ↔ UI amount. */
  decimals: number;
  /** True for native SOL only. SPL tokens (USDC, SEED) are false. */
  isNative: boolean;
  /** Optional Jupiter price feed support. SOL/USDC are on the public feed, SEED is not. */
  hasJupiterPrice: boolean;
}

export const TOKEN_REGISTRY: Record<TokenSymbol, Token> = {
  SOL: {
    symbol: 'SOL',
    name: 'Solana',
    mint: SOL_MINT,
    decimals: 9,
    isNative: true,
    hasJupiterPrice: true,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: USDC_MINT,
    decimals: 6,
    isNative: false,
    hasJupiterPrice: true,
  },
  SEED: {
    symbol: 'SEED',
    name: 'Seed',
    mint: SEED_MINT,
    decimals: SEED_DECIMALS,
    isNative: false,
    hasJupiterPrice: false,
  },
};

/** Ordered list — SOL first (default), then stablecoin, then SEED. */
export const SUPPORTED_TOKENS: Token[] = [
  TOKEN_REGISTRY.SOL,
  TOKEN_REGISTRY.USDC,
  TOKEN_REGISTRY.SEED,
];

export function getTokenBySymbol(symbol: TokenSymbol): Token {
  return TOKEN_REGISTRY[symbol];
}

export function getTokenByMint(mint: string): Token | undefined {
  return SUPPORTED_TOKENS.find((t) => t.mint === mint);
}

/**
 * Convert a UI string amount (e.g. "1.5") to raw units as a bigint, scaled by
 * the token's decimals. Returns null if the input is invalid or non-positive.
 */
export function uiAmountToRaw(uiAmount: string, token: Token): bigint | null {
  const n = Number(uiAmount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const raw = Math.round(n * Math.pow(10, token.decimals));
  if (!Number.isSafeInteger(raw) || raw <= 0) return null;
  return BigInt(raw);
}

/** Format a raw bigint amount as a UI string with the token's decimals. */
export function rawToUiAmount(raw: bigint, token: Token): number {
  return Number(raw) / Math.pow(10, token.decimals);
}

export function tokenMintPubkey(token: Token): PublicKey {
  return new PublicKey(token.mint);
}
