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
