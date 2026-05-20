import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import {
    getAssociatedTokenAddress,
    getAccount,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
} from '@solana/spl-token';
import QRCode from 'react-native-qrcode-svg';

import { SOLANA_RPC_URL, IS_DEVNET, STEALTH_SWEEP_RENT, STEALTH_SWEEP_FEE, USDC_MINT, SOL_MINT } from '../constants';
import {
    getStealthMetaAddress,
    generateStealthAddress,
    getAllStealthAddresses,
    getStealthKeypair,
    isStealthInitialized,
    getOrCreateMasterSeed,
    hideStealthAddress,
    StealthMetaAddress,
    StealthAddress,
    STEALTH_LIMITS,
} from '../utils/stealth';
import {
    createSolanaPayUrl,
    PaymentToken,
    getPaymentLimit,
    shortenAddress,
} from '../utils/paymentRequest';
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, PrimaryButton, Pill, Icon } from '../components/ui';

// Shared singleton connections — see src/utils/connection.ts
import { connection, fallbackConnection } from '../utils/connection';

interface StealthScreenProps {
    onBack: () => void;
}

interface AddressWithBalance extends StealthAddress {
    balance: number;
    usdcBalance: number;
}

export function StealthScreen({ onBack }: StealthScreenProps) {
    const { smartWalletPubkey } = useWallet();

    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [metaAddress, setMetaAddress] = useState<StealthMetaAddress | null>(null);
    const [addresses, setAddresses] = useState<AddressWithBalance[]>([]);
    const [totalBalance, setTotalBalance] = useState(0);
    const [totalUsdcBalance, setTotalUsdcBalance] = useState(0);
    const [solPrice, setSolPrice] = useState(0);
    const [isSweeping, setIsSweeping] = useState(false);

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentAddress, setPaymentAddress] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentToken, setPaymentToken] = useState<PaymentToken>('SOL');
    const [paymentLabel, setPaymentLabel] = useState('');
    const [generatedQrUrl, setGeneratedQrUrl] = useState('');

    const walletId = smartWalletPubkey?.toBase58();

    const loadAddresses = async () => {
        try {
            const allAddresses = await getAllStealthAddresses(walletId);
            const usdcMint = new PublicKey(USDC_MINT);

            const perAddress = await Promise.all(
                allAddresses.map(async (addr) => {
                    const pubkey = new PublicKey(addr.address);
                    const lamports = await connection.getBalance(pubkey).catch(() =>
                        fallbackConnection.getBalance(pubkey).catch(() => 0)
                    );
                    let usdc = 0;
                    try {
                        const ata = await getAssociatedTokenAddress(usdcMint, pubkey);
                        const acc = await getAccount(connection, ata);
                        usdc = Number(acc.amount) / 1_000_000;
                    } catch {
                        usdc = 0;
                    }
                    return { sol: lamports / LAMPORTS_PER_SOL, usdc };
                })
            );

            let totalSol = 0;
            let totalUsdc = 0;
            const addressesWithBalances: AddressWithBalance[] = allAddresses.map((addr, i) => {
                totalSol += perAddress[i].sol;
                totalUsdc += perAddress[i].usdc;
                return { ...addr, balance: perAddress[i].sol, usdcBalance: perAddress[i].usdc };
            });

            setAddresses(addressesWithBalances);
            setTotalBalance(totalSol);
            setTotalUsdcBalance(totalUsdc);

            try {
                const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`);
                if (res.ok) {
                    const data = await res.json();
                    setSolPrice(data?.[SOL_MINT]?.usdPrice ?? 0);
                }
            } catch {}
        } catch (error) {
            console.error('Failed to load addresses:', error);
        }
    };

    const initialize = useCallback(async () => {
        setIsLoading(true);
        try {
            const initialized = await isStealthInitialized(walletId);
            if (!initialized) {
                await getOrCreateMasterSeed();
            }
            const meta = await getStealthMetaAddress();
            setMetaAddress(meta);
            setIsInitialized(true);
            await loadAddresses();
        } catch (error) {
            console.error('Failed to initialize stealth:', error);
            Alert.alert('Error', 'Failed to initialize stealth addresses');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        initialize();
    }, [initialize]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await loadAddresses();
        } finally {
            setIsRefreshing(false);
        }
    }, [walletId]);

    const handleGenerateAddress = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const newAddress = await generateStealthAddress(undefined, walletId);
            setAddresses((prev) => [...prev, { ...newAddress, balance: 0, usdcBalance: 0 }]);
            Alert.alert('Created', `New stealth address: ${shortenAddress(newAddress.address)}`);
        } catch (error) {
            console.error('Failed to generate address:', error);
            Alert.alert('Error', 'Failed to generate stealth address');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveAddress = (addr: AddressWithBalance) => {
        const hasBalance = addr.balance > 0 || addr.usdcBalance > 0;
        const warning = hasBalance
            ? `This address still has ${addr.balance.toFixed(4)} SOL${addr.usdcBalance > 0 ? ` + ${addr.usdcBalance.toFixed(2)} USDC` : ''}. Sweep first or you'll lose access in this view (the address still exists on-chain).\n\nRemove anyway?`
            : 'Remove this stealth address from your list? It still exists on-chain — you just won\'t see it here.';
        Alert.alert(
            'Remove address',
            warning,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        await hideStealthAddress(addr.index, walletId);
                        setAddresses((prev) => prev.filter((a) => a.address !== addr.address));
                    },
                },
            ],
        );
    };

    const handleRequestPayment = (address: string) => {
        setPaymentAddress(address);
        setPaymentAmount('');
        setPaymentLabel('');
        setGeneratedQrUrl('');
        setShowPaymentModal(true);
    };

    const handleGenerateQr = () => {
        const amount = paymentAmount ? parseFloat(paymentAmount) : undefined;
        if (amount !== undefined) {
            const limit = getPaymentLimit(paymentToken);
            if (amount > limit) {
                Alert.alert('Limit Exceeded', `Maximum is ${limit} ${paymentToken}`);
                return;
            }
        }
        const url = createSolanaPayUrl({
            recipient: paymentAddress,
            amount,
            token: paymentToken,
            label: paymentLabel || 'Seedless Wallet',
        });
        setGeneratedQrUrl(url);
    };

    const handleSweepAll = async () => {
        if (!smartWalletPubkey) {
            Alert.alert('Error', 'Main wallet not connected');
            return;
        }

        const fundedAddresses = addresses.filter((a) => a.balance > 0 || a.usdcBalance > 0);
        if (fundedAddresses.length === 0) {
            Alert.alert('No Funds', 'No stealth addresses have funds to sweep');
            return;
        }

        if (totalBalance > STEALTH_LIMITS.MAX_SWEEP_SOL) {
            Alert.alert(
                'Limit Exceeded',
                `Total ${totalBalance.toFixed(4)} SOL exceeds limit of ${STEALTH_LIMITS.MAX_SWEEP_SOL} SOL`
            );
            return;
        }

        const usdcLine = totalUsdcBalance > 0 ? ` + ${totalUsdcBalance.toFixed(2)} USDC` : '';
        Alert.alert(
            'Sweep All',
            `Sweep ${totalBalance.toFixed(4)} SOL${usdcLine} from ${fundedAddresses.length} address(es) to your main wallet?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sweep',
                    onPress: async () => {
                        setIsSweeping(true);
                        const sweptCount = { ok: 0 };
                        const underfunded: string[] = [];
                        try {
                            const usdcMint = new PublicKey(USDC_MINT);
                            const mainUsdcAta = await getAssociatedTokenAddress(usdcMint, smartWalletPubkey, true);
                            const mainAtaExists = (await connection.getAccountInfo(mainUsdcAta)) !== null;

                            for (const addr of fundedAddresses) {
                                const keypair = await getStealthKeypair(addr.address, addr.index, walletId);
                                if (!keypair) continue;

                                const ixs = [];
                                let createAtaCost = 0;

                                if (addr.usdcBalance > 0) {
                                    const stealthUsdcAta = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
                                    let usdcAmount = 0n;
                                    try {
                                        const acc = await getAccount(connection, stealthUsdcAta);
                                        usdcAmount = acc.amount;
                                    } catch {
                                        usdcAmount = 0n;
                                    }
                                    if (usdcAmount > 0n) {
                                        if (!mainAtaExists) {
                                            ixs.push(
                                                createAssociatedTokenAccountIdempotentInstruction(
                                                    keypair.publicKey,
                                                    mainUsdcAta,
                                                    smartWalletPubkey,
                                                    usdcMint,
                                                ),
                                            );
                                            createAtaCost = 2039280;
                                        }
                                        ixs.push(
                                            createTransferCheckedInstruction(
                                                stealthUsdcAta,
                                                usdcMint,
                                                mainUsdcAta,
                                                keypair.publicKey,
                                                usdcAmount,
                                                6,
                                            ),
                                        );
                                    }
                                }

                                const liveBalance = await connection.getBalance(keypair.publicKey);
                                const fee = STEALTH_SWEEP_FEE;
                                const rentBuffer = STEALTH_SWEEP_RENT;
                                const sendLamports = liveBalance - fee - createAtaCost - rentBuffer;

                                if (sendLamports < 0) {
                                    underfunded.push(addr.address);
                                    continue;
                                }

                                if (sendLamports > 0) {
                                    ixs.push(
                                        SystemProgram.transfer({
                                            fromPubkey: keypair.publicKey,
                                            toPubkey: smartWalletPubkey,
                                            lamports: sendLamports,
                                        }),
                                    );
                                }

                                if (ixs.length === 0) continue;

                                const { blockhash } = await connection.getLatestBlockhash();
                                const transaction = new Transaction({
                                    recentBlockhash: blockhash,
                                    feePayer: keypair.publicKey,
                                }).add(...ixs);
                                transaction.sign(keypair);
                                const signature = await connection.sendRawTransaction(transaction.serialize());
                                await connection.confirmTransaction(signature, 'confirmed');
                                sweptCount.ok += 1;
                            }

                            const lines: string[] = [];
                            if (sweptCount.ok > 0) {
                                lines.push(`✓ Swept ${sweptCount.ok} address(es) to main wallet.`);
                            }
                            if (underfunded.length > 0) {
                                lines.push(
                                    `⚠ ${underfunded.length} address(es) need a tiny bit of SOL to pay fees. Solana requires ~0.000896 SOL per address (rent + fee). Send 0.001 SOL from any wallet to:\n\n${underfunded.map(shortenAddress).join('\n')}`,
                                );
                            }
                            if (lines.length === 0) {
                                lines.push('Nothing to sweep.');
                            }
                            Alert.alert(sweptCount.ok > 0 ? 'Sweep Complete' : 'Action Needed', lines.join('\n\n'));
                            await loadAddresses();
                        } catch (error: any) {
                            console.error('Sweep failed:', error);
                            Alert.alert('Sweep Failed', error.message || 'Could not sweep funds');
                        } finally {
                            setIsSweeping(false);
                        }
                    },
                },
            ]
        );
    };

    const copyAddress = async (address: string) => {
        await Clipboard.setStringAsync(address);
        Alert.alert('Copied', 'Address copied to clipboard');
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.safe}>
                <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
                <ScreenHeader title="Stealth" onClose={onBack} />
                <View style={styles.loadingBody}>
                    <ActivityIndicator size="large" color={colors.text} />
                    <Text style={styles.loadingText}>Initializing stealth addresses...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
            <ScreenHeader title="Stealth" onClose={onBack} />
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={colors.text}
                    />
                }
            >
                <View style={styles.explainerCard}>
                    <View style={styles.explainerRow}>
                        <Icon name="shield" size={18} color={colors.text} />
                        <Text style={styles.explainerTitle}>What is a stealth address?</Text>
                    </View>
                    <Text style={styles.explainerBody}>
                        A one-time address you share to receive funds. No one watching the chain can link it back to you. Sweep the funds into your main wallet anytime.
                    </Text>
                </View>

                <View style={styles.balanceHero}>
                    <Text style={styles.balanceLabel}>Stealth balance</Text>
                    <Text style={styles.balanceAmount}>
                        ${(totalBalance * solPrice + totalUsdcBalance).toFixed(2)}
                    </Text>
                    <Text style={styles.balanceSub}>
                        {totalBalance > 0 ? `${totalBalance.toFixed(4)} SOL` : ''}
                        {totalBalance > 0 && totalUsdcBalance > 0 ? ' · ' : ''}
                        {totalUsdcBalance > 0 ? `${totalUsdcBalance.toFixed(2)} USDC` : ''}
                        {totalBalance === 0 && totalUsdcBalance === 0 ? `${addresses.length} address(es)` : ` · ${addresses.length} address(es)`}
                    </Text>

                    <View style={{ marginTop: spacing.lg }}>
                        <PrimaryButton
                            label="Sweep all to main wallet"
                            onPress={handleSweepAll}
                            loading={isSweeping}
                            disabled={totalBalance === 0 && totalUsdcBalance === 0}
                            fullWidth
                            variant="secondary"
                        />
                    </View>
                </View>

                <PrimaryButton
                    label="New stealth address"
                    onPress={handleGenerateAddress}
                    fullWidth
                    icon={<Icon name="plus" size={18} color={colors.white} />}
                    style={{ marginBottom: spacing.xxl }}
                />

                <View style={styles.listHeader}>
                    <Text style={styles.sectionTitle}>Your stealth addresses</Text>
                    <Pill label={`${addresses.length}`} variant="neutral" />
                </View>

                {addresses.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>No stealth addresses yet. Create one above.</Text>
                    </View>
                ) : (
                    addresses.map((addr) => (
                        <View key={addr.address} style={styles.addrItem}>
                            <View style={{ flex: 1 }}>
                                <TouchableOpacity onPress={() => copyAddress(addr.address)} activeOpacity={0.7}>
                                    <Text style={styles.addrText}>{shortenAddress(addr.address)}</Text>
                                </TouchableOpacity>
                                <Text style={styles.addrBalance}>
                                    {addr.balance.toFixed(4)} SOL
                                    {addr.usdcBalance > 0 ? ` · ${addr.usdcBalance.toFixed(2)} USDC` : ''}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.requestBtn}
                                onPress={() => handleRequestPayment(addr.address)}
                                activeOpacity={0.7}
                            >
                                <Icon name="qr" size={16} color={colors.text} />
                                <Text style={styles.requestBtnText}>Request</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.removeBtn}
                                onPress={() => handleRemoveAddress(addr)}
                                activeOpacity={0.7}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Icon name="close" size={16} color={colors.dangerText} />
                            </TouchableOpacity>
                        </View>
                    ))
                )}

            </ScrollView>

            {/* Payment Request Modal */}
            <Modal visible={showPaymentModal} animationType="slide" transparent onRequestClose={() => setShowPaymentModal(false)}>
                <TouchableWithoutFeedback onPress={() => setShowPaymentModal(false)}>
                    <KeyboardAvoidingView
                        style={styles.modalOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <TouchableWithoutFeedback onPress={() => {}}>
                            <View style={styles.sheet}>
                                <View style={styles.sheetHandle} />
                                <Text style={styles.sheetTitle}>Payment request</Text>
                                <Text style={styles.sheetSub}>{shortenAddress(paymentAddress)}</Text>

                                <View style={styles.tokenSelector}>
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        style={[styles.tokenOption, paymentToken === 'SOL' && styles.tokenOptionActive]}
                                        onPress={() => setPaymentToken('SOL')}
                                    >
                                        <Text style={[styles.tokenOptionText, paymentToken === 'SOL' && styles.tokenOptionTextActive]}>
                                            SOL
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        activeOpacity={0.7}
                                        style={[styles.tokenOption, paymentToken === 'USDC' && styles.tokenOptionActive]}
                                        onPress={() => setPaymentToken('USDC')}
                                    >
                                        <Text style={[styles.tokenOptionText, paymentToken === 'USDC' && styles.tokenOptionTextActive]}>
                                            USDC
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <TextInput
                                    style={styles.modalInput}
                                    placeholder={`Amount (max ${getPaymentLimit(paymentToken)} ${paymentToken})`}
                                    placeholderTextColor={colors.textSubtle}
                                    value={paymentAmount}
                                    onChangeText={setPaymentAmount}
                                    keyboardType="decimal-pad"
                                />

                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Label (optional)"
                                    placeholderTextColor={colors.textSubtle}
                                    value={paymentLabel}
                                    onChangeText={setPaymentLabel}
                                />

                                <PrimaryButton
                                    label="Generate QR code"
                                    onPress={handleGenerateQr}
                                    fullWidth
                                />

                                {generatedQrUrl ? (
                                    <View style={styles.qrContainer}>
                                        <View style={styles.qrFrame}>
                                            <QRCode value={generatedQrUrl} size={200} backgroundColor="#FFFFFF" color="#000000" />
                                        </View>
                                        <Text style={styles.qrLabel}>Scan with a Solana Pay wallet</Text>
                                        <TouchableOpacity
                                            onPress={() => Clipboard.setStringAsync(generatedQrUrl)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.copyUrlText}>Copy link</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : null}

                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPaymentModal(false)} activeOpacity={0.7}>
                                    <Text style={styles.cancelText}>Close</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </TouchableWithoutFeedback>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    container: { flex: 1 },
    content: {
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.xxxl * 2,
    },
    loadingBody: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.md,
    },
    loadingText: {
        ...typography.caption,
    },

    explainerCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        marginTop: spacing.md,
        marginBottom: spacing.lg,
    },
    explainerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    explainerTitle: {
        fontSize: 15,
        fontWeight: '600' as const,
        color: colors.text,
    },
    explainerBody: {
        fontSize: 13,
        lineHeight: 19,
        color: colors.textMuted,
    },
    infoCard: {
        backgroundColor: '#EAF6FF',
        borderRadius: radii.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
    },
    infoHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600' as const,
        color: colors.accentDeep,
    },
    infoText: {
        fontSize: 14,
        color: '#0C4A6E',
        lineHeight: 20,
    },

    balanceHero: {
        backgroundColor: colors.solid,
        borderRadius: radii.lg,
        padding: spacing.xl,
        marginBottom: spacing.xl,
    },
    balanceLabel: {
        fontSize: 13,
        color: '#9DA9BC',
        marginBottom: spacing.xs,
    },
    balanceAmount: {
        fontSize: 40,
        fontWeight: '700' as const,
        color: colors.onSolid,
        letterSpacing: -1.5,
    },
    balanceSub: {
        fontSize: 14,
        color: '#9DA9BC',
        marginTop: spacing.xs,
    },

    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    sectionTitle: {
        ...typography.heading,
    },
    emptyCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        padding: spacing.xl,
        alignItems: 'center',
    },
    emptyText: {
        ...typography.caption,
    },

    addrItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        padding: spacing.lg,
        marginBottom: spacing.sm,
    },
    addrText: {
        fontSize: 15,
        color: colors.text,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
        marginBottom: 4,
    },
    addrBalance: {
        ...typography.caption,
    },
    requestBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.bg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radii.pill,
    },
    requestBtnText: {
        fontSize: 13,
        fontWeight: '600' as const,
        color: colors.text,
    },
    removeBtn: {
        marginLeft: spacing.sm,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.dangerBg,
        alignItems: 'center',
        justifyContent: 'center',
    },

    limitsCard: {
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        padding: spacing.lg,
        marginTop: spacing.lg,
    },
    limitsTitle: {
        fontSize: 13,
        fontWeight: '600' as const,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    limitsText: {
        fontSize: 14,
        color: colors.text,
        marginBottom: 2,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(11, 37, 69, 0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: colors.bg,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: spacing.xl,
        paddingBottom: spacing.xxxl,
    },
    sheetHandle: {
        alignSelf: 'center',
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
        marginBottom: spacing.lg,
    },
    sheetTitle: {
        ...typography.title,
        textAlign: 'center',
    },
    sheetSub: {
        ...typography.caption,
        textAlign: 'center',
        marginTop: 4,
        marginBottom: spacing.xl,
    },
    tokenSelector: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: radii.pill,
        padding: 4,
        marginBottom: spacing.md,
    },
    tokenOption: {
        flex: 1,
        paddingVertical: spacing.md,
        borderRadius: radii.pill,
        alignItems: 'center',
    },
    tokenOptionActive: {
        backgroundColor: colors.bg,
    },
    tokenOptionText: {
        ...typography.body,
        color: colors.textMuted,
    },
    tokenOptionTextActive: {
        color: colors.text,
        fontWeight: '600' as const,
    },
    modalInput: {
        backgroundColor: colors.surface,
        borderRadius: radii.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        fontSize: 15,
        color: colors.text,
        marginBottom: spacing.sm,
    },
    qrContainer: {
        alignItems: 'center',
        marginTop: spacing.xl,
        gap: spacing.md,
    },
    qrFrame: {
        backgroundColor: colors.white,
        padding: spacing.lg,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    qrLabel: {
        ...typography.caption,
        textAlign: 'center',
    },
    copyUrlText: {
        color: colors.accent,
        fontSize: 14,
        fontWeight: '600' as const,
    },
    cancelBtn: {
        paddingVertical: spacing.md,
        alignItems: 'center',
        marginTop: spacing.sm,
    },
    cancelText: {
        ...typography.body,
        color: colors.textMuted,
    },
});
