// X402 payment handling for HTTP 402 paywalled content
// Implements the client side of the X402 protocol on Solana

import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Types matching X402 protocol spec
export interface PaymentRequirements {
    scheme: 'exact' | 'upto';
    network: string;
    maxAmountRequired: string;
    resource: string;
    description?: string;
    mimeType?: string;
    payTo: string;
    maxTimeoutSeconds?: number;
    asset?: string;
    extra?: Record<string, unknown>;
}

export interface X402Response {
    status: 402;
    requirements: PaymentRequirements;
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

// Parse 402 response to get payment requirements
export function parsePaymentRequired(headers: Headers, body: any): PaymentRequirements | null {
    // X402 sends requirements in response body
    if (body && body.payTo && body.maxAmountRequired) {
        return {
            scheme: body.scheme || 'exact',
            network: body.network || 'solana',
            maxAmountRequired: body.maxAmountRequired,
            resource: body.resource || '',
            description: body.description,
            payTo: body.payTo,
            asset: body.asset || 'SOL',
            extra: body.extra,
        };
    }

    return null;
}

// Convert amount string to lamports/smallest unit
export function parsePaymentAmount(amount: string, asset: string): number {
    const value = parseFloat(amount);
    if (asset === 'SOL') {
        return Math.ceil(value * LAMPORTS_PER_SOL);
    }
    // USDC has 6 decimals
    if (asset === 'USDC') {
        return Math.ceil(value * 1_000_000);
    }
    return Math.ceil(value);
}

// Format amount for display
export function formatPaymentAmount(amount: string, asset: string): string {
    const value = parseFloat(amount);
    if (asset === 'SOL') {
        return `${value.toFixed(6)} SOL`;
    }
    if (asset === 'USDC') {
        return `$${value.toFixed(2)} USDC`;
    }
    return `${value} ${asset}`;
}

// Create SOL transfer instruction for payment
export function createPaymentInstruction(
    fromPubkey: PublicKey,
    requirements: PaymentRequirements
) {
    const toPubkey = new PublicKey(requirements.payTo);
    const lamports = parsePaymentAmount(requirements.maxAmountRequired, requirements.asset || 'SOL');

    return SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports,
    });
}

// Create X-PAYMENT header value
export function createPaymentHeader(proof: PaymentProof): string {
    return Buffer.from(JSON.stringify(proof)).toString('base64');
}

// Simulate a 402 paywall server response (demo only - no real SOL charged)
// In production, this comes from actual X402-enabled servers
export function simulatePaywallResponse(): X402Response {
    return {
        status: 402,
        requirements: {
            scheme: 'exact',
            network: 'solana',
            maxAmountRequired: '0',
            resource: '/api/premium-content',
            description: 'Premium article access (demo - no charge)',
            payTo: '11111111111111111111111111111111', // System program - demo only
            asset: 'SOL',
        },
    };
}

// Demo content items
export interface ContentItem {
    id: string;
    title: string;
    preview: string;
    price: string;
    asset: 'SOL' | 'USDC';
    isPaid: boolean;
    fullContent?: string;
}

export const DEMO_CONTENT: ContentItem[] = [
    {
        id: '1',
        title: 'Tutorial: Passkey Wallet Setup',
        preview: 'Learn how to create a seedless wallet using WebAuthn passkeys and biometric authentication...',
        price: '0.001',
        asset: 'SOL',
        isPaid: false,
        fullContent: `Welcome to Seedless Wallet! This tutorial teaches you how passkey wallets work.

What You'll Learn:
• How WebAuthn passkeys replace seed phrases
• Biometric authentication (Face ID / Touch ID)
• Program Derived Addresses (PDAs) on Solana

Key Concepts:

1. NO SEED PHRASE NEEDED
Traditional wallets require a 12-24 word seed phrase. With passkeys, your device's Secure Enclave generates and stores the private key. You authenticate with biometrics.

2. HOW IT WORKS
• LazorKitProvider wraps your app for wallet functionality
• useWallet() hook provides connect/disconnect methods
• connect() triggers WebAuthn and creates your PDA wallet
• smartWalletPubkey is your Solana address

3. SECURITY
Your passkey never leaves your device. The private key is protected by hardware security (Secure Enclave on iOS, Titan M on Android).

See the full code in: src/screens/HomeScreen.tsx`,
    },
    {
        id: '2',
        title: 'Tutorial: Gasless Transactions',
        preview: 'Send SOL without paying gas fees using the Kora paymaster integration...',
        price: '0.002',
        asset: 'SOL',
        isPaid: false,
        fullContent: `Gas fees are one of the biggest UX hurdles in crypto. This tutorial shows how Seedless Wallet enables gasless transactions.

What You'll Learn:
• How paymasters sponsor transaction fees
• Building and sending gasless transfers
• The complete transaction flow

Key Concepts:

1. PAYMASTER SPONSORSHIP
Kora is LazorKit's paymaster. It pays the Solana network fees on your behalf, so users can send tokens without holding SOL for gas.

2. TRANSACTION FLOW
• Create transfer instruction with SystemProgram.transfer()
• Call signAndSendTransaction() with no feeToken (gasless mode)
• Passkey signs the transaction
• Kora sponsors the fee, transaction is submitted

3. CODE EXAMPLE
const signature = await signAndSendTransaction({
    instructions: [transferInstruction],
    transactionOptions: {
        clusterSimulation: 'devnet',
        // No feeToken = gasless!
    },
}, { redirectUrl, onSuccess, onFail });

See the full code in: src/screens/WalletScreen.tsx`,
    },
    {
        id: '3',
        title: 'Tutorial: Privacy Features',
        preview: 'Stealth addresses and burner wallets for enhanced transaction privacy...',
        price: '0.0015',
        asset: 'SOL',
        isPaid: false,
        fullContent: `Privacy is essential in blockchain. This tutorial covers two privacy features in Seedless Wallet.

What You'll Learn:
• Stealth Addresses for private receiving
• Burner Wallets for isolated sending
• How to implement both in your app

STEALTH ADDRESSES:

Generate one-time receiving addresses that can't be linked to your main wallet. Perfect for:
• Private donations
• Salary payments
• Anonymous purchases

How it works:
1. Master seed stored in SecureStore
2. Each address derived via: hash(seed + index)
3. Funds can be swept back to main wallet

BURNER WALLETS:

Create isolated, disposable wallets for:
• Testing risky dApps
• Anonymous transactions
• Temporary identities

Each burner has its own keypair, completely separate from your passkey wallet. Fund it, use it, destroy it.

See the full code in:
• src/utils/stealth.ts
• src/utils/burner.ts
• src/screens/StealthScreen.tsx
• src/screens/BurnerScreen.tsx`,
    },
];

// Testing limits
export const X402_LIMITS = {
    MAX_PAYMENT_SOL: 0.01,
    MAX_PAYMENT_USDC: 1,
} as const;

// Check if payment amount is within safe limits
export function isPaymentWithinLimits(amount: string, asset: string): boolean {
    const value = parseFloat(amount);
    if (asset === 'SOL') return value <= X402_LIMITS.MAX_PAYMENT_SOL;
    if (asset === 'USDC') return value <= X402_LIMITS.MAX_PAYMENT_USDC;
    return false;
}

// Payment status tracking
export type X402PaymentStatus = 'idle' | 'pending' | 'confirming' | 'success' | 'failed' | 'timeout';
