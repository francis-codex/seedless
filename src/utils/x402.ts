// X402 payment handling for HTTP 402 paywalled content
// Implements the client side of the X402 protocol on Solana

import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { USDC_MINT, SOLANA_RPC_URL } from '../constants';

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

// Simulate a 402 paywall server response (for demo purposes)
// In production, this comes from actual X402-enabled servers
export function simulatePaywallResponse(): X402Response {
    return {
        status: 402,
        requirements: {
            scheme: 'exact',
            network: 'solana',
            maxAmountRequired: '0.001',
            resource: '/api/premium-content',
            description: 'Premium article access',
            payTo: 'GkXn6PUbcvpwAzVAP16bLjpMvjYXGsmQJwY1bL5X8VTr', // Demo address
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
        title: 'Understanding Zero-Knowledge Proofs',
        preview: 'Learn the fundamentals of ZK technology that powers private transactions...',
        price: '0.001',
        asset: 'SOL',
        isPaid: false,
        fullContent: `Zero-Knowledge Proofs (ZKPs) are cryptographic methods that allow one party to prove they know a value without revealing the value itself.

Key concepts:
1. Completeness - If the statement is true, an honest prover can convince the verifier
2. Soundness - A dishonest prover cannot convince the verifier of a false statement
3. Zero-Knowledge - The verifier learns nothing beyond the truth of the statement

Applications include:
- Private transactions (Zcash, Tornado Cash)
- Identity verification without data exposure
- Scalability solutions (ZK-rollups)

This technology is fundamental to blockchain privacy and scaling.`,
    },
    {
        id: '2',
        title: 'MEV Protection Strategies',
        preview: 'Protect your trades from front-running and sandwich attacks...',
        price: '0.002',
        asset: 'SOL',
        isPaid: false,
        fullContent: `MEV (Maximal Extractable Value) represents profits that validators/searchers extract by reordering transactions.

Common MEV attacks:
1. Front-running - Placing orders before yours
2. Sandwich attacks - Buying before and selling after your trade
3. Liquidation sniping - Racing to liquidate undercollateralized positions

Protection strategies:
- Use private mempools (Flashbots on ETH, Jito on Solana)
- Set tight slippage limits
- Use DEX aggregators with MEV protection
- Time transactions during low activity

On Solana, Jito provides MEV protection through their block engine.`,
    },
    {
        id: '3',
        title: 'Smart Wallet Architecture Deep Dive',
        preview: 'How passkey wallets work under the hood...',
        price: '0.0015',
        asset: 'SOL',
        isPaid: false,
        fullContent: `Smart wallets like LazorKit use Program Derived Addresses (PDAs) instead of traditional keypairs.

Architecture breakdown:
1. PDA Generation - Deterministically derived from passkey credential
2. Authentication - WebAuthn signature verification on-chain
3. Transaction Flow - User signs with biometrics, signature verified by program

Benefits:
- No seed phrase to manage
- Hardware-level security via Secure Enclave
- Account recovery through device management
- Programmable spending limits

The passkey never leaves the device, and the private key is protected by the device's secure hardware.`,
    },
];

// Testing limits
export const X402_LIMITS = {
    MAX_PAYMENT_SOL: 0.01,
    MAX_PAYMENT_USDC: 1,
} as const;
