// Foreign-chain registry for the Ika integration. Sepolia is the primary
// demo chain — most legible to a hackathon judge and has a reliable public
// RPC. Bitcoin testnet is wired up but UI-gated as nice-to-have.

import type { ChainConfig, ChainId } from './types';

export const CHAINS: Record<ChainId, ChainConfig> = {
  sepolia: {
    id: 'sepolia',
    label: 'Ethereum (Sepolia)',
    curve: 'secp256k1',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorerTxBase: 'https://sepolia.etherscan.io/tx/',
    explorerAddrBase: 'https://sepolia.etherscan.io/address/',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
  },
  'bitcoin-testnet': {
    id: 'bitcoin-testnet',
    label: 'Bitcoin (testnet)',
    curve: 'secp256k1',
    rpcUrl: 'https://mempool.space/testnet/api',
    explorerTxBase: 'https://mempool.space/testnet/tx/',
    explorerAddrBase: 'https://mempool.space/testnet/address/',
    nativeSymbol: 'tBTC',
    nativeDecimals: 8,
  },
};

export function getChain(id: ChainId): ChainConfig {
  const c = CHAINS[id];
  if (!c) throw new Error(`Unknown chain id: ${id}`);
  return c;
}

export const SUPPORTED_DEMO_CHAINS: ChainId[] = ['sepolia'];
