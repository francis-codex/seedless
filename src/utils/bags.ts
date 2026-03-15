import { BAGS_API_URL, BAGS_API_KEY, SEED_MINT, REQUEST_TIMEOUTS } from '../constants';

// --- Types ---

export interface BagsQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  slippageBps: number;
  minOutAmount: string;
  platformFee?: {
    amount: string;
    feeBps: number;
    mode: string;
  };
  routePlan: Array<{
    venue: string;
    marketKey: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
  }>;
}

export interface BagsSwapTransaction {
  transaction: string; // base64 serialized transaction
  lastValidBlockHeight: number;
}

export interface FeeShareClaimer {
  wallet?: string;
  provider?: string;
  username?: string;
  bps: number;
}

export interface FeeShareConfig {
  tokenMint: string;
  admin: string;
  claimers: FeeShareClaimer[];
}

export interface ClaimablePosition {
  baseMint: string;
  programId: string;
  totalClaimableLamportsUserShare: number;
  virtualPool?: string;
  dammPool?: string;
  isMigrated?: boolean;
  isCustomFeeVault?: boolean;
  userBps?: number;
}

export interface ClaimEvent {
  wallet: string;
  amount: string;
  timestamp: number;
  signature: string;
  isCreator: boolean;
}

// Lifetime fees response is a raw string (lamports), not an object
export type LifetimeFeesResponse = string;

export interface BagsPool {
  tokenMint: string;
  dammV2PoolKey?: string;
  dbcConfigKey?: string;
  dbcPoolKey?: string;
}

export interface PartnerStats {
  claimed: string;
  unclaimed: string;
}

// --- API Helpers ---

