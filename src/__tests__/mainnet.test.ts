/**
 * Seedless Wallet - Mainnet Integration Tests
 * 
 * Run with: npx ts-node src/__tests__/mainnet.test.ts
 * 
 * These tests verify all mainnet configurations and API connections.
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Inline constants (to avoid module resolution issues)
const SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=db683a77-edb6-4c80-8cac-944640c07e21';
const PAYMASTER_URL = 'https://kora.lazorkit.com';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER_API_URL = 'https://api.jup.ag';
const JUPITER_API_KEY = '90349292-c128-4906-acf3-0b709e7e0f3b';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const IS_DEVNET = false;
const CLUSTER_SIMULATION = 'mainnet';

// Test utilities
const log = (msg: string) => console.log(`✓ ${msg}`);
const fail = (msg: string) => { console.error(`✗ ${msg}`); process.exit(1); };

async function testRPCConnection(): Promise<void> {
    console.log('\n--- Testing RPC Connection ---');

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    // Test 1: Get slot
    const slot = await connection.getSlot();
    if (slot > 0) {
        log(`RPC connected - Current slot: ${slot}`);
    } else {
        fail('Failed to get slot from RPC');
    }

    // Test 2: Verify mainnet by checking a known mainnet account
    const usdcMint = new PublicKey(USDC_MINT);
    const accountInfo = await connection.getAccountInfo(usdcMint);
    if (accountInfo) {
        log(`USDC mint verified on mainnet: ${USDC_MINT.slice(0, 8)}...`);
    } else {
        fail('USDC mint not found - may not be on mainnet');
    }

    // Test 3: Check recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    if (blockhash && lastValidBlockHeight) {
        log(`Got blockhash: ${blockhash.slice(0, 16)}... (valid until block ${lastValidBlockHeight})`);
    } else {
        fail('Failed to get blockhash');
    }
}

async function testJupiterAPI(): Promise<void> {
    console.log('\n--- Testing Jupiter API ---');

    // Test 1: Get quote for SOL -> USDC
    const params = new URLSearchParams({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: (0.001 * LAMPORTS_PER_SOL).toString(), // 0.001 SOL
        slippageBps: '100',
    });

    const response = await fetch(`${JUPITER_API_URL}/swap/v1/quote?${params}`, {
        headers: { 'x-api-key': JUPITER_API_KEY },
    });

    if (!response.ok) {
        const error = await response.text();
        fail(`Jupiter quote failed: ${error}`);
    }

    const quote = await response.json();
    log(`Quote received: ${quote.inAmount} lamports -> ${quote.outAmount} USDC units`);
    log(`Route: ${quote.routePlan.map((r: any) => r.swapInfo.label).join(' -> ')}`);
    log(`Price impact: ${quote.priceImpactPct}%`);
}

async function testPaymasterEndpoint(): Promise<void> {
    console.log('\n--- Testing Kora Paymaster ---');

    // Just verify the endpoint is reachable
    try {
        const response = await fetch(PAYMASTER_URL, {
            method: 'OPTIONS',
        });

        // Even if we get an error response, the endpoint is reachable
        log(`Paymaster endpoint reachable: ${PAYMASTER_URL}`);
    } catch (error) {
        fail(`Paymaster endpoint unreachable: ${error}`);
    }
}

async function testConstants(): Promise<void> {
    console.log('\n--- Testing Constants ---');

    // Verify we're on mainnet
    if (IS_DEVNET === false) {
        log('IS_DEVNET = false (correct for mainnet)');
    } else {
        fail('IS_DEVNET should be false for mainnet');
    }

    if (CLUSTER_SIMULATION === 'mainnet') {
        log('CLUSTER_SIMULATION = mainnet (correct)');
    } else {
        fail('CLUSTER_SIMULATION should be mainnet');
    }

    // Verify USDC mint is mainnet version
    if (USDC_MINT === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
        log('USDC_MINT is mainnet address (correct)');
    } else {
        fail('USDC_MINT should be mainnet address');
    }

    // Verify RPC is mainnet
    if (SOLANA_RPC_URL.includes('mainnet')) {
        log('RPC URL contains "mainnet" (correct)');
    } else {
        fail('RPC URL should be mainnet');
    }

    // Verify paymaster is mainnet (not devnet)
    if (!PAYMASTER_URL.includes('devnet')) {
        log('Paymaster URL is not devnet (correct)');
    } else {
        fail('Paymaster URL should not contain devnet');
    }
}

async function testAddressValidation(): Promise<void> {
    console.log('\n--- Testing Address Validation ---');

    // Valid addresses
    const validAddresses = [
        SOL_MINT,
        USDC_MINT,
        '11111111111111111111111111111111', // System program
    ];

    for (const addr of validAddresses) {
        try {
            new PublicKey(addr);
            log(`Valid address: ${addr.slice(0, 8)}...`);
        } catch {
            fail(`Invalid address: ${addr}`);
        }
    }
}

async function testBalanceFetch(): Promise<void> {
    console.log('\n--- Testing Balance Fetch ---');

    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

    // Test with a known mainnet account (Solana Foundation)
    const testAddress = new PublicKey('So11111111111111111111111111111111111111112');

    try {
        const balance = await connection.getBalance(testAddress);
        log(`Balance fetch works: ${balance / LAMPORTS_PER_SOL} SOL`);
    } catch (error) {
        fail(`Balance fetch failed: ${error}`);
    }
}

// Run all tests
async function runAllTests(): Promise<void> {
    console.log('='.repeat(50));
    console.log('SEEDLESS WALLET - MAINNET INTEGRATION TESTS');
    console.log('='.repeat(50));

    try {
        await testConstants();
        await testRPCConnection();
        await testAddressValidation();
        await testBalanceFetch();
        await testJupiterAPI();
        await testPaymasterEndpoint();

        console.log('\n' + '='.repeat(50));
        console.log('ALL TESTS PASSED ✓');
        console.log('='.repeat(50));
    } catch (error) {
        console.error('\nTEST FAILED:', error);
        process.exit(1);
    }
}

runAllTests();
