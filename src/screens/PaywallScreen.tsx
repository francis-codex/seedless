import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Modal,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import * as Linking from 'expo-linking';

import {
    ContentItem,
    DEMO_CONTENT,
    X402_LIMITS,
    formatPaymentAmount,
    createPaymentInstruction,
} from '../utils/x402';
import { CLUSTER_SIMULATION, IS_DEVNET } from '../constants';

interface PaywallScreenProps {
    onBack: () => void;
}

export function PaywallScreen({ onBack }: PaywallScreenProps) {
    const { smartWalletPubkey, signAndSendTransaction, isSigning } = useWallet();

    const [content, setContent] = useState<ContentItem[]>(DEMO_CONTENT);
    const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showContentModal, setShowContentModal] = useState(false);
    const [isPaying, setIsPaying] = useState(false);

    const handleContentPress = (item: ContentItem) => {
        if (item.isPaid) {
            setSelectedItem(item);
            setShowContentModal(true);
        } else {
            setSelectedItem(item);
            setShowPaymentModal(true);
        }
    };

    const handlePay = async () => {
        if (!smartWalletPubkey || !selectedItem) return;

        const amount = parseFloat(selectedItem.price);
        if (amount > X402_LIMITS.MAX_PAYMENT_SOL) {
            Alert.alert('Limit Exceeded', `Max payment is ${X402_LIMITS.MAX_PAYMENT_SOL} SOL for testing`);
            return;
        }

        setIsPaying(true);
        try {
            const paymentInstruction = createPaymentInstruction(smartWalletPubkey, {
                scheme: 'exact',
                network: 'solana',
                maxAmountRequired: selectedItem.price,
                resource: `/content/${selectedItem.id}`,
                payTo: 'GkXn6PUbcvpwAzVAP16bLjpMvjYXGsmQJwY1bL5X8VTr',
                asset: selectedItem.asset,
            });

            const redirectUrl = Linking.createURL('paywall-callback');

            const signature = await signAndSendTransaction(
                {
                    instructions: [paymentInstruction],
                    transactionOptions: {
                        clusterSimulation: CLUSTER_SIMULATION as 'mainnet' | 'devnet',
                    },
                },
                {
                    redirectUrl,
                    onSuccess: () => {
                        // Mark content as paid
                        setContent(prev =>
                            prev.map(c =>
                                c.id === selectedItem.id ? { ...c, isPaid: true } : c
                            )
                        );
                        setShowPaymentModal(false);
                        setShowContentModal(true);
                        Alert.alert('Unlocked!', 'Content is now available');
                    },
                    onFail: (error) => {
                        Alert.alert('Payment Failed', error.message);
                    },
                }
            );

            console.log('Payment signature:', signature);
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Payment failed');
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>X402 Paywall</Text>
                <View style={{ width: 50 }} />
            </View>

            <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>HTTP 402 Payment Required</Text>
                <Text style={styles.infoText}>
                    X402 enables micropayments for web content. Pay only for what you read using your passkey wallet.
                </Text>
                <Text style={styles.infoNote}>
                    Demo: Payments go through LazorKit's gasless flow
                </Text>
            </View>

            <Text style={styles.sectionTitle}>Premium Content</Text>

            {content.map((item) => (
                <TouchableOpacity
                    key={item.id}
                    style={styles.contentCard}
                    onPress={() => handleContentPress(item)}
                >
                    <View style={styles.contentHeader}>
                        <Text style={styles.contentTitle}>{item.title}</Text>
                        {item.isPaid ? (
                            <View style={styles.unlockedBadge}>
                                <Text style={styles.unlockedText}>Unlocked</Text>
                            </View>
                        ) : (
                            <View style={styles.priceBadge}>
                                <Text style={styles.priceText}>
                                    {formatPaymentAmount(item.price, item.asset)}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.previewText}>{item.preview}</Text>
                    <Text style={styles.tapHint}>
                        {item.isPaid ? 'Tap to read' : 'Tap to unlock'}
                    </Text>
                </TouchableOpacity>
            ))}

            <View style={styles.limitsCard}>
                <Text style={styles.limitsTitle}>Testing Limits</Text>
                <Text style={styles.limitsText}>
                    Max payment: {X402_LIMITS.MAX_PAYMENT_SOL} SOL
                </Text>
            </View>

            {/* Payment Modal */}
            <Modal visible={showPaymentModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Unlock Content</Text>
                        <Text style={styles.modalSubtitle}>{selectedItem?.title}</Text>

                        <View style={styles.paymentDetails}>
                            <Text style={styles.paymentLabel}>Price</Text>
                            <Text style={styles.paymentAmount}>
                                {selectedItem && formatPaymentAmount(selectedItem.price, selectedItem.asset)}
                            </Text>
                        </View>

                        <View style={styles.flowExplainer}>
                            <Text style={styles.flowTitle}>How it works:</Text>
                            <Text style={styles.flowStep}>1. Server returns 402 Payment Required</Text>
                            <Text style={styles.flowStep}>2. You pay with passkey (gasless)</Text>
                            <Text style={styles.flowStep}>3. Content is unlocked instantly</Text>
                        </View>

                        <TouchableOpacity
                            style={[styles.payButton, (isPaying || isSigning) && styles.buttonDisabled]}
                            onPress={handlePay}
                            disabled={isPaying || isSigning}
                        >
                            {isPaying || isSigning ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.payButtonText}>Pay with Passkey</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => setShowPaymentModal(false)}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Content Modal */}
            <Modal visible={showContentModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.contentModalContent}>
                        <Text style={styles.modalTitle}>{selectedItem?.title}</Text>

                        <ScrollView style={styles.fullContentScroll}>
                            <Text style={styles.fullContent}>{selectedItem?.fullContent}</Text>
                        </ScrollView>

                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => setShowContentModal(false)}
                        >
                            <Text style={styles.closeButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
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
    infoCard: {
        backgroundColor: '#f0f9ff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0369a1',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 14,
        color: '#075985',
        lineHeight: 20,
        marginBottom: 8,
    },
    infoNote: {
        fontSize: 13,
        color: '#0284c7',
        fontStyle: 'italic',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#000',
        marginBottom: 16,
    },
    contentCard: {
        backgroundColor: '#fafafa',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    contentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    contentTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#000',
        flex: 1,
        marginRight: 12,
    },
    priceBadge: {
        backgroundColor: '#000',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    priceText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    unlockedBadge: {
        backgroundColor: '#dcfce7',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    unlockedText: {
        color: '#16a34a',
        fontSize: 12,
        fontWeight: '600',
    },
    previewText: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
        marginBottom: 8,
    },
    tapHint: {
        fontSize: 13,
        color: '#999',
        fontStyle: 'italic',
    },
    limitsCard: {
        backgroundColor: '#fef3c7',
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
    },
    limitsTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#92400e',
        marginBottom: 4,
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
    contentModalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        maxHeight: '80%',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#000',
        textAlign: 'center',
        marginBottom: 4,
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginBottom: 20,
    },
    paymentDetails: {
        backgroundColor: '#f5f5f5',
        borderRadius: 10,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    paymentLabel: {
        fontSize: 14,
        color: '#666',
    },
    paymentAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: '#000',
    },
    flowExplainer: {
        backgroundColor: '#fafafa',
        borderRadius: 10,
        padding: 14,
        marginBottom: 20,
    },
    flowTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    flowStep: {
        fontSize: 12,
        color: '#666',
        marginBottom: 4,
    },
    payButton: {
        backgroundColor: '#000',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    payButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    cancelButton: {
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    cancelText: {
        color: '#666',
        fontSize: 16,
    },
    fullContentScroll: {
        maxHeight: 400,
        marginVertical: 16,
    },
    fullContent: {
        fontSize: 15,
        color: '#333',
        lineHeight: 24,
    },
    closeButton: {
        backgroundColor: '#000',
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
