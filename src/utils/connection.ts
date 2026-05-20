// Shared Solana RPC Connection singletons.
//
// We have 4+ feature files (SwapScreen, WalletScreen, StealthScreen,
// burner.ts) that each used to instantiate their own
// `new Connection(SOLANA_RPC_URL, ...)`. Each instance keeps its own
// internal commitment state, RPC client, and (if web3.js does it) socket
// or fetch context. Sharing the same instance across the app cuts memory
// + lets RPC-level caching land for repeated reads of the same account.
//
// Both connections opt out of the SDK's internal retry-on-429 because we
// handle rate-limit fallback explicitly at the call site (primary →
// fallback → keep last known). Letting the SDK retry on its own causes
// the exponential 500→1000→2000→4000ms storm we hit in earlier builds.

import { Connection } from '@solana/web3.js';
import { IS_DEVNET, SOLANA_RPC_URL } from '../constants';

export const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
});

export const fallbackConnection = new Connection(
  IS_DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com',
  { commitment: 'confirmed', disableRetryOnRateLimit: true },
);
