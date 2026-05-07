import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import {
  getStoredSignerAndClient,
  resetThrowawaySigner,
  runHelloWorldRegistration,
  type RegistrationProgress,
  type RegistrationStep,
} from '../umbra/registration';
import { depositToEncryptedBalance } from '../umbra/deposit';
import { withdrawToPublicBalance } from '../umbra/withdraw';
import { createReceiverClaimableFromPublicBalance, scanClaimableUtxosAcrossTrees } from '../umbra/utxo';
import { claimReceiverClaimableUtxosToEncryptedBalance } from '../umbra/claim';
import type { ScannedUtxoData } from '@umbra-privacy/sdk/interfaces';
import { getTxExplorerUrl, getAccountExplorerUrl, UMBRA_TEST_MINT_DEVNET } from '../constants';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { colors, radii, spacing, typography } from '../theme';
import { ScreenHeader, PrimaryButton, Pill, Icon } from '../components/ui';

interface UmbraDebugScreenProps {
  onBack: () => void;
}

type RunState = 'idle' | 'running' | 'success' | 'error';
type OpId = 'deposit' | 'withdraw' | 'create-utxo' | 'scan-utxo' | 'claim-utxo';

interface OpState {
  status: RunState;
  message?: string;
  signatures?: { label: string; signature: string }[];
}

const PHASE2_AMOUNT_LAMPORTS = 1_000_000n;
const SOL_DISPLAY = '0.001 SOL';

const STEP_LABEL: Record<RegistrationStep, string> = {
  userAccountInitialisation: 'Creating your private address (1/3)',
  registerX25519PublicKey: 'Linking your wallet (2/3)',
  registerUserForAnonymousUsage: 'Turning on private mode (3/3)',
};

function fmtTime() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shortSig(sig: string) {
  return `${sig.slice(0, 8)}…${sig.slice(-6)}`;
}

function unwrapErrorDetail(err: unknown): string {
  const parts: string[] = [];
  let cur: any = err;
  let depth = 0;
  while (cur && depth < 6) {
    const msg = cur.message ?? cur.toString?.();
    if (msg && !parts.includes(msg)) parts.push(msg);
    const ctx = cur.context;
    if (ctx) {
      if (Array.isArray(ctx.logs) && ctx.logs.length) {
        parts.push('logs:\n' + ctx.logs.slice(-8).join('\n'));
      }
      if (typeof ctx.errorName === 'string') parts.push(`errorName: ${ctx.errorName}`);
      if (ctx.code != null) parts.push(`code: ${ctx.code}`);
      if (ctx.InstructionError) parts.push(`InstructionError: ${JSON.stringify(ctx.InstructionError)}`);
    }
    cur = cur.cause;
    depth += 1;
  }
  return parts.join('\n\n') || String(err);
}

function friendlyError(detail: string): string {
  const lamportMatch = detail.match(/insufficient lamports (\d+),?\s*need\s*(\d+)/i);
  if (lamportMatch) {
    const have = Number(lamportMatch[1]) / 1e9;
    const need = Number(lamportMatch[2]) / 1e9;
    const recommend = Math.max(0.01, Math.ceil(need * 1e3) / 1e3 + 0.005);
    return `Your private address needs more SOL.\n\nFunded: ${have.toFixed(4)} SOL\nNeeded: ${need.toFixed(4)} SOL\n\nSend at least ${recommend.toFixed(3)} SOL to the private address shown above, then tap "Refresh private mode".`;
  }
  if (/timed out/i.test(detail)) {
    return 'Setup timed out. Check your connection and tap "Refresh private mode".';
  }
  return detail;
}

