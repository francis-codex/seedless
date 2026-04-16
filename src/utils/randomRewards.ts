import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SOLANA_RPC_URL, SEED_MINT, SEED_DECIMALS } from '../constants';

const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
});

export interface SeedHolder {
  address: string;
  amount: number; // human-readable
  rawAmount: string;
}

export interface RewardDraw {
  winner: SeedHolder;
  rewardAmount: number; // in SOL
  timestamp: number;
  allHolders: number;
}

// Fetch all SEED token holders via getTokenLargestAccounts + getParsedTokenAccountsByMint
export async function getSeedHolders(minBalance: number = 1): Promise<SeedHolder[]> {
  const seedMint = new PublicKey(SEED_MINT);

  // Use getTokenLargestAccounts for top holders (RPC native, no extra API)
  const largestAccounts = await connection.getTokenLargestAccounts(seedMint);

  const holders: SeedHolder[] = [];

  for (const account of largestAccounts.value) {
    const amount = Number(account.amount) / Math.pow(10, SEED_DECIMALS);
    if (amount < minBalance) continue;

    // Get the owner of this token account
    try {
      const accountInfo = await connection.getParsedAccountInfo(account.address);
      if (accountInfo.value) {
        const parsed = (accountInfo.value.data as any)?.parsed;
        if (parsed?.info?.owner) {
          holders.push({
            address: parsed.info.owner,
            amount,
            rawAmount: account.amount,
          });
        }
      }
    } catch {
      // Skip accounts we can't parse
    }
  }

  return holders;
}

// Pick a random winner weighted by token holdings
// Higher balance = higher chance, but even small holders can win
export function pickRandomWinner(holders: SeedHolder[]): SeedHolder | null {
  if (holders.length === 0) return null;

  const totalBalance = holders.reduce((sum, h) => sum + h.amount, 0);
  if (totalBalance === 0) return null;

  // Weighted random selection
  const random = Math.random() * totalBalance;
  let cumulative = 0;

  for (const holder of holders) {
    cumulative += holder.amount;
    if (random <= cumulative) {
      return holder;
    }
  }

  // Fallback to last holder
  return holders[holders.length - 1];
}

// Calculate reward amount based on fee pool percentage
export function calculateRewardAmount(
  totalFeesLamports: string,
  rewardPercentage: number = 10 // default 10% of collected fees
): number {
  const fees = parseInt(totalFeesLamports, 10);
  if (isNaN(fees) || fees <= 0) return 0;
  return (fees * rewardPercentage) / 100 / 1_000_000_000; // Convert lamports to SOL
}

// Execute a random reward draw
export async function executeRewardDraw(
  totalFeesLamports: string,
  rewardPercentage: number = 10,
  minHolderBalance: number = 100 // minimum SEED to be eligible
): Promise<RewardDraw | null> {
  const holders = await getSeedHolders(minHolderBalance);

  if (holders.length === 0) return null;

  const winner = pickRandomWinner(holders);
  if (!winner) return null;

  const rewardAmount = calculateRewardAmount(totalFeesLamports, rewardPercentage);

  return {
    winner,
    rewardAmount,
    timestamp: Date.now(),
    allHolders: holders.length,
  };
}

// Format draw result for display
export function formatDrawResult(draw: RewardDraw): string {
  const shortAddr = `${draw.winner.address.slice(0, 4)}...${draw.winner.address.slice(-4)}`;
  return `${shortAddr} won ${draw.rewardAmount.toFixed(4)} SOL (holding ${draw.winner.amount.toFixed(0)} SEED)`;
}

export type RewardTransferInstruction = ReturnType<typeof SystemProgram.transfer>;

export function createRewardTransferInstruction(
  fromWallet: PublicKey,
  winnerAddress: string,
  rewardAmountSol: number
): RewardTransferInstruction | null {
  const lamports = Math.round(rewardAmountSol * LAMPORTS_PER_SOL);
  if (lamports <= 0) return null;

  return SystemProgram.transfer({
    fromPubkey: fromWallet,
    toPubkey: new PublicKey(winnerAddress),
    lamports,
  });
}

export async function executeRewardDrawWithTransfer(
  fromWallet: PublicKey,
  totalFeesLamports: string,
  rewardPercentage: number = 10,
  minHolderBalance: number = 100
): Promise<{
  draw: RewardDraw;
  instruction: RewardTransferInstruction;
} | null> {
  const draw = await executeRewardDraw(totalFeesLamports, rewardPercentage, minHolderBalance);
  if (!draw || draw.rewardAmount <= 0) return null;

  const instruction = createRewardTransferInstruction(
    fromWallet,
    draw.winner.address,
    draw.rewardAmount
  );
  if (!instruction) return null;

  return { draw, instruction };
}

// Check if wallet is eligible for random rewards
export async function checkEligibility(
  walletAddress: string,
  minBalance: number = 100
): Promise<{ eligible: boolean; balance: number }> {
  const seedMint = new PublicKey(SEED_MINT);
  const wallet = new PublicKey(walletAddress);

  try {
    const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
    const ata = await getAssociatedTokenAddress(seedMint, wallet);
    const account = await getAccount(connection, ata);
    const balance = Number(account.amount) / Math.pow(10, SEED_DECIMALS);

    return {
      eligible: balance >= minBalance,
      balance,
    };
  } catch {
    return { eligible: false, balance: 0 };
  }
}
