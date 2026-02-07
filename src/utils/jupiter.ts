import { PublicKey, TransactionInstruction, AddressLookupTableAccount, Connection } from '@solana/web3.js';
import {
  JUPITER_API_URL,
  JUPITER_API_KEY,
  DEFAULT_SLIPPAGE_BPS,
  COMPUTE_BUDGET_PROGRAM_ID,
  SOLANA_RPC_URL,
  REQUEST_TIMEOUTS,
} from '../constants';

// Swap status for UI state management
export type SwapStatus = 'idle' | 'quoting' | 'preparing' | 'signing' | 'confirming' | 'success' | 'error';

// Minimum swap amounts to prevent dust transactions
export const MIN_SWAP_AMOUNTS = {
  SOL: 0.001,
  USDC: 0.01,
} as const;

// Check if swap amount meets minimum threshold
export function isSwapAmountValid(amount: number, token: 'SOL' | 'USDC'): boolean {
  return amount >= MIN_SWAP_AMOUNTS[token];
}

// Format swap amount for display
export function formatSwapAmount(amount: number, decimals: number = 4): string {
  return amount.toFixed(decimals).replace(/\.?0+$/, '');
}

// Calculate price impact warning threshold
export const PRICE_IMPACT_THRESHOLDS = {
  LOW: 1,      // 1% - green
  MEDIUM: 3,   // 3% - yellow
  HIGH: 5,     // 5% - red warning
} as const;

// Get price impact severity level
export function getPriceImpactLevel(impactPercent: number): 'low' | 'medium' | 'high' {
  if (impactPercent <= PRICE_IMPACT_THRESHOLDS.LOW) return 'low';
  if (impactPercent <= PRICE_IMPACT_THRESHOLDS.MEDIUM) return 'medium';
  return 'high';
}

// Timeout wrapper for fetch requests
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number = REQUEST_TIMEOUTS.SWAP): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Connection for fetching Address Lookup Tables
const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
});

// Types for Jupiter API responses
export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  slippageBps: number;
  routePlan: Array<{
    swapInfo: {
      label: string;
      inputMint: string;
      outputMint: string;
    };
    percent: number;
  }>;
}

interface JupiterInstruction {
  programId: string;
  accounts: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: string; // base64 encoded
}

interface SwapInstructionsResponse {
  computeBudgetInstructions: JupiterInstruction[];
  setupInstructions: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction?: JupiterInstruction;
  addressLookupTableAddresses: string[];
}


// Step 1: Get a quote from Jupiter

// This tells us how much output token we'll get for our input amount
// It also finds the best route across all DEXes

