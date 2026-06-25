import {
  getRpcAccountInfoProvider,
  getUmbraClient,
  getPollingComputationMonitor,
  getPollingTransactionForwarder,
} from '@umbra-privacy/sdk';
import type { IUmbraSigner } from '@umbra-privacy/sdk';
import type { GetUmbraClientArgs, GetUmbraClientDeps } from '@umbra-privacy/sdk/client';
import {
  SOLANA_RPC_URL,
  SOLANA_WSS_URL,
  UMBRA_INDEXER_URL,
} from '../constants';

const USE_DEVNET = SOLANA_RPC_URL.includes('devnet');
const NETWORK: GetUmbraClientArgs['network'] = USE_DEVNET ? 'devnet' : 'mainnet';

export interface UmbraClientArgs {
  signer: IUmbraSigner;
  masterSeedStorage?: GetUmbraClientDeps['masterSeedStorage'];
}

export async function buildUmbraClient({ signer, masterSeedStorage }: UmbraClientArgs) {
  // accountInfoProvider tracks the global SOLANA_RPC_URL — devnet defaults to
  // public devnet (constants/index.ts), which supports the read methods that
  // Helius free devnet blocks. Mainnet uses Helius (paid plan, no gating).
  const accountInfoProvider = getRpcAccountInfoProvider({ rpcUrl: SOLANA_RPC_URL });

  // Override the SDK's WebSocket-based forwarder + monitor with HTTP polling.
  // RN's WebSocket implementation drops the SDK's long subscriptions on mobile,
  // surfacing as "WebSocket subscription failed" mid-deposit/withdraw. Polling
  // is slower per call but reliable on cellular + flaky wifi.
  const transactionForwarder = getPollingTransactionForwarder({ rpcUrl: SOLANA_RPC_URL });
  const computationMonitor = getPollingComputationMonitor({ rpcUrl: SOLANA_RPC_URL });

  return getUmbraClient(
    {
      signer,
      network: NETWORK,
      rpcUrl: SOLANA_RPC_URL,
      rpcSubscriptionsUrl: SOLANA_WSS_URL,
      indexerApiEndpoint: UMBRA_INDEXER_URL,
    },
    {
      accountInfoProvider,
      transactionForwarder,
      computationMonitor,
      ...(masterSeedStorage ? { masterSeedStorage } : {}),
    },
  );
}
