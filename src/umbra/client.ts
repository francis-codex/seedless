import { getUmbraClient } from '@umbra-privacy/sdk';
import type { IUmbraSigner } from '@umbra-privacy/sdk/interfaces';
import type { GetUmbraClientArgs, GetUmbraClientDeps } from '@umbra-privacy/sdk';
import {
  SOLANA_RPC_URL,
  UMBRA_INDEXER_URL,
} from '../constants';

const USE_DEVNET = SOLANA_RPC_URL.includes('devnet');
const NETWORK: GetUmbraClientArgs['network'] = USE_DEVNET ? 'devnet' : 'mainnet';

const RPC_SUBSCRIPTIONS_URL = SOLANA_RPC_URL.replace(/^https:\/\//, 'wss://');

export interface UmbraClientArgs {
  signer: IUmbraSigner;
  masterSeedStorage?: GetUmbraClientDeps['masterSeedStorage'];
}

export async function buildUmbraClient({ signer, masterSeedStorage }: UmbraClientArgs) {
  return getUmbraClient(
    {
      signer,
      network: NETWORK,
      rpcUrl: SOLANA_RPC_URL,
      rpcSubscriptionsUrl: RPC_SUBSCRIPTIONS_URL,
      indexerApiEndpoint: UMBRA_INDEXER_URL,
    },
    masterSeedStorage ? { masterSeedStorage } : undefined,
  );
}
