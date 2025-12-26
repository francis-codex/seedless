// Solana RPC Configuration
// Using Helius for reliable RPC access
export const SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=db683a77-edb6-4c80-8cac-944640c07e21';

// LazorKit Portal and Paymaster
export const PORTAL_URL = 'https://portal.lazor.sh';
export const PAYMASTER_URL = 'https://kora.devnet.lazorkit.com';

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
