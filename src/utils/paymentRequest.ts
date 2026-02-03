// Solana Pay URL generation and parsing
// Spec: https://docs.solanapay.com/spec

import { PublicKey } from '@solana/web3.js';
import { USDC_MINT } from '../constants';
import { STEALTH_LIMITS } from './stealth';

export type PaymentToken = 'SOL' | 'USDC';

export interface PaymentRequestConfig {
    recipient: string;
    amount?: number;
    token?: PaymentToken;
    label?: string;
    message?: string;
    memo?: string;
}

export interface ParsedPaymentRequest {
    recipient: string;
    amount?: number;
    token: PaymentToken;
    splTokenMint?: string;
    label?: string;
    message?: string;
    memo?: string;
}

function getTokenMint(token: PaymentToken): string | null {
    if (token === 'USDC') return USDC_MINT;
    return null;
}

function getMaxAmount(token: PaymentToken): number {
    return token === 'SOL'
        ? STEALTH_LIMITS.MAX_REQUEST_SOL
        : STEALTH_LIMITS.MAX_REQUEST_USDC;
}

function clampAmount(amount: number | undefined, token: PaymentToken): number | undefined {
    if (amount === undefined) return undefined;

    const max = getMaxAmount(token);
    if (amount > max) {
        console.warn(`Amount ${amount} exceeds limit ${max} for ${token}`);
        return max;
    }
    return amount;
}

// Build a Solana Pay URL: solana:<recipient>?amount=X&spl-token=Y&label=Z
export function createSolanaPayUrl(config: PaymentRequestConfig): string {
    const { recipient, label, message, memo } = config;
    const token = config.token || 'SOL';
    const amount = clampAmount(config.amount, token);

    try {
        new PublicKey(recipient);
    } catch {
        throw new Error('Invalid recipient address');
    }

    let url = `solana:${recipient}`;
    const params: string[] = [];

    if (amount !== undefined && amount > 0) {
        params.push(`amount=${amount}`);
    }

    const mint = getTokenMint(token);
    if (mint) {
        params.push(`spl-token=${mint}`);
    }

    if (label) params.push(`label=${encodeURIComponent(label)}`);
    if (message) params.push(`message=${encodeURIComponent(message)}`);
    if (memo) params.push(`memo=${encodeURIComponent(memo)}`);

    if (params.length > 0) {
        url += '?' + params.join('&');
    }

    return url;
}

// Parse a Solana Pay URL back into components
export function parseSolanaPayUrl(url: string): ParsedPaymentRequest | null {
    try {
        if (!url.startsWith('solana:')) return null;

        const withoutScheme = url.slice(7);
        const [recipientPart, queryString] = withoutScheme.split('?');

        try {
            new PublicKey(recipientPart);
        } catch {
            return null;
        }

        const result: ParsedPaymentRequest = {
            recipient: recipientPart,
            token: 'SOL',
        };

        if (queryString) {
            const params = new URLSearchParams(queryString);

            const amountStr = params.get('amount');
            if (amountStr) {
                const amount = parseFloat(amountStr);
                if (!isNaN(amount) && amount > 0) {
                    result.amount = amount;
                }
            }

            const splToken = params.get('spl-token');
            if (splToken) {
                result.splTokenMint = splToken;
                if (splToken === USDC_MINT) {
                    result.token = 'USDC';
                }
            }

            const label = params.get('label');
            if (label) result.label = decodeURIComponent(label);

            const message = params.get('message');
            if (message) result.message = decodeURIComponent(message);

            const memo = params.get('memo');
            if (memo) result.memo = decodeURIComponent(memo);
        }

        return result;
    } catch {
        return null;
    }
}

export function formatPaymentRequest(request: ParsedPaymentRequest): string {
    const parts: string[] = [];

    if (request.amount) {
        parts.push(`${request.amount} ${request.token}`);
    } else {
        parts.push(`Any amount of ${request.token}`);
    }

    if (request.label) parts.push(`to ${request.label}`);
    if (request.message) parts.push(`- "${request.message}"`);

    return parts.join(' ');
}

export function shortenAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function isAmountWithinLimits(amount: number, token: PaymentToken): boolean {
    return amount <= getMaxAmount(token);
}

export function getPaymentLimit(token: PaymentToken): number {
    return getMaxAmount(token);
}

// Validate Solana Pay URL format
export function isValidSolanaPayUrl(url: string): boolean {
    return parseSolanaPayUrl(url) !== null;
}

// Payment request status for UI
export type PaymentRequestStatus = 'idle' | 'generating' | 'ready' | 'scanned' | 'completed' | 'expired';

// Payment request expiration (5 minutes default)
export const PAYMENT_REQUEST_TTL_MS = 5 * 60 * 1000;

// Check if a payment request has expired
export function isPaymentExpired(createdAt: number): boolean {
  return Date.now() - createdAt > PAYMENT_REQUEST_TTL_MS;
}

// Get remaining time for a payment request in seconds
export function getPaymentTimeRemaining(createdAt: number): number {
  const elapsed = Date.now() - createdAt;
  const remaining = PAYMENT_REQUEST_TTL_MS - elapsed;
  return Math.max(0, Math.floor(remaining / 1000));
}

// Format remaining time for display (e.g., "4:32")
export function formatTimeRemaining(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
