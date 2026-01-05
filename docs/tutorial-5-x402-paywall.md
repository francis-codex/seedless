# Tutorial 5: X402 Paywall Integration

This tutorial covers implementing an X402 pay-per-view content paywall using LazorKit's gasless transactions. Users pay micropayments to unlock premium content with one-tap passkey authentication.

## Prerequisites

- Completed Tutorial 1 (passkey wallet setup)
- Completed Tutorial 2 (gasless transactions)
- Understanding of HTTP status codes

## What You'll Build

A demo screen where users browse premium articles, pay to unlock them with their passkey wallet, and access the content instantly. All payments are gasless through Kora paymaster.

## What is X402?

X402 is an HTTP-native micropayment protocol using the 402 "Payment Required" status code:

```
1. Client requests protected resource
2. Server responds: 402 Payment Required + payment requirements
3. Client makes payment on Solana
4. Client retries with X-PAYMENT header (proof of payment)
5. Server verifies payment, returns content
```

**Why X402 on Solana?**
- ~$0.00025 transaction fees (true micropayments)
- 400ms finality (instant access)
- LazorKit makes it gasless for users

## Step 1: Create X402 Utilities

Create `src/utils/x402.ts`:

### Types

```typescript
export interface PaymentRequirements {
  scheme: 'exact' | 'upto';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description?: string;
  payTo: string;
  asset?: string;
}

export interface PaymentProof {
  signature: string;
  network: string;
  payload: {
    amount: string;
    payTo: string;
    asset: string;
    timestamp: number;
  };
}
```

### Parse Payment Requirements

```typescript
export function parsePaymentRequired(headers: Headers, body: any): PaymentRequirements | null {
  if (body && body.payTo && body.maxAmountRequired) {
    return {
      scheme: body.scheme || 'exact',
      network: body.network || 'solana',
      maxAmountRequired: body.maxAmountRequired,
      resource: body.resource || '',
      payTo: body.payTo,
      asset: body.asset || 'SOL',
    };
  }
  return null;
}
```

### Create Payment Instruction

```typescript
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

export function createPaymentInstruction(
  fromPubkey: PublicKey,
  requirements: PaymentRequirements
) {
  const toPubkey = new PublicKey(requirements.payTo);
  const amount = parseFloat(requirements.maxAmountRequired);
  const lamports = Math.ceil(amount * LAMPORTS_PER_SOL);

  return SystemProgram.transfer({
    fromPubkey,
    toPubkey,
    lamports,
  });
}
```

## Step 2: Handle 402 Response

When a server returns 402, show a payment modal and process payment:

```typescript
async function handlePaywallResponse(res: Response) {
  if (res.status !== 402) return null;

  const body = await res.json();
  const requirements = parsePaymentRequired(res.headers, body);

  if (!requirements) {
    throw new Error('Invalid payment requirements');
  }

  // Show payment UI to user
  // User confirms payment
  // Execute via LazorKit
  return requirements;
}
```

## Step 3: Pay with LazorKit

```typescript
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import * as Linking from 'expo-linking';

const { smartWalletPubkey, signAndSendTransaction } = useWallet();

async function payForContent(requirements: PaymentRequirements) {
  const paymentInstruction = createPaymentInstruction(
    smartWalletPubkey,
    requirements
  );

  const redirectUrl = Linking.createURL('paywall-callback');

  const signature = await signAndSendTransaction(
    {
      instructions: [paymentInstruction],
      transactionOptions: {
        clusterSimulation: 'mainnet',
        // Gasless - paymaster sponsors
      },
    },
    {
      redirectUrl,
      onSuccess: () => {
        console.log('Payment complete');
      },
      onFail: (error) => {
        console.error('Payment failed:', error);
      },
    }
  );

  return signature;
}
```

## Step 4: Retry with Payment Proof

After payment, retry the original request with proof:

```typescript
export function createPaymentHeader(proof: PaymentProof): string {
  return Buffer.from(JSON.stringify(proof)).toString('base64');
}

async function accessContent(url: string, signature: string) {
  const proof: PaymentProof = {
    signature,
    network: 'solana',
    payload: {
      amount: '0.001',
      payTo: 'RECIPIENT_ADDRESS',
      asset: 'SOL',
      timestamp: Date.now(),
    },
  };

  const response = await fetch(url, {
    headers: {
      'X-PAYMENT': createPaymentHeader(proof),
    },
  });

  return response.json();
}
```

## Step 5: Build the UI

The PaywallScreen shows:
1. List of premium content with prices
2. Payment modal when user taps locked content
3. Full content view after payment

Key UI elements:

```typescript
// Content card
<TouchableOpacity onPress={() => handleContentPress(item)}>
  <Text>{item.title}</Text>
  {item.isPaid ? (
    <Badge>Unlocked</Badge>
  ) : (
    <Badge>{item.price} SOL</Badge>
  )}
  <Text>{item.preview}</Text>
</TouchableOpacity>

// Payment modal
<Modal visible={showPaymentModal}>
  <Text>Unlock: {selectedItem.title}</Text>
  <Text>Price: {selectedItem.price} SOL</Text>
  <Button onPress={handlePay}>Pay with Passkey</Button>
</Modal>
```

## Complete Flow

```
┌─────────────────────────────────────────────┐
│  User taps locked article                   │
├─────────────────────────────────────────────│
│  Payment modal appears                      │
│  "Unlock for 0.001 SOL"                     │
├─────────────────────────────────────────────│
│  User taps "Pay with Passkey"               │
├─────────────────────────────────────────────│
│  LazorKit opens → passkey auth              │
│  (Kora sponsors gas)                        │
├─────────────────────────────────────────────│
│  Payment confirmed on Solana                │
├─────────────────────────────────────────────│
│  Content unlocked instantly                 │
└─────────────────────────────────────────────┘
```

## Testing Limits

For safety during testing:

```typescript
export const X402_LIMITS = {
  MAX_PAYMENT_SOL: 0.01,
  MAX_PAYMENT_USDC: 1,
} as const;
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid payment requirements" | Server didn't return proper 402 | Check server implementation |
| "Payment failed" | Transaction rejected | Check wallet balance |
| "Signing cancelled" | User cancelled biometric | Show retry button |

## Key Takeaways

1. **X402 is just HTTP** - 402 status + JSON requirements + X-PAYMENT header
2. **LazorKit makes it gasless** - Users don't need SOL for fees
3. **Passkey = one-tap** - Biometric auth, no seed phrases
4. **Micropayments work** - Solana's low fees enable pay-per-article

## Next Steps

- [Tutorial 1: Creating a Passkey Wallet](./tutorial-1-passkey-wallet.md)
- [Tutorial 2: Gasless Transactions](./tutorial-2-gasless-transactions.md)
- [Tutorial 3: Jupiter Gasless Swaps](./tutorial-3-jupiter-gasless-swaps.md)
- [Tutorial 4: Privacy Features](./tutorial-4-privacy-features.md)
