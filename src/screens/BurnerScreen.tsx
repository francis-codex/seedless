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
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

import {
    createBurner,
    listBurnersWithBalances,
    getBurnerBalance,
    sendFromBurner,
    destroyBurner,
    BurnerWalletWithBalance,
    BURNER_LIMITS,
    shortenAddress,
} from '../utils/burner';
import {
    privateSendFromBurner,
    PrivateSendDegradationDeclined,
    type DegradationContext,
    type PrivateSendProgress,
} from '../umbra/burner-bridge';
import { isValidSolanaAddress, getTxExplorerUrl, UMBRA_FEATURE_ENABLED } from '../constants';
import * as Linking from 'expo-linking';
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, PrimaryButton, Pill, Icon } from '../components/ui';

interface BurnerScreenProps {
    onBack: () => void;
}

const BURNER_FEE_LAMPORTS = 5000;

export function BurnerScreen({ onBack }: BurnerScreenProps) {
    const { smartWalletPubkey } = useWallet();
    const walletId = smartWalletPubkey?.toBase58();

    const [burners, setBurners] = useState<BurnerWalletWithBalance[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newBurnerLabel, setNewBurnerLabel] = useState('');

    const [showSendModal, setShowSendModal] = useState(false);
    const [selectedBurner, setSelectedBurner] = useState<BurnerWalletWithBalance | null>(null);
    const [sendRecipient, setSendRecipient] = useState('');
    const [sendAmount, setSendAmount] = useState('');
    const [isSending, setIsSending] = useState(false);

    const [showPrivateSendModal, setShowPrivateSendModal] = useState(false);
    const [privateRecipient, setPrivateRecipient] = useState('');
    const [privateAmount, setPrivateAmount] = useState('');
    const [isPrivateSending, setIsPrivateSending] = useState(false);
    const [privateProgress, setPrivateProgress] = useState<PrivateSendProgress | null>(null);
    const [privateResultSig, setPrivateResultSig] = useState<string | null>(null);

    const loadBurners = useCallback(async (): Promise<BurnerWalletWithBalance[]> => {
        setIsLoading(true);
        try {
            const burnersWithBalances = await listBurnersWithBalances(walletId);
            setBurners(burnersWithBalances);
            return burnersWithBalances;
        } catch (error) {
            console.error('Failed to load burners:', error);
            return [];
        } finally {
            setIsLoading(false);
        }
    }, [walletId]);

    useEffect(() => {
        loadBurners();
    }, [loadBurners]);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const burnersWithBalances = await listBurnersWithBalances(walletId);
            setBurners(burnersWithBalances);
        } catch (error) {
            console.error('Failed to refresh burners:', error);
        } finally {
            setIsRefreshing(false);
        }
    }, [walletId]);

    const handleCreateBurner = async () => {
        if (!newBurnerLabel.trim()) {
            Alert.alert('Error', 'Enter a label');
            return;
        }

        setIsCreating(true);
        try {
            const burner = await createBurner(newBurnerLabel.trim(), walletId);
            setBurners((prev) => [...prev, { ...burner, balance: 0 }]);
            setShowCreateModal(false);
            setNewBurnerLabel('');
            Alert.alert('Created', `"${burner.label}" created`);
        } catch (error: any) {
            console.error('Failed to create burner:', error);
            Alert.alert('Error', error.message || 'Failed to create burner');
        } finally {
            setIsCreating(false);
        }
    };

    const handleOpenSend = (burner: BurnerWalletWithBalance) => {
        setSelectedBurner(burner);
        setSendRecipient('');
        setSendAmount('');
        setShowSendModal(true);
    };

    const handleSend = async () => {
        if (!selectedBurner || !sendRecipient || !sendAmount) {
            Alert.alert('Error', 'Fill all fields');
            return;
        }

        const amount = parseFloat(sendAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Error', 'Invalid amount');
            return;
        }

        if (amount > BURNER_LIMITS.MAX_SEND_SOL) {
            Alert.alert('Limit Exceeded', `Max is ${BURNER_LIMITS.MAX_SEND_SOL} SOL`);
            return;
        }

        const balanceLamports = Math.floor(selectedBurner.balance * LAMPORTS_PER_SOL);
        const amountLamports = Math.round(amount * LAMPORTS_PER_SOL);
        const maxLamports = Math.max(0, balanceLamports - BURNER_FEE_LAMPORTS);
        if (amountLamports > maxLamports) {
            Alert.alert(
                'Not Enough SOL',
                `Burner has ${selectedBurner.balance.toFixed(6)} SOL. Max sendable is ${(maxLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL (network fee reserved).\n\nTap Max to auto-fill.`,
            );
            return;
        }

        setIsSending(true);
        try {
            const signature = await sendFromBurner(selectedBurner.id, sendRecipient, amount);
            Alert.alert('Transaction Successful', `Sent ${amount} SOL.\n\nTx: ${signature.slice(0, 20)}...`);
            setShowSendModal(false);
            await loadBurners();
        } catch (error: any) {
            console.error('Send failed:', error);
            const msg = error.message || 'Transaction failed';
            let friendly = msg;
            if (msg.includes('insufficient lamports') || msg.includes('0x1')) {
                friendly = 'Insufficient balance. Make sure you have enough SOL to cover the amount plus fees.';
            } else if (msg.includes('Transaction too large') || msg.includes('1232')) {
                friendly = 'Transaction too large. Try sending a smaller amount.';
            } else if (msg.includes('Simulation failed') || msg.includes('simulation failed')) {
                friendly = 'Transaction failed. Check your balance and try again.';
            } else if (msg.includes('0x2')) {
                friendly = 'Insufficient funds for this transaction.';
            }
            Alert.alert('Failed', friendly);
        } finally {
            setIsSending(false);
        }
    };

    const handleOpenPrivateSend = (burner: BurnerWalletWithBalance) => {
        setSelectedBurner(burner);
        setPrivateRecipient('');
        setPrivateAmount('');
        setPrivateProgress(null);
        setPrivateResultSig(null);
        setShowPrivateSendModal(true);
    };

    const handlePrivateSend = async () => {
        if (!selectedBurner) return;
        if (!isValidSolanaAddress(privateRecipient)) {
            Alert.alert('Invalid recipient', 'Enter a valid Solana address.');
            return;
        }
        const amount = parseFloat(privateAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert('Invalid amount', 'Enter a positive amount.');
            return;
        }
        if (amount > BURNER_LIMITS.MAX_SEND_SOL) {
            Alert.alert('Limit exceeded', `Max is ${BURNER_LIMITS.MAX_SEND_SOL} SOL`);
            return;
        }
        const balanceLamports = Math.floor(selectedBurner.balance * LAMPORTS_PER_SOL);
        const amountLamports = Math.round(amount * LAMPORTS_PER_SOL);
        const feeReserve = 30000;
        if (amountLamports > balanceLamports - feeReserve) {
            Alert.alert(
                'Not enough SOL',
                `Burner has ${selectedBurner.balance.toFixed(6)} SOL.\nReserve ${(feeReserve / LAMPORTS_PER_SOL).toFixed(6)} SOL for Umbra fees (registration may be needed on first send).`,
            );
            return;
        }

        setIsPrivateSending(true);
        setPrivateProgress({ stage: 'preparing' });
        setPrivateResultSig(null);
        try {
            const askDegradationConsent = (ctx: DegradationContext): Promise<boolean> => {
                const isRpcError = ctx.reason === 'pre-flight-rpc-error';
                const title = isRpcError ? "Couldn't verify privacy" : 'Recipient isn\'t on Umbra';
                const body = isRpcError
                    ? 'The amount may be visible on chain. Send anyway?'
                    : 'The amount won\'t be hidden on chain. Send anyway?';
                return new Promise<boolean>((resolve) => {
                    Alert.alert(
                        title,
                        body,
                        [
                            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                            { text: 'Send anyway', style: 'destructive', onPress: () => resolve(true) },
                        ],
                        { cancelable: false },
                    );
                });
            };
            const result = await privateSendFromBurner(
                {
                    burnerId: selectedBurner.id,
                    destinationAddress: privateRecipient,
                    amountLamports: BigInt(amountLamports),
                    onDegradationRequested: askDegradationConsent,
                },
                (e) => setPrivateProgress(e),
            );
            const sig = result.createSignature ?? result.fallbackSignature ?? null;
            setPrivateResultSig(sig);
            const updated = await loadBurners();
            const refreshed = updated.find((b) => b.id === selectedBurner.id);
            if (refreshed) setSelectedBurner(refreshed);
            setPrivateAmount('');
            const modeLabel = result.mode === 'umbra-encrypted'
                ? 'Sent privately — amount and sender hidden'
                : 'Sent — sender hidden, amount visible';
            Alert.alert(
                'Sent',
                `${modeLabel}\n\n${amount} SOL → ${privateRecipient.slice(0, 6)}…${privateRecipient.slice(-6)}`,
                sig
                    ? [
                        { text: 'View on explorer', onPress: () => Linking.openURL(getTxExplorerUrl(sig)) },
                        { text: 'OK', style: 'cancel' },
                      ]
                    : [{ text: 'OK', style: 'cancel' }],
            );
        } catch (err: any) {
            if (err instanceof PrivateSendDegradationDeclined) {
                setPrivateProgress(null);
                return;
            }
            console.error('Private send failed:', err);
            const raw = String(err?.message ?? 'Private send failed');
            const insufficient = raw.match(/insufficient lamports\s+(\d+),\s*need\s+(\d+)/i);
            const friendly = insufficient
                ? (() => {
                    const have = Number(insufficient[1]) / LAMPORTS_PER_SOL;
                    const need = Number(insufficient[2]) / LAMPORTS_PER_SOL;
                    return `Burner only has ${have.toFixed(6)} SOL but the send needs ${need.toFixed(6)} SOL. Lower the amount or top up the burner.`;
                  })()
                : raw.includes('not registered with Umbra')
                    ? raw
                    : raw.length > 240
                        ? `${raw.slice(0, 240)}…`
                        : raw;
            Alert.alert('Failed', friendly);
        } finally {
            setIsPrivateSending(false);
        }
    };

    const handleDestroy = (burner: BurnerWalletWithBalance) => {
        Alert.alert(
            'Destroy Burner',
            `Delete "${burner.label}"?\n\nBalance: ${burner.balance.toFixed(4)} SOL\n\nFunds will be swept to main wallet.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Destroy',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const mainAddress = smartWalletPubkey?.toBase58();
                            await destroyBurner(burner.id, mainAddress, walletId);
                            setBurners((prev) => prev.filter((b) => b.id !== burner.id));
                            Alert.alert('Destroyed', 'Burner deleted');
                        } catch (error: any) {
                            console.error('Destroy failed:', error);
                            Alert.alert('Error', error.message || 'Failed to destroy');
                        }
                    },
                },
            ]
        );
    };

    const copyAddress = async (address: string) => {
        await Clipboard.setStringAsync(address);
        Alert.alert('Copied', 'Address copied');
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.safe}>
                <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
                <ScreenHeader title="Burners" onClose={onBack} />
                <View style={styles.loadingBody}>
                    <ActivityIndicator size="large" color={colors.text} />
                    <Text style={styles.loadingText}>Loading burner wallets...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
            <ScreenHeader title="Burners" onClose={onBack} />
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
                <PrimaryButton
                    label="New burner wallet"
                    onPress={() => setShowCreateModal(true)}
                    fullWidth
                    icon={<Icon name="plus" size={18} color={colors.white} />}
                    style={{ marginBottom: spacing.xxl }}
                />

                <View style={styles.listHeader}>
                    <Text style={styles.sectionTitle}>Your burners</Text>
                    <Pill label={`${burners.length}`} variant="neutral" />
                </View>

                {burners.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>No burner wallets yet. Create one above.</Text>
                    </View>
                ) : (
                    burners.map((burner) => (
                        <View key={burner.id} style={styles.burnerItem}>
                            <View style={styles.burnerHeader}>
                                <Text style={styles.burnerLabel}>{burner.label}</Text>
                                <Pill
                                    label={`${burner.balance.toFixed(4)} SOL`}
                                    variant={burner.balance > 0 ? 'success' : 'neutral'}
                                />
                            </View>

                            <TouchableOpacity onPress={() => copyAddress(burner.publicKey)} activeOpacity={0.7}>
                                <Text style={styles.burnerAddress}>{shortenAddress(burner.publicKey)}</Text>
                            </TouchableOpacity>

                            <View style={styles.burnerActions}>
                                <TouchableOpacity
                                    style={[styles.actionBtn, styles.sendBtn]}
                                    onPress={() => handleOpenSend(burner)}
                                    disabled={burner.balance === 0}
                                    activeOpacity={0.7}
                                >
                                    <Icon name="send" size={16} color={burner.balance === 0 ? colors.textSubtle : colors.white} />
                                    <Text style={[styles.actionBtnText, burner.balance === 0 && { color: colors.textSubtle }]}>Send</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.actionBtn} onPress={() => copyAddress(burner.publicKey)} activeOpacity={0.7}>
                                    <Icon name="copy" size={16} color={colors.text} />
                                    <Text style={styles.actionBtnTextDark}>Receive</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.actionBtn, styles.destroyBtn]}
                                    onPress={() => handleDestroy(burner)}
                                    activeOpacity={0.7}
                                >
                                    <Icon name="close" size={16} color={colors.dangerText} />
                                    <Text style={styles.destroyBtnText}>Destroy</Text>
                                </TouchableOpacity>
                            </View>

                            {UMBRA_FEATURE_ENABLED && (
                                <TouchableOpacity
                                    style={[styles.privateSendBtn, burner.balance === 0 && { opacity: 0.4 }]}
                                    onPress={() => handleOpenPrivateSend(burner)}
                                    disabled={burner.balance === 0}
                                    activeOpacity={0.85}
                                >
                                    <Icon name="lock" size={16} color="#9af09a" />
                                    <Text style={styles.privateSendText}>Private send via Umbra</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))
                )}

            </ScrollView>

            {/* Create Modal */}
            <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
                <TouchableWithoutFeedback onPress={() => setShowCreateModal(false)}>
                    <KeyboardAvoidingView
                        style={styles.modalOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <TouchableWithoutFeedback onPress={() => {}}>
                            <View style={styles.sheet}>
                                <View style={styles.sheetHandle} />
                                <Text style={styles.sheetTitle}>Create burner</Text>

                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Label (e.g. Trading, Airdrop)"
                                    placeholderTextColor={colors.textSubtle}
                                    value={newBurnerLabel}
                                    onChangeText={setNewBurnerLabel}
                                />

                                <PrimaryButton
                                    label={isCreating ? 'Creating...' : 'Create'}
                                    onPress={handleCreateBurner}
                                    loading={isCreating}
                                    fullWidth
                                />

                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreateModal(false)} activeOpacity={0.7}>
                                    <Text style={styles.cancelText}>Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Send Modal */}
            <Modal visible={showSendModal} animationType="slide" transparent onRequestClose={() => setShowSendModal(false)}>
                <TouchableWithoutFeedback onPress={() => setShowSendModal(false)}>
                    <KeyboardAvoidingView
                        style={styles.modalOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <TouchableWithoutFeedback onPress={() => {}}>
                            <View style={styles.sheet}>
                                <View style={styles.sheetHandle} />
                                <Text style={styles.sheetTitle}>Send from burner</Text>
                                <Text style={styles.sheetSub}>{selectedBurner?.label}</Text>
                                <Text style={styles.sheetBalance}>{selectedBurner?.balance.toFixed(4)} SOL</Text>

                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Recipient address"
                                    placeholderTextColor={colors.textSubtle}
                                    value={sendRecipient}
                                    onChangeText={setSendRecipient}
                                    autoCapitalize="none"
                                />

                                <View style={styles.amountRow}>
                                    <TextInput
                                        style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                                        placeholder={`Amount (max ${BURNER_LIMITS.MAX_SEND_SOL} SOL)`}
                                        placeholderTextColor={colors.textSubtle}
                                        value={sendAmount}
                                        onChangeText={setSendAmount}
                                        keyboardType="decimal-pad"
                                    />
                                    <TouchableOpacity
                                        style={styles.maxBtn}
                                        onPress={() => {
                                            if (!selectedBurner) return;
                                            const balanceLamports = Math.floor(selectedBurner.balance * LAMPORTS_PER_SOL);
                                            const maxLamports = Math.max(0, balanceLamports - BURNER_FEE_LAMPORTS);
                                            setSendAmount((maxLamports / LAMPORTS_PER_SOL).toFixed(9));
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.maxBtnText}>Max</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={{ marginTop: spacing.lg }}>
                                    <PrimaryButton
                                        label={isSending ? 'Sending...' : 'Send'}
                                        onPress={handleSend}
                                        loading={isSending}
                                        fullWidth
                                    />
                                </View>

                                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSendModal(false)} activeOpacity={0.7}>
                                    <Text style={styles.cancelText}>Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Private Send Modal */}
            <Modal
                visible={showPrivateSendModal}
                animationType="slide"
                transparent
                onRequestClose={() => !isPrivateSending && setShowPrivateSendModal(false)}
            >
                <TouchableWithoutFeedback onPress={() => !isPrivateSending && setShowPrivateSendModal(false)}>
                    <KeyboardAvoidingView
                        style={styles.modalOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <TouchableWithoutFeedback onPress={() => {}}>
                            <View style={styles.sheet}>
                                <View style={styles.sheetHandle} />
                                <View style={styles.privateBadgeRow}>
                                    <Icon name="lock" size={16} color={colors.text} />
                                    <Text style={styles.sheetTitle}>Private send</Text>
                                </View>
                                <Text style={styles.sheetSub}>{selectedBurner?.label} → encrypted UTXO</Text>
                                <Text style={styles.sheetBalance}>{selectedBurner?.balance.toFixed(4)} SOL</Text>
                                <Text style={styles.privateHint}>
                                    On-chain link between burner and recipient is broken. Recipient claims into their
                                    encrypted balance with their passkey. Devnet uses WSOL (auto-wrapped). First send
                                    from this burner runs a 2-tx Umbra registration.
                                </Text>

                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Recipient address (Solana)"
                                    placeholderTextColor={colors.textSubtle}
                                    value={privateRecipient}
                                    onChangeText={setPrivateRecipient}
                                    autoCapitalize="none"
                                    editable={!isPrivateSending}
                                />

                                <View style={styles.amountRow}>
                                    <TextInput
                                        style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                                        placeholder={`Amount (max ${BURNER_LIMITS.MAX_SEND_SOL} SOL)`}
                                        placeholderTextColor={colors.textSubtle}
                                        value={privateAmount}
                                        onChangeText={setPrivateAmount}
                                        keyboardType="decimal-pad"
                                        editable={!isPrivateSending}
                                    />
                                    <TouchableOpacity
                                        style={styles.maxBtn}
                                        onPress={() => {
                                            if (!selectedBurner) return;
                                            const balanceLamports = Math.floor(selectedBurner.balance * LAMPORTS_PER_SOL);
                                            const maxLamports = Math.max(0, balanceLamports - 30000);
                                            setPrivateAmount((maxLamports / LAMPORTS_PER_SOL).toFixed(9));
                                        }}
                                        disabled={isPrivateSending}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.maxBtnText}>Max</Text>
                                    </TouchableOpacity>
                                </View>

                                {privateProgress && (
                                    <View style={styles.progressBox}>
                                        <Text style={styles.progressTitle}>
                                            {privateProgress.stage === 'preparing' && 'Getting ready…'}
                                            {privateProgress.stage === 'checking-recipient' && 'Checking if recipient supports private receiving…'}
                                            {privateProgress.stage === 'registering-burner' && 'Setting up your private account (one-time)…'}
                                            {privateProgress.stage === 'register-step' && (privateProgress.detail ?? 'Setting up…')}
                                            {privateProgress.stage === 'creating-utxo' && 'Encrypting your transfer…'}
                                            {privateProgress.stage === 'fallback-burner-transfer' && 'Recipient isn\'t on Umbra — sending normally (amount will be visible)…'}
                                            {privateProgress.stage === 'success' && (
                                              privateProgress.mode === 'burner-fallback'
                                                ? 'Sent — sender hidden, amount visible'
                                                : 'Sent privately — amount and sender hidden'
                                            )}
                                        </Text>
                                        {privateProgress.signature && (
                                            <TouchableOpacity onPress={() => Linking.openURL(getTxExplorerUrl(privateProgress.signature!))}>
                                                <Text style={styles.progressSig}>{privateProgress.signature.slice(0, 12)}…{privateProgress.signature.slice(-8)} ↗</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}

                                {privateResultSig && (
                                    <TouchableOpacity
                                        style={styles.resultRow}
                                        onPress={() => Linking.openURL(getTxExplorerUrl(privateResultSig))}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.resultLabel}>
                                            {privateProgress?.mode === 'burner-fallback' ? 'Transfer' : 'Private transfer'}
                                        </Text>
                                        <Text style={styles.resultSig}>{privateResultSig.slice(0, 12)}…{privateResultSig.slice(-8)} ↗</Text>
                                    </TouchableOpacity>
                                )}

                                <View style={{ marginTop: spacing.lg }}>
                                    <PrimaryButton
                                        label={isPrivateSending ? 'Sending privately...' : 'Send privately'}
                                        onPress={handlePrivateSend}
                                        loading={isPrivateSending}
                                        fullWidth
                                    />
                                </View>

                                <TouchableOpacity
                                    style={styles.cancelBtn}
                                    onPress={() => setShowPrivateSendModal(false)}
                                    disabled={isPrivateSending}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.cancelText}>{privateResultSig ? 'Done' : 'Cancel'}</Text>
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

    warningCard: {
        backgroundColor: colors.warningBg,
        borderRadius: radii.lg,
        padding: spacing.lg,
        marginBottom: spacing.lg,
    },
    warningHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    warningTitle: {
        fontSize: 16,
        fontWeight: '600' as const,
        color: colors.warningText,
    },
    warningText: {
        fontSize: 14,
        color: '#7C5611',
        lineHeight: 20,
        marginBottom: 6,
    },
    warningNote: {
        fontSize: 13,
        color: '#7C5611',
        fontStyle: 'italic',
    },

    listHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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

    burnerItem: {
        backgroundColor: colors.surface,
        borderRadius: radii.lg,
        padding: spacing.lg,
        marginBottom: spacing.md,
    },
    burnerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    burnerLabel: {
        ...typography.heading,
    },
    burnerAddress: {
        fontSize: 13,
        color: colors.textMuted,
        marginBottom: spacing.md,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    },
    burnerActions: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: spacing.md,
        borderRadius: radii.sm,
        backgroundColor: colors.bg,
    },
    sendBtn: {
        backgroundColor: colors.text,
    },
    actionBtnText: {
        fontSize: 13,
        fontWeight: '600' as const,
        color: colors.white,
    },
    actionBtnTextDark: {
        fontSize: 13,
        fontWeight: '600' as const,
        color: colors.text,
    },
    destroyBtn: {
        backgroundColor: colors.dangerBg,
    },
    destroyBtnText: {
        fontSize: 13,
        fontWeight: '600' as const,
        color: colors.dangerText,
    },
    privateSendBtn: {
        marginTop: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#0E0E0E',
        borderRadius: radii.sm,
        paddingVertical: spacing.md,
    },
    privateSendText: {
        color: '#9af09a',
        fontSize: 13,
        fontWeight: '600' as const,
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
    },

    // Modals (bottom sheets)
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
    },
    sheetBalance: {
        fontSize: 24,
        fontWeight: '700' as const,
        color: colors.text,
        textAlign: 'center',
        marginVertical: spacing.lg,
    },
    privateBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
    },
    privateHint: {
        fontSize: 12,
        color: colors.textMuted,
        lineHeight: 18,
        marginTop: spacing.md,
        marginBottom: spacing.md,
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
    amountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    maxBtn: {
        paddingHorizontal: spacing.lg,
        paddingVertical: 18,
        backgroundColor: colors.text,
        borderRadius: radii.md,
    },
    maxBtnText: {
        fontSize: 13,
        fontWeight: '600' as const,
        color: colors.white,
    },
    progressBox: {
        backgroundColor: '#0E0E0E',
        borderRadius: radii.sm,
        padding: spacing.md,
        marginTop: spacing.sm,
        marginBottom: spacing.md,
    },
    progressTitle: {
        color: '#9af09a',
        fontSize: 12,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
        lineHeight: 17,
    },
    progressSig: {
        color: '#9bb6ff',
        fontSize: 11,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
        marginTop: 4,
    },
    resultRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        marginBottom: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    resultLabel: {
        fontSize: 13,
        color: colors.textMuted,
    },
    resultSig: {
        fontSize: 13,
        color: colors.accent,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
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
