import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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

const PHASE2_AMOUNT_LAMPORTS = 1_000_000n; // 0.001 SOL — keeps devnet airdrops cheap
const SOL_DISPLAY = '0.001 SOL';

const STEP_LABEL: Record<RegistrationStep, string> = {
  userAccountInitialisation: 'Setting up your private account (1/3)',
  registerX25519PublicKey: 'Publishing your viewing key (2/3)',
  registerUserForAnonymousUsage: 'Joining the privacy pool (3/3)',
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
        appendLog(`Account ${event.reused ? 'loaded' : 'created'} · ${event.address}`);
        break;
      case 'client-built':
        appendLog('Connected to Umbra');
        break;
      case 'prover-ready':
        appendLog('Privacy proof system ready');
        break;
      case 'registering':
        appendLog('Registering (3 steps)…');
        break;
      case 'step-pre':
        appendLog(`→ ${STEP_LABEL[event.step]}`);
        break;
      case 'step-post':
        appendLog(`✓ ${STEP_LABEL[event.step]} · ${shortSig(event.signature)}`);
        setSignatures((prev) => [...prev, { step: event.step, signature: event.signature }]);
        break;
      case 'success':
        appendLog(`Registration complete · ${event.signatures.length} txs landed`);
        break;
    }
  }, [appendLog]);

  const handleRun = useCallback(async () => {
    setRunState('running');
    setLogs([]);
    setSignatures([]);
    setErrorMessage(null);
    // Hard ceiling on registration so a hung SDK promise can't trap the UI.
    // 90s covers passkey-prompt wait + 3 confirmations on a slow devnet.
    const timeoutMs = 90_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`registration timed out after ${timeoutMs / 1000}s`)), timeoutMs),
    );
    try {
      const result: any = await Promise.race([
        runHelloWorldRegistration(handleProgress),
        timeoutPromise,
      ]);
      // Sanity check: derived viewing key must match what's on chain. If they
      // diverge after a fresh registration there is a real SDK regression.
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
          appendLog('⚠ Viewing key mismatch — please reset and re-register');
          console.warn('[umbra] viewing-key mismatch', { derived, onChain: onChainPub });
        } else {
          appendLog('✓ Viewing key verified on chain');
        }
      } catch (e) {
        console.warn('[umbra] viewing-key check skipped:', (e as any)?.message ?? e);
      }
      setRunState('success');
    } catch (err: any) {
      const detail = unwrapErrorDetail(err);
      appendLog(`Failed · ${detail}`);
      setErrorMessage(detail);
      setRunState('error');
      console.error('[umbra] registration failed:', err);
    }
  }, [handleProgress, appendLog]);

  const handleResetSigner = useCallback(async () => {
    await resetThrowawaySigner();
    setSignerAddress(null);
    setSignatures([]);
    setErrorMessage(null);
    appendLog('Account cleared — registration will create a fresh one');
  }, [appendLog]);

  const [ops, setOps] = useState<Record<OpId, OpState>>({
    'deposit': { status: 'idle' },
    'withdraw': { status: 'idle' },
    'create-utxo': { status: 'idle' },
    'scan-utxo': { status: 'idle' },
    'claim-utxo': { status: 'idle' },
  });
  // Holds the most recent scan results so the claim button can consume them.
  // Reset whenever scan re-runs.
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
      setOp(id, { status: 'error', message: detail });
      appendLog(`✗ Failed · ${detail}`);
      console.error(`[umbra] ${id} failed:`, err);
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
      return { message: `Moved ${SOL_DISPLAY} into encrypted balance`, signatures: sigs };
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
      return { message: `Withdrew ${SOL_DISPLAY} to ${ata.slice(0, 6)}…${ata.slice(-4)}`, signatures: sigs };
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
      return { message: `Created a private receivable for ${SOL_DISPLAY}`, signatures: sigs };
    });
  }, [runOp]);

  const handleScanUtxo = useCallback(() => {
    runOp('scan-utxo', async () => {
      const { client } = await getStoredSignerAndClient();
      // Two short retries cover indexer warmup after a fresh create-utxo.
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
      return { message: `Found ${utxos.length} private receipt(s)` };
    });
  }, [runOp]);

  const handleClaimUtxo = useCallback(() => {
    runOp('claim-utxo', async () => {
      if (scannedUtxos.length === 0) {
        throw new Error('Run "scan for private receipts" first — nothing to claim.');
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
      // Clear the cache so a stale "1 utxo" badge can't tempt a re-claim of
      // the same nullified leaves.
      setScannedUtxos([]);
      return {
        message: `Claimed ${scannedUtxos.length} receipt(s) into encrypted balance`,
        signatures: sigs.length ? sigs : undefined,
      };
    });
  }, [runOp, scannedUtxos]);

  const isRunning = runState === 'running';
  const phase1Done = runState === 'success' || signerAddress !== null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Umbra Privacy</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.lede}>
        Test the privacy stack end to end. This screen creates a private account,
        moves a small amount in and out of an encrypted balance, and claims any
        private receipts. Make sure the account address below has a tiny bit of
        SOL for rent — everything else is automatic.
      </Text>

      <TouchableOpacity
        style={[styles.primaryButton, isRunning && styles.buttonDisabled]}
        onPress={handleRun}
        disabled={isRunning}
        activeOpacity={0.8}
      >
        {isRunning ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.primaryButtonText}>
            {runState === 'idle' ? 'Set up private account' : 'Re-run setup'}
          </Text>
        )}
      </TouchableOpacity>

      {signerAddress && (
        <View style={styles.signerCard}>
          <Text style={styles.signerLabel}>Your private account · fund this with a small amount of SOL for rent</Text>
          <TouchableOpacity
            onPress={async () => {
              await Clipboard.setStringAsync(signerAddress);
            }}
            activeOpacity={0.6}
          >
            <Text style={styles.signerAddress}>{signerAddress}</Text>
          </TouchableOpacity>
          <View style={styles.signerActions}>
            <TouchableOpacity
              onPress={() => Linking.openURL(getAccountExplorerUrl(signerAddress))}
              activeOpacity={0.6}
            >
              <Text style={styles.linkText}>View on Solscan ↗</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleResetSigner} activeOpacity={0.6} disabled={isRunning}>
              <Text style={[styles.linkText, styles.linkDanger, isRunning && styles.backDisabled]}>Reset account</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {errorMessage && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Failed</Text>
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
              activeOpacity={0.6}
            >
              <Text style={styles.sigStep}>{STEP_LABEL[entry.step]}</Text>
              <Text style={styles.sigText}>{shortSig(entry.signature)} ↗</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {phase1Done && (
        <View style={styles.phase2Block}>
          <Text style={styles.sectionTitle}>Encrypted operations ({SOL_DISPLAY})</Text>
          <Text style={styles.phase2Hint}>
            Each step uses the account above with wrapped SOL. Order:
            deposit before withdraw; create a private receivable before scanning;
            scan before claiming.
          </Text>

          {(['deposit', 'withdraw', 'create-utxo', 'scan-utxo', 'claim-utxo'] as OpId[]).map((id) => {
            const op = ops[id];
            const handler =
              id === 'deposit' ? handleDeposit
              : id === 'withdraw' ? handleWithdraw
              : id === 'create-utxo' ? handleCreateUtxo
              : id === 'scan-utxo' ? handleScanUtxo
              : handleClaimUtxo;
            const label =
              id === 'deposit' ? `Deposit ${SOL_DISPLAY} into encrypted balance`
              : id === 'withdraw' ? `Withdraw ${SOL_DISPLAY} to public balance`
              : id === 'create-utxo' ? `Create a private receivable to self`
              : id === 'scan-utxo' ? `Scan for incoming private receipts`
              : `Claim ${scannedUtxos.length || '0'} private receipt(s)`;
            const opRunning = op.status === 'running';
            return (
              <View key={id} style={styles.opCard}>
                <TouchableOpacity
                  style={[styles.opButton, opRunning && styles.buttonDisabled]}
                  onPress={handler}
                  disabled={opRunning || isRunning}
                  activeOpacity={0.7}
                >
                  {opRunning ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.opButtonText}>{label}</Text>
                  )}
                </TouchableOpacity>

                {op.status === 'success' && op.message && (
                  <Text style={styles.opSuccess}>{op.message}</Text>
                )}
                {op.status === 'error' && op.message && (
                  <Text style={styles.opError}>{op.message}</Text>
                )}
                {op.signatures?.map((s) => (
                  <TouchableOpacity
                    key={s.signature}
                    onPress={() => Linking.openURL(getTxExplorerUrl(s.signature))}
                    activeOpacity={0.6}
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

      <Text style={styles.sectionTitle}>Log</Text>
      <ScrollView
        ref={scrollRef}
        style={styles.logBox}
        nestedScrollEnabled
      >
        {logs.length === 0 ? (
          <Text style={styles.logEmpty}>No output yet — tap the button above.</Text>
        ) : (
          logs.map((line, idx) => (
            <Text key={idx} style={styles.logLine}>{line}</Text>
          ))
        )}
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 80 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backText: { fontSize: 16, color: '#666' },
  backDisabled: { opacity: 0.4 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#000' },
  lede: {
    fontSize: 13,
    color: '#555',
    marginBottom: 20,
    lineHeight: 19,
  },
  primaryButton: {
    backgroundColor: '#000',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  signerCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  signerLabel: { fontSize: 12, color: '#666', marginBottom: 6, fontWeight: '600' },
  signerAddress: { fontSize: 13, color: '#000', fontFamily: 'Menlo' },
  signerActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  linkText: { fontSize: 12, color: '#7c3aed' },
  linkDanger: { color: '#c00' },
  errorCard: {
    backgroundColor: '#fff5f5',
    borderColor: '#fad4d4',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorTitle: { fontSize: 13, color: '#c00', fontWeight: '700', marginBottom: 4 },
  errorBody: { fontSize: 12, color: '#700', fontFamily: 'Menlo', lineHeight: 17 },
  sigList: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#000', marginBottom: 10 },
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sigStep: { fontSize: 13, color: '#333', flex: 1 },
  sigText: { fontSize: 12, color: '#7c3aed', fontFamily: 'Menlo' },
  logBox: {
    backgroundColor: '#0e0e0e',
    borderRadius: 10,
    padding: 12,
    maxHeight: 280,
    minHeight: 140,
  },
  logEmpty: { color: '#777', fontSize: 12, fontFamily: 'Menlo' },
  logLine: { color: '#9af09a', fontSize: 11, fontFamily: 'Menlo', lineHeight: 16 },
  phase2Block: {
    marginTop: 8,
    marginBottom: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  phase2Hint: { fontSize: 12, color: '#666', marginBottom: 14, lineHeight: 17 },
  opCard: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  opButton: {
    backgroundColor: '#222',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  opButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  opSuccess: { fontSize: 12, color: '#0a7c2f', marginTop: 8 },
  opError: { fontSize: 12, color: '#c00', marginTop: 8, fontFamily: 'Menlo' },
  opSigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginTop: 4,
  },
  opSigLabel: { fontSize: 11, color: '#555' },
  opSigText: { fontSize: 11, color: '#7c3aed', fontFamily: 'Menlo' },
});