export async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: string, // in smallest units (lamports for SOL)
  slippageBps: number = DEFAULT_SLIPPAGE_BPS
): Promise<QuoteResponse> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
  });

  const response = await fetch(
    `${JUPITER_API_URL}/swap/v1/quote?${params}`,
    {
      headers: {
        'x-api-key': JUPITER_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jupiter quote failed: ${error}`);
  }

  return response.json();
}


// Step 2: Get swap instructions from Jupiter

// This is the key endpoint - it returns raw instructions instead of a serialized transaction
// This lets us use them with LazorKit

export async function getSwapInstructions(
  quote: QuoteResponse,
  userPublicKey: PublicKey
): Promise<SwapInstructionsResponse> {
  const response = await fetch(
    `${JUPITER_API_URL}/swap/v1/swap-instructions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': JUPITER_API_KEY,
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPublicKey.toString(),
        // Don't wrap/unwrap SOL - let Jupiter handle it
        wrapAndUnwrapSol: true,
        // Use versioned transactions for more accounts
        asLegacyTransaction: false,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jupiter swap-instructions failed: ${error}`);
  }

  return response.json();
}


// Step 3: Deserialize a Jupiter instruction into Solana's format

// Jupiter returns instructions in their own format (JSON with base64 data)
// We need to convert them to Solana's TransactionInstruction format so LazorKit can use them

export function deserializeInstruction(instruction: JupiterInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    // Jupiter sends data as base64, we convert to Buffer
    data: Buffer.from(instruction.data, 'base64'),
  });
}


// Step 4: Filter out compute budget instructions

// THIS IS CRITICAL FOR KORA COMPATIBILITY

// Why we filter:
// - Jupiter adds ComputeBudget instructions to set priority fees
// - Kora paymaster ALSO adds its own compute budget settings
// - Having both causes conflicts and transaction failures

// Solution: Remove Jupiter's compute budget instructions and let Kora handle it

export function filterComputeBudgetInstructions(
  instructions: TransactionInstruction[]
): TransactionInstruction[] {
  const computeBudgetProgramId = new PublicKey(COMPUTE_BUDGET_PROGRAM_ID);

  return instructions.filter((instruction) => {
    // Keep instruction only if it's NOT from the Compute Budget program
    const isComputeBudget = instruction.programId.equals(computeBudgetProgramId);

    if (isComputeBudget) {
      console.log('Filtered out compute budget instruction (Kora will handle this)');
    }

    return !isComputeBudget;
  });
}


// Step 5: Fetch Address Lookup Tables

// Jupiter uses Address Lookup Tables (ALTs) to fit more accounts
// in a single transaction, We need to fetch the actual table data so LazorKit can build the versioned transaction

export async function fetchAddressLookupTables(
  addresses: string[]
): Promise<AddressLookupTableAccount[]> {
  if (addresses.length === 0) return [];

  const lookupTableAccounts: AddressLookupTableAccount[] = [];

  for (const address of addresses) {
    const pubkey = new PublicKey(address);
    const response = await connection.getAddressLookupTable(pubkey);

    if (response.value) {
      lookupTableAccounts.push(response.value);
    }
  }

  return lookupTableAccounts;
}

// Step 6: Prepare swap for LazorKit

// This combines all the steps:
// - Get quote
// - Get instructions
// - Deserialize them
// - Filter compute budget (for Kora)
// - Fetch lookup tables

// Returns everything LazorKit's signAndSendTransaction needs
export async function prepareSwap(
  inputMint: string,
  outputMint: string,
  amountInSmallestUnit: string,
  userPublicKey: PublicKey,
  slippageBps?: number
): Promise<{
  quote: QuoteResponse;
  instructions: TransactionInstruction[];
  addressLookupTableAccounts: AddressLookupTableAccount[];
}> {
  // Step 1: Get quote
  console.log('Getting quote from Jupiter...');
  const quote = await getQuote(inputMint, outputMint, amountInSmallestUnit, slippageBps);
  console.log(`Quote received: ${quote.inAmount} → ${quote.outAmount}`);

  // Step 2: Get swap instructions
  console.log('Getting swap instructions...');
  const swapInstructions = await getSwapInstructions(quote, userPublicKey);

  // Step 3: Deserialize all instructions
  const allInstructions: TransactionInstruction[] = [];

  // Setup instructions (create token accounts if needed)
  for (const ix of swapInstructions.setupInstructions) {
    allInstructions.push(deserializeInstruction(ix));
  }

  // The main swap instruction
  allInstructions.push(deserializeInstruction(swapInstructions.swapInstruction));

  // Cleanup instruction (unwrap SOL if needed)
  if (swapInstructions.cleanupInstruction) {
    allInstructions.push(deserializeInstruction(swapInstructions.cleanupInstruction));
  }

  // Step 4: Filter out compute budget instructions (CRITICAL for Kora)
  console.log('Filtering compute budget instructions for Kora compatibility...');
  const filteredInstructions = filterComputeBudgetInstructions(allInstructions);
  console.log(`Instructions: ${allInstructions.length} total, ${filteredInstructions.length} after filtering`);

  // Step 5: Fetch Address Lookup Tables
  console.log('Fetching address lookup tables...');
  const addressLookupTableAccounts = await fetchAddressLookupTables(
    swapInstructions.addressLookupTableAddresses
  );
  console.log(`Fetched ${addressLookupTableAccounts.length} lookup tables`);

  return {
    quote,
    instructions: filteredInstructions,
    addressLookupTableAccounts,
  };
}

// Format route path for display (e.g., "SOL → USDC via Raydium")
export function formatRoutePath(quote: QuoteResponse): string {
  if (!quote.routePlan || quote.routePlan.length === 0) return 'Direct swap';
  const dexes = quote.routePlan.map(r => r.swapInfo.label).join(' → ');
  return `via ${dexes}`;
}

// Check if quote is still valid (not expired)
export function isQuoteValid(quoteTimestamp: number, maxAgeMs: number = 30000): boolean {
  return Date.now() - quoteTimestamp < maxAgeMs;
}