export function UmbraDebugScreen({ onBack }: UmbraDebugScreenProps) {
  const [runState, setRunState] = useState<RunState>('idle');
  const [signerAddress, setSignerAddress] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [signatures, setSignatures] = useState<{ step: RegistrationStep; signature: string }[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, `[${fmtTime()}] ${line}`]);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const handleProgress = useCallback((event: RegistrationProgress) => {
    switch (event.stage) {
      case 'signer-created':
        setSignerAddress(event.address);
        appendLog(`Private address ${event.reused ? 'loaded' : 'ready'}`);
        break;
      case 'client-built':
        appendLog('Connected');
        break;
      case 'prover-ready':
        appendLog('Encryption ready');
        break;
      case 'registering':
        appendLog('Turning on private mode…');
        break;
      case 'step-pre':
        appendLog(`→ ${STEP_LABEL[event.step]}`);
        break;
      case 'step-post':
        appendLog(`✓ ${STEP_LABEL[event.step]}`);
        setSignatures((prev) => [...prev, { step: event.step, signature: event.signature }]);
        break;
      case 'success':
        appendLog(`Private mode is on`);
        break;
    }
  }, [appendLog]);

  const handleRun = useCallback(async () => {
    setRunState('running');
    setLogs([]);
    setSignatures([]);
    setErrorMessage(null);
    const timeoutMs = 90_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`registration timed out after ${timeoutMs / 1000}s`)), timeoutMs),
    );
    try {
      const result: any = await Promise.race([
        runHelloWorldRegistration(handleProgress),
        timeoutPromise,
      ]);
      try {
        const sdk: any = await import('@umbra-privacy/sdk');
        const deriver = sdk.getMasterViewingKeyX25519KeypairDeriver({ client: result.client });
        const derivedKp = await deriver();
        const derived = Array.from(derivedKp?.x25519Keypair?.publicKey ?? []);
        const querier = sdk.getUserAccountQuerierFunction({ client: result.client });
        const onChain = await querier(result.signer.address as any);
        const onChainPub = Array.from((onChain as any)?.data?.x25519PublicKey ?? []);
        const match = derived.length === onChainPub.length && derived.every((v, i) => v === onChainPub[i]);
        if (!match) {
          appendLog('⚠ Something did not sync — tap "Start over" and try again');
        } else {
          appendLog('✓ Private mode verified');
        }
      } catch (e) {
        console.warn('[umbra] viewing-key check skipped:', (e as any)?.message ?? e);
      }
      setRunState('success');
    } catch (err: any) {
      const detail = unwrapErrorDetail(err);
      const friendly = friendlyError(detail);
      appendLog(`Failed · ${friendly}`);
      setErrorMessage(friendly);
      setRunState('error');
    }
  }, [handleProgress, appendLog]);

  const handleResetSigner = useCallback(async () => {
    await resetThrowawaySigner();
    setSignerAddress(null);
    setSignatures([]);
    setErrorMessage(null);
    appendLog('Private mode reset. Tap "Turn on private mode" to start again.');
  }, [appendLog]);

  const [ops, setOps] = useState<Record<OpId, OpState>>({
    'deposit': { status: 'idle' },
    'withdraw': { status: 'idle' },
    'create-utxo': { status: 'idle' },
    'scan-utxo': { status: 'idle' },
    'claim-utxo': { status: 'idle' },
  });
  const [scannedUtxos, setScannedUtxos] = useState<readonly ScannedUtxoData[]>([]);

  const setOp = useCallback((id: OpId, patch: Partial<OpState>) => {
    setOps((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const runOp = useCallback(async (id: OpId, fn: () => Promise<{ message: string; signatures?: { label: string; signature: string }[] }>) => {
    setOp(id, { status: 'running', message: undefined, signatures: undefined });
    appendLog(`▶ Running…`);
    try {
      const out = await fn();
      setOp(id, { status: 'success', message: out.message, signatures: out.signatures });
      appendLog(`✓ ${out.message}`);
    } catch (err: any) {
      const detail = unwrapErrorDetail(err);
      const friendly = friendlyError(detail);
      setOp(id, { status: 'error', message: friendly });
      appendLog(`✗ Failed · ${friendly}`);
    }
  }, [appendLog, setOp]);

  const handleDeposit = useCallback(() => {
    runOp('deposit', async () => {
      const { signer, client } = await getStoredSignerAndClient();
      const result = await depositToEncryptedBalance({
        client,
        destinationAddress: signer.address,
        mint: UMBRA_TEST_MINT_DEVNET,
        amount: PHASE2_AMOUNT_LAMPORTS,
      });
      const sigs: { label: string; signature: string }[] = [
        { label: 'queue', signature: result.queueSignature },
      ];
      if (result.callbackSignature) sigs.push({ label: 'callback', signature: result.callbackSignature });
      return { message: `Moved ${SOL_DISPLAY} into private balance`, signatures: sigs };
    });
  }, [runOp]);

  const handleWithdraw = useCallback(() => {
    runOp('withdraw', async () => {
      const { signer, client } = await getStoredSignerAndClient();
      const ata = getAssociatedTokenAddressSync(
        new PublicKey(UMBRA_TEST_MINT_DEVNET),
        new PublicKey(signer.address),
        true,
      ).toBase58();
      const result = await withdrawToPublicBalance({
        client,
        destinationAta: ata,
        mint: UMBRA_TEST_MINT_DEVNET,
        amount: PHASE2_AMOUNT_LAMPORTS,
      });
      const sigs: { label: string; signature: string }[] = [
        { label: 'queue', signature: result.queueSignature },
      ];
      if (result.callbackSignature) sigs.push({ label: 'callback', signature: result.callbackSignature });
      return { message: `Sent ${SOL_DISPLAY} back to your wallet`, signatures: sigs };
    });
  }, [runOp]);

  const handleCreateUtxo = useCallback(() => {
    runOp('create-utxo', async () => {
      const { signer, client } = await getStoredSignerAndClient();
      const result = await createReceiverClaimableFromPublicBalance({
        client,
        destinationAddress: signer.address,
        mint: UMBRA_TEST_MINT_DEVNET,
        amount: PHASE2_AMOUNT_LAMPORTS,
      });
      const anyResult = result as any;
      const sig = anyResult.signature ?? anyResult.queueSignature;
      const sigs = sig ? [{ label: 'create', signature: sig as string }] : undefined;
      return { message: `Created a private test payment for ${SOL_DISPLAY}`, signatures: sigs };
    });
  }, [runOp]);

  const handleScanUtxo = useCallback(() => {
    runOp('scan-utxo', async () => {
      const { client } = await getStoredSignerAndClient();
      let r = await scanClaimableUtxosAcrossTrees({ client, maxTreeIndex: 7 });
      const isEmpty = (rr: typeof r) =>
        rr.selfBurnable.length + rr.received.length + rr.publicSelfBurnable.length + rr.publicReceived.length === 0;
      for (let attempt = 1; attempt <= 2 && isEmpty(r); attempt++) {
        await new Promise((res) => setTimeout(res, 1500 * attempt));
        r = await scanClaimableUtxosAcrossTrees({ client, maxTreeIndex: 7 });
      }
      const utxos: readonly ScannedUtxoData[] = [
        ...r.selfBurnable,
        ...r.received,
        ...r.publicSelfBurnable,
        ...r.publicReceived,
      ];
      setScannedUtxos(utxos);
      return { message: `Found ${utxos.length} private payment(s)` };
    });
  }, [runOp]);

  const handleClaimUtxo = useCallback(() => {
    runOp('claim-utxo', async () => {
      if (scannedUtxos.length === 0) {
        throw new Error('Tap "Check for incoming" first — nothing to pull in yet.');
      }
      const { client } = await getStoredSignerAndClient();
      const result = await claimReceiverClaimableUtxosToEncryptedBalance({
        client,
        utxos: scannedUtxos,
      });
      const sigsByBatch = (result as any).signatures ?? {};
      const sigs: { label: string; signature: string }[] = [];
      for (const [batchKey, batchSigs] of Object.entries(sigsByBatch)) {
        const arr = batchSigs as string[];
        arr.forEach((s, i) => sigs.push({ label: `batch ${batchKey}.${i}`, signature: s }));
      }
      setScannedUtxos([]);
      return {
        message: `Pulled ${scannedUtxos.length} private payment(s) in`,
        signatures: sigs.length ? sigs : undefined,
      };
    });
  }, [runOp, scannedUtxos]);

  const isRunning = runState === 'running';
  const phase1Done = runState === 'success' || signerAddress !== null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <ScreenHeader title="Private mode" onClose={onBack} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PrimaryButton
          label={runState === 'idle' ? 'Turn on private mode' : 'Refresh private mode'}
          onPress={handleRun}
          loading={isRunning}
          fullWidth
          icon={<Icon name="lock" size={18} color={colors.white} />}
          style={{ marginBottom: spacing.xl }}
        />

        {signerAddress && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Your private address</Text>
            <Text style={styles.cardHint}>Send at least 0.01 SOL here before tapping setup. Private mode uses it for network fees.</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => Clipboard.setStringAsync(signerAddress)}
            >
              <Text style={styles.signerAddress}>{signerAddress}</Text>
            </TouchableOpacity>
            <View style={styles.linkRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => Linking.openURL(getAccountExplorerUrl(signerAddress))}
              >
                <Text style={styles.link}>View on Solscan ↗</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleResetSigner}
                disabled={isRunning}
              >
                <Text style={[styles.link, { color: colors.dangerText }]}>Start over</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {errorMessage && (
          <View style={styles.errorCard}>
            <Pill label="Failed" variant="danger" />
            <Text style={styles.errorBody}>{errorMessage}</Text>
          </View>
        )}

        {signatures.length > 0 && (
          <View style={styles.sigList}>
            <Text style={styles.sectionTitle}>Transactions</Text>
            {signatures.map((entry) => (
              <TouchableOpacity
                key={entry.signature}
                style={styles.sigRow}
                onPress={() => Linking.openURL(getTxExplorerUrl(entry.signature))}
                activeOpacity={0.7}
              >
                <Text style={styles.sigStep}>{STEP_LABEL[entry.step]}</Text>
                <Text style={styles.sigText}>{shortSig(entry.signature)} ↗</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {phase1Done && (
          <View style={styles.phase2Block}>
            <Text style={styles.sectionTitle}>Try it out · {SOL_DISPLAY}</Text>

            {(['deposit', 'withdraw', 'create-utxo', 'scan-utxo', 'claim-utxo'] as OpId[]).map((id) => {
              const op = ops[id];
              const handler =
                id === 'deposit' ? handleDeposit
                : id === 'withdraw' ? handleWithdraw
                : id === 'create-utxo' ? handleCreateUtxo
                : id === 'scan-utxo' ? handleScanUtxo
                : handleClaimUtxo;
              const label =
                id === 'deposit' ? `Move ${SOL_DISPLAY} into private balance`
                : id === 'withdraw' ? `Move ${SOL_DISPLAY} back to public`
                : id === 'create-utxo' ? `Send a private test to yourself`
                : id === 'scan-utxo' ? `Check for incoming private payments`
                : `Pull ${scannedUtxos.length || '0'} private payment(s) in`;
              const opRunning = op.status === 'running';
              return (
                <View key={id} style={styles.opCard}>
                  <PrimaryButton
                    label={label}
                    onPress={handler}
                    loading={opRunning}
                    disabled={isRunning}
                    fullWidth
                    variant="secondary"
                  />
                  {op.status === 'success' && op.message && (
                    <Text style={styles.opSuccess}>✓ {op.message}</Text>
                  )}
                  {op.status === 'error' && op.message && (
                    <Text style={styles.opError}>{op.message}</Text>
                  )}
                  {op.signatures?.map((s) => (
                    <TouchableOpacity
                      key={s.signature}
                      onPress={() => Linking.openURL(getTxExplorerUrl(s.signature))}
                      activeOpacity={0.7}
                      style={styles.opSigRow}
                    >
                      <Text style={styles.opSigLabel}>{s.label}</Text>
                      <Text style={styles.opSigText}>{shortSig(s.signature)} ↗</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.sectionTitle}>Activity</Text>
        <View style={styles.logBox}>
          {logs.length === 0 ? (
            <Text style={styles.logEmpty}>Tap a button above to begin.</Text>
          ) : (
            logs.map((line, idx) => (
              <Text key={idx} style={styles.logLine}>{line}</Text>
            ))
          )}
        </View>
      </ScrollView>
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
  lede: {
    ...typography.body,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 2,
  },
  cardHint: {
    ...typography.caption,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  signerAddress: {
    fontSize: 13,
    color: colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    lineHeight: 19,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  link: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '600' as const,
  },
  errorCard: {
    backgroundColor: colors.dangerBg,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  errorBody: {
    fontSize: 12,
    color: colors.dangerText,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    lineHeight: 17,
  },
  sigList: { marginBottom: spacing.xl },
  sectionTitle: {
    ...typography.heading,
    marginBottom: spacing.md,
  },
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sigStep: {
    fontSize: 13,
    color: colors.text,
    flex: 1,
  },
  sigText: {
    fontSize: 12,
    color: colors.accent,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  logBox: {
    backgroundColor: '#0E0E0E',
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 140,
  },
  logEmpty: {
    color: '#666',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  logLine: {
    color: '#9af09a',
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    lineHeight: 16,
  },
  phase2Block: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  phase2Hint: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  opCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  opSuccess: {
    fontSize: 12,
    color: colors.successText,
    marginTop: spacing.sm,
    fontWeight: '500' as const,
  },
  opError: {
    fontSize: 12,
    color: colors.dangerText,
    marginTop: spacing.sm,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  opSigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 4,
  },
  opSigLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  opSigText: {
    fontSize: 11,
    color: colors.accent,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
});
