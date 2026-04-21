// Deferred-execute helper for payloads that exceed the single-tx passkey path.
// LazorKit v2 supports a 2-tx authorize-then-execute flow for payloads larger
// than ~574 bytes (e.g., Jupiter multi-hop swaps with many accounts). Rather
// than guessing at call sites, route anything above the threshold through
// `authorizeAndExecute` with a short expiry window.

import { TransactionInstruction } from '@solana/web3.js';

// Empirical single-tx size ceiling for the passkey-signed path.
export const DEFERRED_EXEC_THRESHOLD_BYTES = 574;

// ~400ms per slot; 450 slots ≈ 3 minutes — long enough for the portal round
// trip, short enough to fail closed if the authorization is not consumed.
export const DEFAULT_AUTH_EXPIRY_SLOTS = 450;

export interface DeferredExecPayload {
    instructions: TransactionInstruction[];
    expiryOffset: number;
    transactionOptions?: {
        clusterSimulation?: 'devnet' | 'mainnet';
        feeToken?: string;
    };
}

export function buildDeferredExecPayload(
    instructions: TransactionInstruction[],
    options: DeferredExecPayload['transactionOptions'] = {},
    expiryOffset: number = DEFAULT_AUTH_EXPIRY_SLOTS,
): DeferredExecPayload {
    return {
        instructions,
        expiryOffset,
        transactionOptions: options,
    };
}

// Rough estimate: per-instruction overhead plus raw data bytes. Account keys
// and signatures dominate the real tx size, but this heuristic is good enough
// to decide when to branch — the SDK will reject anything that slips past.
export function estimateInstructionSize(instructions: TransactionInstruction[]): number {
    let total = 64; // signatures + message header baseline
    for (const ix of instructions) {
        total += 32; // program id
        total += ix.keys.length * 33; // pubkey + meta byte
        total += ix.data.length;
        total += 2; // length prefixes
    }
    return total;
}

export function shouldUseDeferredExec(instructions: TransactionInstruction[]): boolean {
    return estimateInstructionSize(instructions) > DEFERRED_EXEC_THRESHOLD_BYTES;
}