async function bagsRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUTS.SWAP);

  try {
    const response = await fetch(`${BAGS_API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BAGS_API_KEY,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Bags API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    if (data.success === false) {
      throw new Error(data.error || 'Bags API request failed');
    }

    return data.response ?? data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Fee Share ---

export async function createFeeShareConfig(
  tokenMint: string,
  admin: string,
  claimers: FeeShareClaimer[]
): Promise<string> {
  // Returns a transaction to sign
  const result = await bagsRequest<{ transaction: string }>('/fee-share/config', {
    method: 'POST',
    body: JSON.stringify({ tokenMint, admin, claimers }),
  });
  return result.transaction;
}

export async function updateFeeShareConfig(
  tokenMint: string,
  admin: string,
  claimers: FeeShareClaimer[]
): Promise<string[]> {
  const result = await bagsRequest<{ transactions: string[] }>('/fee-share/admin/update-config', {
    method: 'POST',
    body: JSON.stringify({ tokenMint, admin, claimers }),
  });
  return result.transactions;
}

export async function transferFeeShareAdmin(
  tokenMint: string,
  currentAdmin: string,
  newAdmin: string
): Promise<string> {
  const result = await bagsRequest<{ transaction: string }>('/fee-share/admin/transfer-tx', {
    method: 'POST',
    body: JSON.stringify({ tokenMint, currentAdmin, newAdmin }),
  });
  return result.transaction;
}

export async function getFeeShareAdminList(wallet: string): Promise<string[]> {
  const result = await bagsRequest<{ tokenMints: string[] }>(
    `/fee-share/admin/list?wallet=${wallet}`
  );
  return result.tokenMints;
}

// --- Claims ---

export async function getClaimablePositions(wallet: string): Promise<ClaimablePosition[]> {
  const result = await bagsRequest<ClaimablePosition[]>(
    `/token-launch/claimable-positions?wallet=${wallet}`
  );
  return result;
}

export async function getClaimTransactions(
  wallet: string,
  tokenMint: string
): Promise<string[]> {
  const result = await bagsRequest<{ transactions: string[] }>('/token-launch/claim-txs/v3', {
    method: 'POST',
    body: JSON.stringify({ wallet, tokenMint }),
  });
  return result.transactions;
}

export async function getTokenClaimEvents(
  tokenMint: string,
  limit: number = 20,
  offset: number = 0
): Promise<ClaimEvent[]> {
  const result = await bagsRequest<{ events: ClaimEvent[] }>(
    `/fee-share/token/claim-events?tokenMint=${tokenMint}&mode=offset&limit=${limit}&offset=${offset}`
  );
  return result.events;
}

export async function getTokenClaimStats(tokenMint: string): Promise<any> {
  return bagsRequest(`/token-launch/claim-stats?tokenMint=${tokenMint}`);
}

// --- Lifetime Fees ---

export async function getTokenLifetimeFees(tokenMint: string): Promise<LifetimeFeesResponse> {
  return bagsRequest<LifetimeFeesResponse>(
    `/token-launch/lifetime-fees?tokenMint=${tokenMint}`
  );
}

// --- Trading ---

export async function getBagsQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number = 100
): Promise<BagsQuoteResponse> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
  });

  return bagsRequest<BagsQuoteResponse>(`/trade/quote?${params}`);
}

export async function createBagsSwapTransaction(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number,
  wallet: string
): Promise<BagsSwapTransaction> {
  return bagsRequest<BagsSwapTransaction>('/trade/swap', {
    method: 'POST',
    body: JSON.stringify({
      inputMint,
      outputMint,
      amount,
      slippageBps,
      wallet,
    }),
  });
}

// --- Send Transaction ---

export async function sendBagsTransaction(signedTransaction: string): Promise<string> {
  const result = await bagsRequest<{ signature: string }>('/solana/send-transaction', {
    method: 'POST',
    body: JSON.stringify({ transaction: signedTransaction }),
  });
  return result.signature;
}

// --- Pools ---

export async function getSeedPool(): Promise<BagsPool> {
  return bagsRequest<BagsPool>(`/solana/bags/pools/token-mint?tokenMint=${SEED_MINT}`);
}

export async function getAllBagsPools(): Promise<BagsPool[]> {
  return bagsRequest<BagsPool[]>('/solana/bags/pools');
}

// --- Partner ---

export async function createPartnerConfig(wallet: string): Promise<string> {
  const result = await bagsRequest<{ transaction: string }>('/fee-share/partner-config/creation-tx', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  });
  return result.transaction;
}

export async function getPartnerClaimTransactions(wallet: string): Promise<string[]> {
  const result = await bagsRequest<{ transactions: string[] }>('/fee-share/partner-config/claim-tx', {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  });
  return result.transactions;
}

export async function getPartnerStats(wallet: string): Promise<PartnerStats> {
  return bagsRequest<PartnerStats>(`/fee-share/partner-config/stats?wallet=${wallet}`);
}

// --- Token Launch ---

export interface BagsTokenLaunchParams {
  name: string;
  ticker: string;
  description: string;
  imageUrl?: string;
  creatorWallet: string;
  feeShareBps: number;
}

export async function bagsTokenLaunch(
  params: BagsTokenLaunchParams
): Promise<{ transaction: string; tokenMint: string }> {
  // Step 1: Create token info and get the mint address
  const tokenInfo = await bagsRequest<{ tokenMint: string }>('/token-launch/create-token-info', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      ticker: params.ticker,
      description: params.description,
      imageUrl: params.imageUrl,
    }),
  });

  const { tokenMint } = tokenInfo;

  // Step 2: Create fee share config
  await bagsRequest('/fee-share/config', {
    method: 'POST',
    body: JSON.stringify({
      tokenMint,
      admin: params.creatorWallet,
      claimers: [
        {
          wallet: params.creatorWallet,
          bps: params.feeShareBps,
        },
      ],
    }),
  });

  // Step 3: Create the launch transaction (pre-signed with token mint)
  const launchResult = await bagsRequest<{ transaction: string }>('/token-launch/create-launch-transaction', {
    method: 'POST',
    body: JSON.stringify({
      tokenMint,
      wallet: params.creatorWallet,
    }),
  });

  return {
    transaction: launchResult.transaction,
    tokenMint,
  };
}

// --- Fee Wallet Lookup ---

export async function getFeeShareWallet(
  provider: string,
  username: string
): Promise<string> {
  const result = await bagsRequest<{ wallet: string }>(
    `/token-launch/fee-share/wallet/v2?provider=${provider}&username=${username}`
  );
  return result.wallet;
}

export async function getFeeShareWalletBulk(
  lookups: Array<{ provider: string; username: string }>
): Promise<Array<{ provider: string; username: string; wallet: string }>> {
  return bagsRequest('/token-launch/fee-share/wallet/v2/bulk', {
    method: 'POST',
    body: JSON.stringify({ lookups }),
  });
}
