import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useWallet } from '@lazorkit/wallet-mobile-adapter';
import { clearCachedMasterSeed, type PasskeySignFn } from '../umbra/master-seed';
import {
  getStoredSignerAndClient,
  resetThrowawaySigner,
  runHelloWorldRegistration,
  type RegistrationProgress,
  type RegistrationStep,
} from '../umbra/registration';
import { depositToEncryptedBalance } from '../umbra/deposit';
import { withdrawToPublicBalance } from '../umbra/withdraw';
import { createReceiverClaimableFromPublicBalance, scanClaimableUtxos } from '../umbra/utxo';
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
  userAccountInitialisation: '1/3 · user account init',
  registerX25519PublicKey: '2/3 · X25519 key (confidential)',
  registerUserForAnonymousUsage: '3/3 · anonymous usage',
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

  const { isConnected, smartWalletPubkey, signMessage: lazorSignMessage } = useWallet();
  const [usePasskeyMasterSeed, setUsePasskeyMasterSeed] = useState(false);

  const passkeyMasterSeed = useMemo(() => {
    if (!usePasskeyMasterSeed || !isConnected || !smartWalletPubkey) return undefined;
    const vaultPubkey = smartWalletPubkey.toBase58();
    const signMessage: PasskeySignFn = async (canonical) => {
      const redirectUrl = Linking.createURL('umbra-master-seed-callback');
      const result = await lazorSignMessage(canonical, { redirectUrl });
      return { signature: result.signature, signedPayload: result.signedPayload };
    };
    return { vaultPubkey, signMessage };
  }, [usePasskeyMasterSeed, isConnected, smartWalletPubkey, lazorSignMessage]);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, `[${fmtTime()}] ${line}`]);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const handleProgress = useCallback((event: RegistrationProgress) => {
    switch (event.stage) {
      case 'signer-created':
        setSignerAddress(event.address);
        appendLog(`signer ${event.reused ? 'restored' : 'created'} · ${event.address}`);
        break;
      case 'client-built':
        appendLog('umbra client built');
        break;
      case 'prover-ready':
        appendLog('zk prover ready (userregistration.zkey loaded)');
        break;
      case 'registering':
        appendLog('starting registration (3 instructions)…');
        break;
      case 'step-pre':
        appendLog(`→ ${STEP_LABEL[event.step]} sending`);
        break;
      case 'step-post':
        appendLog(`✓ ${STEP_LABEL[event.step]} confirmed · ${shortSig(event.signature)}`);
        setSignatures((prev) => [...prev, { step: event.step, signature: event.signature }]);
        break;
      case 'success':
        appendLog(`done · ${event.signatures.length} txs landed`);
        break;
    }
  }, [appendLog]);

  const handleRun = useCallback(async () => {
    setRunState('running');
    setLogs([]);
    setSignatures([]);
    setErrorMessage(null);
    try {
      if (passkeyMasterSeed) appendLog(`passkey master-seed mode · vault ${passkeyMasterSeed.vaultPubkey.slice(0, 8)}…`);
      await runHelloWorldRegistration(handleProgress, passkeyMasterSeed ? { passkeyMasterSeed } : undefined);
      setRunState('success');
    } catch (err: any) {
      const detail = unwrapErrorDetail(err);
      appendLog(`error · ${detail}`);
      setErrorMessage(detail);
      setRunState('error');
      console.error('[umbra] hello-world registration failed:', err);
    }
  }, [handleProgress, appendLog, passkeyMasterSeed]);

  const handleResetSigner = useCallback(async () => {
    await resetThrowawaySigner();
    setSignerAddress(null);
    setSignatures([]);
    setErrorMessage(null);
    appendLog('signer cleared — next run will mint a fresh address');
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
    appendLog(`▶ ${id} starting…`);
    try {
      const out = await fn();
      setOp(id, { status: 'success', message: out.message, signatures: out.signatures });
      appendLog(`✓ ${id} · ${out.message}`);
    } catch (err: any) {
      const detail = unwrapErrorDetail(err);
      setOp(id, { status: 'error', message: detail });
      appendLog(`✗ ${id} · ${detail}`);
      console.error(`[umbra] ${id} failed:`, err);
    }
  }, [appendLog, setOp]);

  const handleDeposit = useCallback(() => {
    runOp('deposit', async () => {
      const { signer, client } = await getStoredSignerAndClient(passkeyMasterSeed ? { passkeyMasterSeed } : undefined);
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
      return { message: `deposited ${SOL_DISPLAY} to ETA`, signatures: sigs };
    });
  }, [runOp, passkeyMasterSeed]);

  const handleWithdraw = useCallback(() => {
    runOp('withdraw', async () => {
      const { signer, client } = await getStoredSignerAndClient(passkeyMasterSeed ? { passkeyMasterSeed } : undefined);
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
      return { message: `withdrew ${SOL_DISPLAY} → ATA ${ata.slice(0, 6)}…${ata.slice(-4)}`, signatures: sigs };
    });
  }, [runOp, passkeyMasterSeed]);

  const handleCreateUtxo = useCallback(() => {
    runOp('create-utxo', async () => {
      const { signer, client } = await getStoredSignerAndClient(passkeyMasterSeed ? { passkeyMasterSeed } : undefined);
      const result = await createReceiverClaimableFromPublicBalance({
        client,
        destinationAddress: signer.address,
        mint: UMBRA_TEST_MINT_DEVNET,
        amount: PHASE2_AMOUNT_LAMPORTS,
      });
      const anyResult = result as any;
      const sig = anyResult.signature ?? anyResult.queueSignature;
      const sigs = sig ? [{ label: 'create', signature: sig as string }] : undefined;
      return { message: `created receiver-claimable UTXO (${SOL_DISPLAY}) → self`, signatures: sigs };
    });
  }, [runOp, passkeyMasterSeed]);

  const handleScanUtxo = useCallback(() => {
    runOp('scan-utxo', async () => {
      const { client } = await getStoredSignerAndClient(passkeyMasterSeed ? { passkeyMasterSeed } : undefined);
      const result = await scanClaimableUtxos({ client, treeIndex: 0 });
      const utxos: readonly ScannedUtxoData[] =
        (result as any).utxos ?? (Array.isArray(result) ? (result as any) : []);
      setScannedUtxos(utxos);
      return { message: `scan complete · ${utxos.length} claimable utxo(s) found in tree 0` };
    });
  }, [runOp, passkeyMasterSeed]);

  const handleClaimUtxo = useCallback(() => {
    runOp('claim-utxo', async () => {
      if (scannedUtxos.length === 0) {
        throw new Error('Run scan-utxo first — no UTXOs in memory to claim.');
      }
      const { client } = await getStoredSignerAndClient(passkeyMasterSeed ? { passkeyMasterSeed } : undefined);
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
        message: `claimed ${scannedUtxos.length} utxo(s) → encrypted balance`,
        signatures: sigs.length ? sigs : undefined,
      };
    });
  }, [runOp, passkeyMasterSeed, scannedUtxos]);

  const isRunning = runState === 'running';
  const phase1Done = runState === 'success' || signerAddress !== null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} disabled={isRunning}>
          <Text style={[styles.backText, isRunning && styles.backDisabled]}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Umbra debug</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.lede}>
        End-to-end smoke test: throwaway Ed25519 signer → Umbra client → ZK
        prover → 3-instruction registration on devnet. The signer is persisted
        to secure storage, so airdrop devnet SOL once to the address below and
        re-run. Use "reset signer" to mint a fresh address.
      </Text>

      <View style={styles.toggleCard}>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.toggleTitle}>Passkey master seed (Phase 3)</Text>
            <Text style={styles.toggleHint}>
              {isConnected && smartWalletPubkey
                ? `Bind encrypted state to vault ${smartWalletPubkey.toBase58().slice(0, 8)}…${smartWalletPubkey.toBase58().slice(-4)} via passkey signature.`
                : 'Connect your LazorKit wallet first to enable.'}
            </Text>
          </View>
          <Switch
            value={usePasskeyMasterSeed}
            onValueChange={setUsePasskeyMasterSeed}
            disabled={!isConnected || !smartWalletPubkey || isRunning}
          />
        </View>
        {usePasskeyMasterSeed && smartWalletPubkey && (
          <TouchableOpacity
            onPress={async () => {
              await clearCachedMasterSeed(smartWalletPubkey.toBase58());
              appendLog(`master seed cache cleared for vault ${smartWalletPubkey.toBase58().slice(0, 8)}…`);
            }}
            activeOpacity={0.6}
            style={{ marginTop: 8 }}
          >
            <Text style={[styles.linkText, styles.linkDanger]}>clear cached master seed</Text>
          </TouchableOpacity>
        )}
      </View>

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
            {runState === 'idle' ? 'Run hello-world register' : 'Run again'}
          </Text>
        )}
      </TouchableOpacity>

      {signerAddress && (
        <View style={styles.signerCard}>
          <Text style={styles.signerLabel}>Throwaway signer (persisted — airdrop devnet SOL once)</Text>
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
              <Text style={styles.linkText}>view on solscan ↗</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleResetSigner} activeOpacity={0.6} disabled={isRunning}>
              <Text style={[styles.linkText, styles.linkDanger, isRunning && styles.backDisabled]}>reset signer</Text>
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
          <Text style={styles.sectionTitle}>Phase 2 — encrypted ops ({SOL_DISPLAY})</Text>
          <Text style={styles.phase2Hint}>
            Each op uses the persisted signer above and the WSOL devnet mint
            (auto-wrapped). Run register first; then deposit before withdraw,
            create-utxo before scan.
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
              id === 'deposit' ? `Deposit ${SOL_DISPLAY} → ETA`
              : id === 'withdraw' ? `Withdraw ${SOL_DISPLAY} → ATA`
              : id === 'create-utxo' ? `Create receiver-claimable UTXO`
              : id === 'scan-utxo' ? `Scan claimable UTXOs (tree 0)`
              : `Claim ${scannedUtxos.length || '0'} scanned UTXO(s) → ETA`;
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
  toggleCard: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleTitle: { fontSize: 13, fontWeight: '600', color: '#000', marginBottom: 4 },
  toggleHint: { fontSize: 11, color: '#666', lineHeight: 16 },
});
