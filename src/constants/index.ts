// Solana RPC Configuration - MAINNET
export const SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=db683a77-edb6-4c80-8cac-944640c07e21';

// LazorKit Portal and Paymaster (MAINNET)
export const PORTAL_URL = 'https://portal.lazor.sh';
export const PAYMASTER_URL = 'https://kora.lazorkit.com';

// USDC Token Mint Address (Mainnet)
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Fee payment options
// Gasless = paymaster sponsors fees (default)
// USDC = user pays fees in USDC
// SOL = user pays fees in SOL (traditional)
export const FEE_OPTIONS = {
  GASLESS: null, // Default - paymaster covers
  USDC: USDC_MINT,
} as const;

// App deep link scheme for passkey callbacks
export const APP_SCHEME = 'lazorwallet';

// Jupiter Swap API - MAINNET
export const JUPITER_API_URL = 'https://api.jup.ag';
export const JUPITER_API_KEY = '90349292-c128-4906-acf3-0b709e7e0f3b';

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

// Network indicator - MAINNET
export const IS_DEVNET = false;

// Cluster for LazorKit SDK transactions - MAINNET
export const CLUSTER_SIMULATION = 'mainnet';

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
export const APP_VERSION = '0.1.0-beta';

// Supported token list for quick validation
export const SUPPORTED_TOKENS = ['SOL', 'USDC'] as const;
export type SupportedToken = typeof SUPPORTED_TOKENS[number];

// Transaction batch limits for bulk operations
export const BATCH_LIMITS = {
  MAX_INSTRUCTIONS_PER_TX: 10,
  MAX_ACCOUNTS_PER_TX: 64,
  MAX_TX_SIZE_BYTES: 1232,
} as const;

// Minimum balances to keep for rent exemption
export const MIN_RENT_BALANCE_SOL = 0.00203928;
export const MIN_RENT_BALANCE_LAMPORTS = 2039280;

// Default priority fee levels (microlamports per compute unit)
export const PRIORITY_FEE_LEVELS = {
  LOW: 1000,
  MEDIUM: 50000,
  HIGH: 200000,
  TURBO: 1000000,
} as const;
