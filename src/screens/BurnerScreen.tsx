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

    // Create modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newBurnerLabel, setNewBurnerLabel] = useState('');

    // Send modal
    const [showSendModal, setShowSendModal] = useState(false);
    const [selectedBurner, setSelectedBurner] = useState<BurnerWalletWithBalance | null>(null);
    const [sendRecipient, setSendRecipient] = useState('');
    const [sendAmount, setSendAmount] = useState('');
    const [isSending, setIsSending] = useState(false);

    // Private (Umbra) send modal
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
        // Reserve a bigger buffer than a regular send: register (2 txs) +
        // create-utxo can land 3 fees if the burner isn't registered yet.
        const balanceLamports = Math.floor(selectedBurner.balance * LAMPORTS_PER_SOL);
        const amountLamports = Math.round(amount * LAMPORTS_PER_SOL);
        const feeReserve = 30000; // ~6x base fee — covers registration + create
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
            // Refresh balances + re-pin selectedBurner to the fresh row so a
            // follow-up send sees the post-transfer balance, not the stale one.
            const updated = await loadBurners();
            const refreshed = updated.find((b) => b.id === selectedBurner.id);
            if (refreshed) setSelectedBurner(refreshed);
            // Clear the amount so a double-tap can't accidentally re-send the
            // same value against a now-smaller balance.
            setPrivateAmount('');
            const modeLabel = result.mode === 'umbra-encrypted'
                ? 'Encrypted private send'
                : 'Burner-fallback send (sender hidden, amount visible)';
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
            // User declined the privacy-degradation prompt — treat as a clean
            // cancel, not an error. Reset progress so the modal doesn't sit on
            // a stale "Checking…" line.
            if (err instanceof PrivateSendDegradationDeclined) {
                setPrivateProgress(null);
                return;
            }
            console.error('Private send failed:', err);
            const raw = String(err?.message ?? 'Private send failed');
            // Map the raw on-chain dump to something a human can act on.
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
            <View style={styles.loading}>
                <ActivityIndicator size="large" color="#000" />
                <Text style={styles.loadingText}>Loading burner wallets...</Text>
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
                <Text style={styles.headerTitle}>Burners</Text>
                <TouchableOpacity onPress={handleRefresh} disabled={isRefreshing} style={styles.refreshIcon}>
                    {isRefreshing ? (
                        <ActivityIndicator size="small" color="#000" />
                    ) : (
                        <Text style={styles.refreshIconText}>↻</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Warning Card */}
            <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>Isolated Wallets</Text>
                <Text style={styles.warningText}>
                    Burner wallets are completely separate identities with no on-chain link to your main
                    wallet. They require SOL for gas fees.
                </Text>
                <Text style={styles.warningNote}>
                    For true privacy, fund from an external source (not your main wallet).
                </Text>
            </View>

            {/* Create Button */}
            <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)}>
                <Text style={styles.createButtonText}>New Burner Wallet</Text>
                <Text style={styles.createButtonSub}>Create a disposable identity</Text>
            </TouchableOpacity>

            {/* Burner List */}
            <View style={styles.burnerList}>
                <Text style={styles.sectionTitle}>Your Burners ({burners.length})</Text>

                {burners.length === 0 ? (
                    <Text style={styles.emptyText}>No burner wallets yet. Create one above.</Text>
                ) : (
                    burners.map((burner) => (
                        <View key={burner.id} style={styles.burnerItem}>
                            <View style={styles.burnerHeader}>
                                <Text style={styles.burnerLabel}>{burner.label}</Text>
                                <Text style={styles.burnerBalance}>{burner.balance.toFixed(4)} SOL</Text>
                            </View>

                            <TouchableOpacity onPress={() => copyAddress(burner.publicKey)}>
                                <Text style={styles.burnerAddress}>{shortenAddress(burner.publicKey)}</Text>
                            </TouchableOpacity>

                            <View style={styles.burnerActions}>
                                <TouchableOpacity
                                    style={[styles.actionButton, styles.sendButton]}
                                    onPress={() => handleOpenSend(burner)}
                                    disabled={burner.balance === 0}
                                >
                                    <Text style={styles.actionButtonText}>Send</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.actionButton} onPress={() => copyAddress(burner.publicKey)}>
                                    <Text style={styles.actionButtonTextDark}>Receive</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.actionButton, styles.destroyButton]}
                                    onPress={() => handleDestroy(burner)}
                                >
                                    <Text style={styles.destroyButtonText}>Destroy</Text>
                                </TouchableOpacity>
                            </View>

                            {UMBRA_FEATURE_ENABLED && (
                                <TouchableOpacity
                                    style={[styles.privateSendButton, burner.balance === 0 && styles.buttonDisabled]}
                                    onPress={() => handleOpenPrivateSend(burner)}
                                    disabled={burner.balance === 0}
                                >
                                    <Text style={styles.privateSendText}>Private Send (Umbra)</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))
                )}
            </View>

            {/* Limits Info */}
            <View style={styles.limitsCard}>
                <Text style={styles.limitsTitle}>Limits</Text>
                <Text style={styles.limitsText}>Max per transaction: {BURNER_LIMITS.MAX_SEND_SOL} SOL</Text>
            </View>

            {/* Create Modal */}
            <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
                <TouchableWithoutFeedback onPress={() => setShowCreateModal(false)}>
                    <KeyboardAvoidingView
                        style={styles.modalOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <TouchableWithoutFeedback onPress={() => {}}>
                            <View style={styles.modalContent}>
                                <Text style={styles.modalTitle}>Create Burner</Text>

                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Label (e.g., Trading, Airdrop)"
                                    placeholderTextColor="#999"
                                    value={newBurnerLabel}
                                    onChangeText={setNewBurnerLabel}
                                />

                                <TouchableOpacity
                                    style={[styles.modalButton, isCreating && styles.buttonDisabled]}
                                    onPress={handleCreateBurner}
                                    disabled={isCreating}
                                >
                                    {isCreating ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.modalButtonText}>Create</Text>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.closeButton} onPress={() => setShowCreateModal(false)}>
                                    <Text style={styles.closeButtonText}>Cancel</Text>
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
                            <View style={styles.modalContent}>
                                <Text style={styles.modalTitle}>Send from Burner</Text>
                                <Text style={styles.modalSubtitle}>{selectedBurner?.label}</Text>
                                <Text style={styles.modalBalance}>Balance: {selectedBurner?.balance.toFixed(4)} SOL</Text>

                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Recipient address"
                                    placeholderTextColor="#999"
                                    value={sendRecipient}
                                    onChangeText={setSendRecipient}
                                    autoCapitalize="none"
                                />

                                <View style={styles.amountRow}>
                                    <TextInput
                                        style={[styles.modalInput, styles.amountInput]}
                                        placeholder={`Amount (max ${BURNER_LIMITS.MAX_SEND_SOL} SOL)`}
                                        placeholderTextColor="#999"
                                        value={sendAmount}
                                        onChangeText={setSendAmount}
                                        keyboardType="decimal-pad"
                                    />
                                    <TouchableOpacity
                                        style={styles.maxButton}
                                        onPress={() => {
                                            if (!selectedBurner) return;
                                            const balanceLamports = Math.floor(selectedBurner.balance * LAMPORTS_PER_SOL);
                                            const maxLamports = Math.max(0, balanceLamports - BURNER_FEE_LAMPORTS);
                                            setSendAmount((maxLamports / LAMPORTS_PER_SOL).toFixed(9));
                                        }}
                                    >
                                        <Text style={styles.maxButtonText}>Max</Text>
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    style={[styles.modalButton, isSending && styles.buttonDisabled]}
                                    onPress={handleSend}
                                    disabled={isSending}
                                >
                                    {isSending ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.modalButtonText}>Send</Text>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.closeButton} onPress={() => setShowSendModal(false)}>
                                    <Text style={styles.closeButtonText}>Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </TouchableWithoutFeedback>
            </Modal>
            {/* Private Send (Umbra) Modal */}
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
                            <View style={styles.modalContent}>
                                <Text style={styles.modalTitle}>Private Send</Text>
                                <Text style={styles.modalSubtitle}>{selectedBurner?.label} → encrypted UTXO</Text>
                                <Text style={styles.modalBalance}>Balance: {selectedBurner?.balance.toFixed(4)} SOL</Text>
                                <Text style={styles.privateHint}>
                                    On-chain link between burner and recipient is broken. Recipient claims into their
                                    encrypted balance with their passkey. Devnet uses WSOL (auto-wrapped). First send
                                    from this burner runs a 2-tx Umbra registration.
                                </Text>

                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="Recipient address (Solana)"
                                    placeholderTextColor="#999"
                                    value={privateRecipient}
                                    onChangeText={setPrivateRecipient}
                                    autoCapitalize="none"
                                    editable={!isPrivateSending}
                                />

                                <View style={styles.amountRow}>
                                    <TextInput
                                        style={[styles.modalInput, styles.amountInput]}
                                        placeholder={`Amount (max ${BURNER_LIMITS.MAX_SEND_SOL} SOL)`}
                                        placeholderTextColor="#999"
                                        value={privateAmount}
                                        onChangeText={setPrivateAmount}
                                        keyboardType="decimal-pad"
                                        editable={!isPrivateSending}
                                    />
                                    <TouchableOpacity
                                        style={styles.maxButton}
                                        onPress={() => {
                                            if (!selectedBurner) return;
                                            const balanceLamports = Math.floor(selectedBurner.balance * LAMPORTS_PER_SOL);
                                            const maxLamports = Math.max(0, balanceLamports - 30000);
                                            setPrivateAmount((maxLamports / LAMPORTS_PER_SOL).toFixed(9));
                                        }}
                                        disabled={isPrivateSending}
                                    >
                                        <Text style={styles.maxButtonText}>Max</Text>
                                    </TouchableOpacity>
                                </View>

                                {privateProgress && (
                                    <View style={styles.privateProgressBox}>
                                        <Text style={styles.privateProgressTitle}>
                                            {privateProgress.stage === 'preparing' && 'Preparing burner signer…'}
                                            {privateProgress.stage === 'checking-recipient' && 'Checking recipient privacy support…'}
                                            {privateProgress.stage === 'registering-burner' && 'Registering burner with Umbra…'}
                                            {privateProgress.stage === 'register-step' && (privateProgress.detail ?? 'register step')}
                                            {privateProgress.stage === 'creating-utxo' && 'Creating encrypted UTXO…'}
                                            {privateProgress.stage === 'fallback-burner-transfer' && 'Recipient not on Umbra → sending via burner (sender hidden, amount visible)…'}
                                            {privateProgress.stage === 'success' && (
                                              privateProgress.mode === 'burner-fallback'
                                                ? 'Burner-fallback send confirmed'
                                                : 'Encrypted private send confirmed'
                                            )}
                                        </Text>
                                        {privateProgress.signature && (
                                            <TouchableOpacity onPress={() => Linking.openURL(getTxExplorerUrl(privateProgress.signature!))}>
                                                <Text style={styles.privateProgressSig}>{privateProgress.signature.slice(0, 12)}…{privateProgress.signature.slice(-8)} ↗</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}

                                {privateResultSig && (
                                    <TouchableOpacity
                                        style={styles.privateResultRow}
                                        onPress={() => Linking.openURL(getTxExplorerUrl(privateResultSig))}
                                    >
                                        <Text style={styles.privateResultLabel}>
                                            {privateProgress?.mode === 'burner-fallback' ? 'Transfer sig' : 'UTXO sig'}
                                        </Text>
                                        <Text style={styles.privateResultSig}>{privateResultSig.slice(0, 12)}…{privateResultSig.slice(-8)} ↗</Text>
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity
                                    style={[styles.modalButton, isPrivateSending && styles.buttonDisabled]}
                                    onPress={handlePrivateSend}
                                    disabled={isPrivateSending}
                                >
                                    {isPrivateSending ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.modalButtonText}>Send Privately</Text>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.closeButton}
                                    onPress={() => setShowPrivateSendModal(false)}
                                    disabled={isPrivateSending}
                                >
                                    <Text style={styles.closeButtonText}>{privateResultSig ? 'Done' : 'Cancel'}</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
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
    warningCard: {
        backgroundColor: '#fef2f2',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    warningTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#b91c1c',
        marginBottom: 8,
    },
    warningText: {
        fontSize: 14,
        color: '#7f1d1d',
        lineHeight: 20,
        marginBottom: 8,
    },
    warningNote: {
        fontSize: 13,
        color: '#991b1b',
        fontStyle: 'italic',
    },
    createButton: {
        backgroundColor: '#000',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    createButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    createButtonSub: {
        fontSize: 13,
        color: '#999',
        marginTop: 4,
    },
    burnerList: {
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
    burnerItem: {
        backgroundColor: '#fafafa',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    burnerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    burnerLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000',
    },
    burnerBalance: {
        fontSize: 15,
        fontWeight: '500',
        color: '#22c55e',
    },
    burnerAddress: {
        fontSize: 14,
        color: '#666',
        marginBottom: 12,
    },
    burnerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        backgroundColor: '#f0f0f0',
    },
    sendButton: {
        backgroundColor: '#000',
    },
    actionButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    actionButtonTextDark: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000',
    },
    destroyButton: {
        backgroundColor: '#fee2e2',
    },
    destroyButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#dc2626',
    },
    privateSendButton: {
        marginTop: 10,
        backgroundColor: '#0e0e0e',
        borderRadius: 10,
        paddingVertical: 11,
        alignItems: 'center',
    },
    privateSendText: {
        color: '#9af09a',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    privateHint: {
        fontSize: 11,
        color: '#666',
        lineHeight: 16,
        marginBottom: 14,
    },
    privateProgressBox: {
        backgroundColor: '#0e0e0e',
        borderRadius: 8,
        padding: 10,
        marginTop: 4,
        marginBottom: 10,
    },
    privateProgressTitle: {
        color: '#9af09a',
        fontSize: 12,
        fontFamily: 'Menlo',
    },
    privateProgressSig: {
        color: '#9bb6ff',
        fontSize: 11,
        fontFamily: 'Menlo',
        marginTop: 4,
    },
    privateResultRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        marginBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    privateResultLabel: { fontSize: 12, color: '#555' },
    privateResultSig: { fontSize: 12, color: '#7c3aed', fontFamily: 'Menlo' },
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
    modalSubtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
    modalBalance: {
        fontSize: 16,
        fontWeight: '500',
        color: '#22c55e',
        textAlign: 'center',
        marginBottom: 20,
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
    amountRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    amountInput: {
        flex: 1,
    },
    maxButton: {
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: '#f0f0f0',
        borderRadius: 10,
    },
    maxButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000',
    },
    modalButton: {
        backgroundColor: '#000',
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    modalButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    closeButton: {
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    closeButtonText: {
        fontSize: 16,
        color: '#666',
    },
});
