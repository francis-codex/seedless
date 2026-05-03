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
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import {
    getAssociatedTokenAddress,
    getAccount,
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedInstruction,
    createCloseAccountInstruction,
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

const connection = new Connection(SOLANA_RPC_URL, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
});

const fallbackConnection = new Connection(
    IS_DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com',
    { commitment: 'confirmed' },
);

interface StealthScreenProps {
    onBack: () => void;
}

interface AddressWithBalance extends StealthAddress {
    balance: number; // SOL
    usdcBalance: number;
}

export function StealthScreen({ onBack }: StealthScreenProps) {
    const { smartWalletPubkey } = useWallet();

    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [metaAddress, setMetaAddress] = useState<StealthMetaAddress | null>(null);
    const [addresses, setAddresses] = useState<AddressWithBalance[]>([]);
    const [totalBalance, setTotalBalance] = useState(0); // SOL
    const [totalUsdcBalance, setTotalUsdcBalance] = useState(0);
    const [solPrice, setSolPrice] = useState(0);
    const [isSweeping, setIsSweeping] = useState(false);

    // Payment request modal
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentAddress, setPaymentAddress] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentToken, setPaymentToken] = useState<PaymentToken>('SOL');
    const [paymentLabel, setPaymentLabel] = useState('');
    const [generatedQrUrl, setGeneratedQrUrl] = useState('');

    const walletId = smartWalletPubkey?.toBase58();

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

    const loadAddresses = async () => {
        try {
            const allAddresses = await getAllStealthAddresses(walletId);
            const usdcMint = new PublicKey(USDC_MINT);

            // Fetch SOL + USDC balance for every stealth address in parallel
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

            // Fetch SOL price for USD total display
            try {
                const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`);
                if (res.ok) {
                    const data = await res.json();
                    setSolPrice(data?.[SOL_MINT]?.usdPrice ?? 0);
                }
            } catch {
                // keep last known price
            }
        } catch (error) {
            console.error('Failed to load addresses:', error);
        }
    };

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

                                // USDC sweep: optionally create main ATA, then transfer USDC.
                                // We do NOT close the stealth ATA (it stays empty on-chain) — keeps math simple
                                // and avoids subtle pre-flight rent edge cases.
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

                                // SOL sweep: leave the rent-exempt minimum on stealth to avoid runtime
                                // rent checks. Cheaper than the alternatives (closeAccount edge cases,
                                // draining-to-zero pre-flight failures). Costs ~0.0009 SOL per address.
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

                            // Build a single truthful summary of what actually happened.
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

    // Copy address to clipboard
    const copyAddress = async (address: string) => {
        await Clipboard.setStringAsync(address);
        Alert.alert('Copied', 'Address copied to clipboard');
    };

    if (isLoading) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color="#000" />
                <Text style={styles.loadingText}>Initializing stealth addresses...</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={
                <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor="#000"
                    colors={['#000']}
                    title="Refreshing..."
                    titleColor="#666"
                />
            }
        >
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack}>
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Stealth</Text>
                <TouchableOpacity onPress={handleRefresh} disabled={isRefreshing} style={styles.refreshIcon}>
                    {isRefreshing ? (
                        <ActivityIndicator size="small" color="#000" />
                    ) : (
                        <Text style={styles.refreshIconText}>↻</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Info Card */}
            <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Privacy Receiving</Text>
                <Text style={styles.infoText}>
                    Each stealth address is a unique one-time address. Payments cannot be linked to your main
                    wallet on-chain.
                </Text>
            </View>

            {/* Total Balance */}
            <View style={styles.balanceCard}>
                <Text style={styles.balanceLabel}>Stealth Balance</Text>
                <Text style={styles.balanceAmount}>
                    ${(totalBalance * solPrice + totalUsdcBalance).toFixed(2)}
                </Text>
                <Text style={styles.addressCount}>
                    {totalBalance > 0 ? `${totalBalance.toFixed(4)} SOL` : ''}
                    {totalBalance > 0 && totalUsdcBalance > 0 ? ' · ' : ''}
                    {totalUsdcBalance > 0 ? `${totalUsdcBalance.toFixed(2)} USDC` : ''}
                    {totalBalance === 0 && totalUsdcBalance === 0 ? `${addresses.length} address(es)` : ` · ${addresses.length} address(es)`}
                </Text>

                <TouchableOpacity
                    style={[styles.sweepButton, isSweeping && styles.buttonDisabled]}
                    onPress={handleSweepAll}
                    disabled={isSweeping || (totalBalance === 0 && totalUsdcBalance === 0)}
                >
                    {isSweeping ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.sweepButtonText}>Sweep All to Main Wallet</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Generate New Address */}
            <TouchableOpacity style={styles.generateButton} onPress={handleGenerateAddress}>
                <Text style={styles.generateButtonText}>New Stealth Address</Text>
                <Text style={styles.generateButtonSub}>For receiving private payments</Text>
            </TouchableOpacity>

            {/* Address List */}
            <View style={styles.addressList}>
                <Text style={styles.sectionTitle}>Your Stealth Addresses</Text>

                {addresses.length === 0 ? (
                    <Text style={styles.emptyText}>No stealth addresses yet. Create one above.</Text>
                ) : (
                    addresses.map((addr) => (
                        <View key={addr.address} style={styles.addressItem}>
                            <View style={styles.addressInfo}>
                                <TouchableOpacity onPress={() => copyAddress(addr.address)}>
                                    <Text style={styles.addressText}>{shortenAddress(addr.address)}</Text>
                                </TouchableOpacity>
                                <Text style={styles.addressBalance}>
                                    {addr.balance.toFixed(4)} SOL
                                    {addr.usdcBalance > 0 ? ` · ${addr.usdcBalance.toFixed(2)} USDC` : ''}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.requestButton}
                                onPress={() => handleRequestPayment(addr.address)}
                            >
                                <Text style={styles.requestButtonText}>Request</Text>
                            </TouchableOpacity>
                        </View>
                    ))
                )}
            </View>

            {/* Limits Info */}
            <View style={styles.limitsCard}>
                <Text style={styles.limitsTitle}>Testing Limits</Text>
                <Text style={styles.limitsText}>Max sweep: {STEALTH_LIMITS.MAX_SWEEP_SOL} SOL</Text>
                <Text style={styles.limitsText}>Max request: {STEALTH_LIMITS.MAX_REQUEST_SOL} SOL</Text>
            </View>

            {/* Payment Request Modal */}
            <Modal visible={showPaymentModal} animationType="slide" transparent onRequestClose={() => setShowPaymentModal(false)}>
                <TouchableWithoutFeedback onPress={() => setShowPaymentModal(false)}>
                    <KeyboardAvoidingView
                        style={styles.modalOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <TouchableWithoutFeedback onPress={() => {}}><View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Payment Request</Text>
                        <Text style={styles.modalAddress}>{shortenAddress(paymentAddress)}</Text>

                        {/* Token selector */}
                        <View style={styles.tokenSelector}>
                            <TouchableOpacity
                                style={[styles.tokenOption, paymentToken === 'SOL' && styles.tokenOptionActive]}
                                onPress={() => setPaymentToken('SOL')}
                            >
                                <Text
                                    style={[
                                        styles.tokenOptionText,
                                        paymentToken === 'SOL' && styles.tokenOptionTextActive,
                                    ]}
                                >
                                    SOL
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tokenOption, paymentToken === 'USDC' && styles.tokenOptionActive]}
                                onPress={() => setPaymentToken('USDC')}
                            >
                                <Text
                                    style={[
                                        styles.tokenOptionText,
                                        paymentToken === 'USDC' && styles.tokenOptionTextActive,
                                    ]}
                                >
                                    USDC
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={styles.modalInput}
                            placeholder={`Amount (max ${getPaymentLimit(paymentToken)} ${paymentToken})`}
                            placeholderTextColor="#999"
                            value={paymentAmount}
                            onChangeText={setPaymentAmount}
                            keyboardType="decimal-pad"
                        />

                        <TextInput
                            style={styles.modalInput}
                            placeholder="Label (optional)"
                            placeholderTextColor="#999"
                            value={paymentLabel}
                            onChangeText={setPaymentLabel}
                        />

                        <TouchableOpacity style={styles.generateQrButton} onPress={handleGenerateQr}>
                            <Text style={styles.generateQrButtonText}>Generate QR Code</Text>
                        </TouchableOpacity>

                        {generatedQrUrl ? (
                            <View style={styles.qrContainer}>
                                <QRCode value={generatedQrUrl} size={200} backgroundColor="#fff" color="#000" />
                                <Text style={styles.qrLabel}>Scan with a Solana Pay wallet</Text>
                                <TouchableOpacity onPress={() => Clipboard.setStringAsync(generatedQrUrl)}>
                                    <Text style={styles.copyUrlText}>Copy Link</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}

                        <TouchableOpacity style={styles.closeButton} onPress={() => setShowPaymentModal(false)}>
                            <Text style={styles.closeButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View></TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </TouchableWithoutFeedback>
            </Modal>
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
    },
    loading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
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
    refreshIcon: {
        width: 40,
        alignItems: 'flex-end',
    },
    refreshIconText: {
        fontSize: 22,
        color: '#000',
    },
    infoCard: {
        backgroundColor: '#f0f9ff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0369a1',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 14,
        color: '#0c4a6e',
        lineHeight: 20,
    },
    balanceCard: {
        backgroundColor: '#000',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
    },
    balanceLabel: {
        fontSize: 13,
        color: '#999',
        marginBottom: 4,
    },
    balanceAmount: {
        fontSize: 32,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    addressCount: {
        fontSize: 14,
        color: '#666',
        marginBottom: 16,
    },
    sweepButton: {
        backgroundColor: '#22c55e',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    sweepButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    generateButton: {
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    generateButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000',
    },
    generateButtonSub: {
        fontSize: 13,
        color: '#666',
        marginTop: 4,
    },
    addressList: {
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
        fontStyle: 'italic',
    },
    addressItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fafafa',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
    },
    addressInfo: {
        flex: 1,
    },
    addressText: {
        fontSize: 15,
        fontWeight: '500',
        color: '#000',
    },
    addressBalance: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    requestButton: {
        backgroundColor: '#000',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 6,
    },
    requestButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#fff',
    },
    limitsCard: {
        backgroundColor: '#fef3c7',
        borderRadius: 12,
        padding: 16,
    },
    limitsTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#92400e',
        marginBottom: 8,
    },
    limitsText: {
        fontSize: 13,
        color: '#78350f',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#000',
        textAlign: 'center',
        marginBottom: 8,
    },
    modalAddress: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginBottom: 20,
    },
    tokenSelector: {
        flexDirection: 'row',
        marginBottom: 16,
        gap: 12,
    },
    tokenOption: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
    },
    tokenOptionActive: {
        backgroundColor: '#000',
    },
    tokenOptionText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#666',
    },
    tokenOptionTextActive: {
        color: '#fff',
    },
    modalInput: {
        borderWidth: 1,
        borderColor: '#e5e5e5',
        borderRadius: 10,
        padding: 14,
        fontSize: 16,
        color: '#000',
        marginBottom: 12,
        backgroundColor: '#fafafa',
    },
    generateQrButton: {
        backgroundColor: '#000',
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 16,
    },
    generateQrButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    qrContainer: {
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 16,
    },
    qrLabel: {
        fontSize: 13,
        color: '#666',
        marginTop: 12,
    },
    copyUrlText: {
        fontSize: 14,
        color: '#0066cc',
        marginTop: 8,
    },
    urlActions: {
        flexDirection: 'row',
        gap: 20,
        marginTop: 4,
    },
    closeButton: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    closeButtonText: {
        fontSize: 16,
        color: '#666',
    },
});
