# Tutorial 3: Jupiter Gasless Swaps

This tutorial covers integrating Jupiter swap aggregator with LazorKit's gasless infrastructure. We use an unconventional approach to combine best-price swaps with zero gas fees.

## The Challenge

Jupiter has two APIs:
- **Ultra API** - Returns a serialized transaction blob
- **Swap API** - Can return raw instructions

LazorKit's `signAndSendTransaction` expects an array of instructions, not a transaction blob. Jupiter Ultra doesn't fit this model.

**Solution:** Use Jupiter's `/swap-instructions` endpoint to get raw instructions, then pass them through LazorKit's gasless flow.

## Architecture

```
1. Jupiter /quote
   - Get best price and route

2. Jupiter /swap-instructions
   - Get raw instructions (not serialized tx)

3. Filter compute budget instructions
   - Remove Jupiter's compute budget (Kora handles this)

4. LazorKit signAndSendTransaction
   - User signs with passkey
   - Kora paymaster sponsors gas

5. Transaction lands on Solana
   - User gets swapped tokens, paid $0 gas
```

## Prerequisites

- Completed [Tutorial 1](./tutorial-1-passkey-wallet.md) and [Tutorial 2](./tutorial-2-gasless-transactions.md)
- Jupiter API key from [portal.jup.ag](https://portal.jup.ag) (free tier: 60 req/min)

## Step 1: Add Jupiter Constants

Update `src/constants/index.ts`:

```typescript
// Jupiter Swap API (not Ultra - we need /swap-instructions for LazorKit compatibility)
export const JUPITER_API_URL = 'https://api.jup.ag';
export const JUPITER_API_KEY = 'YOUR_JUPITER_API_KEY';

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
```

## Step 2: Create Jupiter Utility Functions

Create `src/utils/jupiter.ts`:

### 2.1 Types

```typescript
import { PublicKey, TransactionInstruction, AddressLookupTableAccount, Connection } from '@solana/web3.js';

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
```

### 2.2 Get Quote

```typescript
export async function getQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
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
```

### 2.3 Get Swap Instructions

```typescript
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
        wrapAndUnwrapSol: true,
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
```

### 2.4 Deserialize Instructions

Jupiter returns instructions in JSON format. We need to convert them to Solana's `TransactionInstruction`:

```typescript
export function deserializeInstruction(instruction: JupiterInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: Buffer.from(instruction.data, 'base64'),
  });
}
```

### 2.5 Filter Compute Budget Instructions (Critical)

This is the most important part for Kora compatibility:

```typescript
export function filterComputeBudgetInstructions(
  instructions: TransactionInstruction[]
): TransactionInstruction[] {
  const computeBudgetProgramId = new PublicKey(COMPUTE_BUDGET_PROGRAM_ID);

  return instructions.filter((instruction) => {
    const isComputeBudget = instruction.programId.equals(computeBudgetProgramId);

    if (isComputeBudget) {
      console.log('Filtered out compute budget instruction (Kora will handle this)');
    }

    return !isComputeBudget;
  });
}
```

**Why filter compute budget?**

Jupiter adds `ComputeBudgetProgram` instructions to set priority fees. Kora paymaster also adds its own compute budget settings. Having both causes conflicts:

```
Without filtering:
- Jupiter's ComputeBudget (priority fee = X)
- Kora's ComputeBudget (priority fee = Y)
- Swap instructions
Result: CONFLICT - Transaction fails
```

```
With filtering:
- Kora's ComputeBudget (handles fees)
- Swap instructions
Result: Clean execution
```

### 2.6 Fetch Address Lookup Tables

```typescript
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
```

### 2.7 Main Function: Prepare Swap

```typescript
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
  const quote = await getQuote(inputMint, outputMint, amountInSmallestUnit, slippageBps);

  // Step 2: Get swap instructions
  const swapInstructions = await getSwapInstructions(quote, userPublicKey);

  // Step 3: Deserialize all instructions
  const allInstructions: TransactionInstruction[] = [];

  for (const ix of swapInstructions.setupInstructions) {
    allInstructions.push(deserializeInstruction(ix));
  }

  allInstructions.push(deserializeInstruction(swapInstructions.swapInstruction));

  if (swapInstructions.cleanupInstruction) {
    allInstructions.push(deserializeInstruction(swapInstructions.cleanupInstruction));
  }

  // Step 4: Filter compute budget (CRITICAL)
  const filteredInstructions = filterComputeBudgetInstructions(allInstructions);

  // Step 5: Fetch Address Lookup Tables
  const addressLookupTableAccounts = await fetchAddressLookupTables(
    swapInstructions.addressLookupTableAddresses
  );

  return {
    quote,
    instructions: filteredInstructions,
    addressLookupTableAccounts,
  };
}
```

## Step 3: Execute Swap with LazorKit

```typescript
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { prepareSwap } from '../utils/jupiter';
import { SOL_MINT, USDC_MINT, TOKEN_DECIMALS } from '../constants';

const { smartWalletPubkey, signAndSendTransaction } = useWallet();

async function executeSwap(amount: string) {
  // Convert to smallest unit (lamports)
  const amountInLamports = Math.floor(
    parseFloat(amount) * Math.pow(10, TOKEN_DECIMALS.SOL)
  ).toString();

  // Prepare swap (includes compute budget filtering)
  const { quote, instructions, addressLookupTableAccounts } = await prepareSwap(
    SOL_MINT,
    USDC_MINT,
    amountInLamports,
    smartWalletPubkey
  );

  // Execute via LazorKit - Kora handles gas
  const signature = await signAndSendTransaction(
    {
      instructions,
      transactionOptions: {
        addressLookupTableAccounts,
        clusterSimulation: 'mainnet',
        // No feeToken = gasless (Kora sponsors)
      },
    },
    {
      redirectUrl: Linking.createURL('swap-callback'),
      onSuccess: () => console.log('Swap complete'),
      onFail: (error) => console.error('Swap failed:', error),
    }
  );

  return signature;
}
```

## Why This Approach?

### The Problem

Jupiter Ultra API flow:
```
/order -> transaction blob -> sign -> /execute (back to Jupiter)
```

LazorKit flow:
```
instructions[] -> signAndSendTransaction -> Kora -> blockchain
```

These don't match. Ultra gives a blob, LazorKit needs instructions.

### The Solution

Jupiter Swap API's `/swap-instructions` returns raw instructions:
```
/quote -> /swap-instructions -> deserialize -> filter -> LazorKit
```

This gives us:
- **Jupiter's liquidity** - Best prices across all DEXes
- **LazorKit's auth** - Passkey signing (no seed phrase)
- **Kora's sponsorship** - Zero gas fees

## Key Takeaways

1. **Use `/swap-instructions`** - Not Ultra, not `/swap`. We need raw instructions.

2. **Always filter compute budget** - Jupiter and Kora both add these. Remove Jupiter's.

3. **Fetch lookup tables** - Jupiter swaps use ALTs for complex routes.

4. **Pass `addressLookupTableAccounts`** - LazorKit needs these for versioned transactions.

## Troubleshooting

### Transaction too large
- Complex routes may exceed size limits
- Try reducing `maxAccounts` in quote params

### Compute budget conflict
- Ensure `filterComputeBudgetInstructions` is called
- Check that no compute budget instructions remain

### Quote expired
- Quotes are time-sensitive
- Increase slippage or reduce time between quote and execution

### Insufficient balance
- Check wallet has enough input token
- Remember: gas is free, but you need the swap amount

## Next Steps

- [Tutorial 1: Creating a Passkey Wallet](./tutorial-1-passkey-wallet.md)
- [Tutorial 2: Gasless Transactions](./tutorial-2-gasless-transactions.md)
