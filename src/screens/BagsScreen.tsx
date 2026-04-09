import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import * as Linking from 'expo-linking';
import { SEED_MINT, SEED_DECIMALS, EXPLORER_URL, CLUSTER_SIMULATION } from '../constants';
import {
  getClaimablePositions,
  getClaimTransactions,
  getTokenLifetimeFees,
  getTokenClaimEvents,
  sendBagsTransaction,
  ClaimablePosition,
  ClaimEvent,
} from '../utils/bags';
import {
  checkEligibility,
  executeRewardDrawWithTransfer,
  formatDrawResult,
  RewardDraw,
} from '../utils/randomRewards';

interface BagsScreenProps {
  onBack: () => void;
}

export function BagsScreen({ onBack }: BagsScreenProps) {
  const { smartWalletPubkey, signAndSendTransaction } = useWallet();

  const [claimablePositions, setClaimablePositions] = useState<ClaimablePosition[]>([]);
  const [lifetimeFees, setLifetimeFees] = useState<string | null>(null);
  const [recentClaims, setRecentClaims] = useState<ClaimEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Random rewards state
  const [isEligible, setIsEligible] = useState(false);
  const [seedBalance, setSeedBalance] = useState(0);
  const [lastDraw, setLastDraw] = useState<RewardDraw | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const walletAddress = smartWalletPubkey?.toString() || '';

  const formatTokenAmount = (lamports: string, decimals: number = SEED_DECIMALS): string => {
    const num = parseInt(lamports, 10);
    if (isNaN(num)) return '0';
    return (num / Math.pow(10, decimals)).toFixed(2);
  };

  const formatSolAmount = (lamports: string): string => {
    const num = parseInt(lamports, 10);
    if (isNaN(num)) return '0';
    return (num / 1_000_000_000).toFixed(4);
  };

  const loadData = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const [positions, fees, claims, eligibility] = await Promise.all([
        getClaimablePositions(walletAddress).catch(() => []),
        getTokenLifetimeFees(SEED_MINT).catch(() => null),
        getTokenClaimEvents(SEED_MINT, 10).catch(() => []),
        checkEligibility(walletAddress).catch(() => ({ eligible: false, balance: 0 })),
      ]);

      setClaimablePositions(positions);
      if (fees) {
        setLifetimeFees(fees);
      }
      setRecentClaims(claims);
      setIsEligible(eligibility.eligible);
      setSeedBalance(eligibility.balance);
    } catch (error) {
      // Silently handle errors - data will refresh on next pull
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const seedPositions = claimablePositions.filter(
    (p) => p.baseMint === SEED_MINT
  );

  const totalClaimable = seedPositions.reduce((sum, p) => {
    return sum + (p.totalClaimableLamportsUserShare || 0);
  }, 0);

  const handleClaim = useCallback(async () => {
    if (!walletAddress || totalClaimable <= 0) return;

    setIsClaiming(true);

    try {
      const transactions = await getClaimTransactions(walletAddress, SEED_MINT);

      if (!transactions || transactions.length === 0) {
        Alert.alert('Nothing to claim', 'No claimable fees found for SEED.');
        return;
      }

      // Bags returns base64 serialized transactions
      // Deserialize each, extract instructions, sign via LazorKit
      const { Transaction } = await import('@solana/web3.js');
      let successCount = 0;

      for (let i = 0; i < transactions.length; i++) {
        try {
          const txBuffer = Buffer.from(transactions[i], 'base64');
          const tx = Transaction.from(txBuffer);

          const redirectUrl = Linking.createURL('claim-callback');

          await signAndSendTransaction(
            {
              instructions: tx.instructions,
              transactionOptions: {
                clusterSimulation: CLUSTER_SIMULATION as 'mainnet' | 'devnet',
              },
            },
            {
              redirectUrl,
              onSuccess: () => {
                successCount++;
              },
              onFail: () => {
                // Failure handled by successCount check below
              },
            }
          );
        } catch (txError: any) {
          // Skip this tx and continue with the next
        }
      }

      if (successCount > 0) {
        Alert.alert('Claimed', `Successfully claimed fees in ${successCount} transaction(s).`);
        // Refresh data
        loadData();
      } else {
        Alert.alert('Claim failed', 'Could not complete any claim transactions.');
      }
    } catch (error: any) {
      Alert.alert('Claim failed', error.message || 'Could not generate claim transactions');
    } finally {
      setIsClaiming(false);
    }
  }, [walletAddress, totalClaimable, signAndSendTransaction, loadData]);

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateAddress = (address: string): string => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>Loading SEED rewards...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SEED Rewards</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Lifetime Fees Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>SEED Lifetime Fees</Text>
        <Text style={styles.cardValue}>
          {lifetimeFees ? `${formatSolAmount(lifetimeFees)} SOL` : '—'}
        </Text>
        <Text style={styles.cardSub}>Total fees collected on SEED token</Text>
      </View>

      {/* Claimable Card */}
      <View style={[styles.card, totalClaimable > 0 && styles.cardHighlight]}>
        <Text style={styles.cardLabel}>Your Claimable Fees</Text>
        <Text style={[styles.cardValue, totalClaimable > 0 && styles.cardValueGreen]}>
          {totalClaimable > 0 ? formatSolAmount(totalClaimable.toString()) + ' SOL' : 'Nothing to claim'}
        </Text>
        {seedPositions.length > 0 && (
          <View style={styles.positionsList}>
            {seedPositions.map((pos, i) => (
              <View key={i} style={styles.positionRow}>
                <Text style={styles.positionSource}>
                  {pos.isMigrated ? 'DAMM' : 'DBC'}{pos.isCustomFeeVault ? ' (Custom)' : ''}
                </Text>
                <Text style={styles.positionAmount}>
                  {formatSolAmount(pos.totalClaimableLamportsUserShare.toString())} SOL
                </Text>
              </View>
            ))}
          </View>
        )}
        {totalClaimable > 0 && (
          <TouchableOpacity
            style={[styles.claimButton, isClaiming && styles.buttonDisabled]}
            onPress={handleClaim}
            disabled={isClaiming}
            activeOpacity={0.8}
          >
            {isClaiming ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.claimButtonText}>Claim Fees</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Random Rewards */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Random Rewards</Text>
        <Text style={styles.rewardStatus}>
          {isEligible
            ? `Eligible - ${seedBalance.toFixed(0)} SEED`
            : `Hold 100+ SEED to qualify`}
        </Text>
        {isEligible && (
          <Text style={styles.cardSub}>
            Higher balance = higher chance to win fee airdrops
          </Text>
        )}

        {/* Draw button - executes a real reward airdrop */}
        <TouchableOpacity
          style={[styles.drawButton, isDrawing && styles.buttonDisabled]}
          onPress={async () => {
            if (!lifetimeFees || !smartWalletPubkey) {
              Alert.alert('Not ready', 'Connect wallet and ensure fees are available.');
              return;
            }
            setIsDrawing(true);
            try {
              const result = await executeRewardDrawWithTransfer(
                smartWalletPubkey,
                lifetimeFees,
                10,
                100
              );
              if (!result) {
                Alert.alert('No draw', 'Not enough eligible holders or fees for a draw.');
                return;
              }

              const { draw, instruction } = result;
              const redirectUrl = Linking.createURL('reward-callback');

              // Sign and send the actual SOL transfer to the winner
              await signAndSendTransaction(
                {
                  instructions: [instruction],
                  transactionOptions: {
                    clusterSimulation: CLUSTER_SIMULATION as 'mainnet' | 'devnet',
                  },
                },
                {
                  redirectUrl,
                  onSuccess: () => {
                    setLastDraw(draw);
                    const isWinner = draw.winner.address === walletAddress;
                    Alert.alert(
                      isWinner ? 'You won!' : 'Reward sent!',
                      `${formatDrawResult(draw)}\n\n${draw.allHolders} eligible holders.\n\nSOL has been sent to the winner's wallet.`
                    );
                  },
                  onFail: (error) => {
                    Alert.alert('Reward failed', error.message);
                  },
                }
              );
            } catch (error: any) {
              Alert.alert('Draw failed', error.message || 'Could not execute draw');
            } finally {
              setIsDrawing(false);
            }
          }}
          disabled={isDrawing}
          activeOpacity={0.8}
        >
          {isDrawing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.drawButtonText}>Run Reward Draw</Text>
          )}
        </TouchableOpacity>

        {lastDraw && (
          <View style={styles.drawResult}>
            <Text style={styles.drawResultLabel}>Last draw result</Text>
            <Text style={styles.drawResultText}>{formatDrawResult(lastDraw)}</Text>
            <Text style={styles.drawResultSub}>
              {lastDraw.allHolders} holders | {lastDraw.rewardAmount.toFixed(4)} SOL reward pool
            </Text>
          </View>
        )}
      </View>

      {/* Recent Claims */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent SEED Claims</Text>
        {recentClaims.length === 0 ? (
          <Text style={styles.emptyText}>No claims yet</Text>
        ) : (
          recentClaims.map((event, i) => (
            <View key={i} style={styles.claimRow}>
              <View>
                <Text style={styles.claimClaimer}>
                  {truncateAddress(event.wallet)}
                </Text>
                <Text style={styles.claimDate}>{formatDate(event.timestamp)}</Text>
              </View>
              <Text style={styles.claimAmount}>
                {formatSolAmount(event.amount)} SOL
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How SEED Fee Sharing Works</Text>
        <Text style={styles.infoItem}>
          • Fees are collected on every SEED trade on Bags.fm
        </Text>
        <Text style={styles.infoItem}>
          • Fee share is distributed to configured claimers
        </Text>
        <Text style={styles.infoItem}>
          • Claim your earned fees anytime from this screen
        </Text>
        <Text style={styles.infoItem}>
          • Random rewards airdrop fees to SEED holders periodically
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  backText: {
    fontSize: 16,
    color: '#666',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  cardHighlight: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  cardLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  cardValueGreen: {
    color: '#16a34a',
  },
  cardSub: {
    fontSize: 12,
    color: '#999',
  },
  positionsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  positionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  positionSource: {
    fontSize: 13,
    color: '#666',
  },
  positionAmount: {
    fontSize: 13,
    color: '#000',
    fontWeight: '500',
  },
  rewardStatus: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  drawButton: {
    backgroundColor: '#000',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  drawButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  drawResult: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  drawResultLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  drawResultText: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
    marginBottom: 4,
  },
  drawResultSub: {
    fontSize: 12,
    color: '#666',
  },
  claimButton: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  claimButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  claimRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  claimClaimer: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  claimDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  claimAmount: {
    fontSize: 14,
    color: '#000',
    fontWeight: '600',
  },
  infoSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  infoItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
});
