import { PublicKey } from '@solana/web3.js';

// ============================================================
// NETWORK TOGGLE — flip this ONE flag to switch mainnet/devnet
// ============================================================
const USE_DEVNET = true; // <-- set false for mainnet

// Solana RPC Configuration
const HELIUS_API_KEY = process.env.EXPO_PUBLIC_HELIUS_API_KEY || '';
const HELIUS_DEVNET_KEY = process.env.EXPO_PUBLIC_HELIUS_DEVNET_KEY || '';
if (!HELIUS_DEVNET_KEY && USE_DEVNET) {
  console.warn('[env] EXPO_PUBLIC_HELIUS_DEVNET_KEY is not set — RPC calls will fail');
}
export const SOLANA_RPC_URL = USE_DEVNET
  ? `https://devnet.helius-rpc.com/?api-key=${HELIUS_DEVNET_KEY}`
  : `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// LazorKit Portal and Paymaster
export const PORTAL_URL = 'https://portal.lazor.sh';
export const PAYMASTER_URL = USE_DEVNET
  ? 'https://kora.devnet.lazorkit.com'
  : 'https://kora.lazorkit.com';
export const PAYMASTER_API_KEY = process.env.EXPO_PUBLIC_PAYMASTER_API_KEY || '';

// USDC Token Mint Address
export const USDC_MINT = USE_DEVNET
  ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' // devnet USDC
  : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Fee payment options
// Gasless = paymaster sponsors fees (default)
// USDC = user pays fees in USDC
// SOL = user pays fees in SOL (traditional)
export const FEE_OPTIONS = {
  GASLESS: null, // Default - paymaster covers
  USDC: USDC_MINT,
} as const;

// App deep link scheme for passkey callbacks
export const APP_SCHEME = 'seedless';

// Jupiter Swap API - MAINNET
export const JUPITER_API_URL = 'https://api.jup.ag';
export const JUPITER_API_KEY = process.env.EXPO_PUBLIC_JUPITER_API_KEY || '';

// Bags.fm API
export const BAGS_API_URL = 'https://public-api-v2.bags.fm/api/v1';
export const BAGS_API_KEY = process.env.EXPO_PUBLIC_BAGS_API_KEY || '';

// SEED token mint (launched on Bags.fm)
export const SEED_MINT = 'FYt532fCsCuoHd9aaX5QN7pZLUTiSXwEjhBmZijgBAGS';
export const SEED_DECIMALS = 9;

// Native SOL mint address (wrapped SOL for Jupiter)
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Token decimals for amount calculations
export const TOKEN_DECIMALS = {
  SOL: 9,
  USDC: 6,
} as const;

// Slippage in basis points (100 = 1%)
export const DEFAULT_SLIPPAGE_BPS = 100;

// Compute Budget Program ID - we filter these out for Kora compatibility
export const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';

// Network indicator
export const IS_DEVNET = USE_DEVNET;

// Cluster for LazorKit SDK transactions
export const CLUSTER_SIMULATION = USE_DEVNET ? 'devnet' : 'mainnet';

// Request timeouts (ms)
export const REQUEST_TIMEOUTS = {
  DEFAULT: 30000,
  SWAP: 60000,
  RPC: 15000,
} as const;

// Error messages for consistent UX
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Check your connection and try again.',
  WALLET_NOT_FOUND: 'Wallet not found. Please set up your wallet first.',
  INSUFFICIENT_BALANCE: 'Insufficient balance for this transaction.',
  SWAP_FAILED: 'Swap failed. Please try again.',
  TRANSACTION_TIMEOUT: 'Transaction timed out. Check your wallet for status.',
  INVALID_ADDRESS: 'Invalid wallet address.',
  PASSKEY_FAILED: 'Passkey authentication failed. Please try again.',
} as const;

// Transaction status types for UI state
export type TransactionStatus = 'idle' | 'preparing' | 'signing' | 'broadcasting' | 'confirming' | 'success' | 'failed';

// Retry configuration for network requests
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 5000,
  BACKOFF_MULTIPLIER: 2,
} as const;

// Confirmation levels for transactions
export const CONFIRMATION_LEVELS = {
  PROCESSED: 'processed',
  CONFIRMED: 'confirmed',
  FINALIZED: 'finalized',
} as const;

// Session timeout for passkey auth (15 minutes)
export const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

// App version for tracking
export const APP_VERSION = '0.4.0-beta';

// Quick send amount presets
export const QUICK_AMOUNTS = [0.5, 1, 5, 10] as const;

// Supported token list for quick validation
export const SUPPORTED_TOKENS = ['SOL', 'USDC'] as const;
export type SupportedToken = typeof SUPPORTED_TOKENS[number];

// Transaction batch limits for bulk operations
export const BATCH_LIMITS = {
  MAX_INSTRUCTIONS_PER_TX: 10,
  MAX_ACCOUNTS_PER_TX: 64,
  MAX_TX_SIZE_BYTES: 1232,
} as const;

// Validate a Solana address (base58, 32 bytes)
export const isValidSolanaAddress = (address: string): boolean => {
  try {
    if (!address || typeof address !== 'string') return false;
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

// Minimum balances to keep for rent exemption
export const MIN_RENT_BALANCE_SOL = 0.00203928;
export const MIN_RENT_BALANCE_LAMPORTS = 2039280;

// Stealth address sweep constants
export const STEALTH_SWEEP_RENT = 890880;
export const STEALTH_SWEEP_FEE = 5000;

// Default priority fee levels (microlamports per compute unit)
export const PRIORITY_FEE_LEVELS = {
  LOW: 1000,
  MEDIUM: 50000,
  HIGH: 200000,
  TURBO: 1000000,
} as const;

// Wallet connection states
export type WalletConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Maximum transaction history to store locally
export const MAX_TX_HISTORY = 50;

// Display format helpers for UI
export const DISPLAY_DECIMALS = {
  SOL: 4,
  USDC: 2,
  USD: 2,
} as const;

// Solana explorer base URL for transaction links
export const EXPLORER_URL = USE_DEVNET
  ? 'https://solscan.io/?cluster=devnet'
  : 'https://solscan.io';

// Build transaction explorer link
const EXPLORER_CLUSTER = USE_DEVNET ? '?cluster=devnet' : '';
export const getTxExplorerUrl = (signature: string): string =>
  `https://solscan.io/tx/${signature}${EXPLORER_CLUSTER}`;

// Build account explorer link
export const getAccountExplorerUrl = (address: string): string =>
  `https://solscan.io/account/${address}${EXPLORER_CLUSTER}`;

// Minimum SOL for transaction (rent + fee buffer)
export const MIN_SOL_FOR_TX = 0.003;

// Swap quote refresh interval (ms)
export const QUOTE_REFRESH_INTERVAL = 10000;

// Maximum slippage allowed (5%)
export const MAX_SLIPPAGE_BPS = 500;

// Passkey credential timeout (2 minutes)
export const PASSKEY_TIMEOUT_MS = 120000;

// Balance polling interval (ms)
export const BALANCE_POLL_INTERVAL = 30000;

// Airdrop claim window duration (7 days in ms)
export const AIRDROP_CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Max token accounts to fetch per request
export const MAX_TOKEN_ACCOUNTS = 100;

// Max burner wallets per user
export const MAX_BURNER_WALLETS = 10;

// Burner wallet limits (SOL)
export const BURNER_LIMITS = {
  MAX_FUND_SOL: 10,
  MAX_SEND_SOL: 10,
} as const;
