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
  resetThrowawaySigner,
  runHelloWorldRegistration,
  type RegistrationProgress,
  type RegistrationStep,
} from '../umbra/registration';
import { getTxExplorerUrl, getAccountExplorerUrl } from '../constants';

interface UmbraDebugScreenProps {
  onBack: () => void;
}

type RunState = 'idle' | 'running' | 'success' | 'error';

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
      await runHelloWorldRegistration(handleProgress);
      setRunState('success');
    } catch (err: any) {
      const detail = unwrapErrorDetail(err);
      appendLog(`error · ${detail}`);
      setErrorMessage(detail);
      setRunState('error');
      console.error('[umbra] hello-world registration failed:', err);
    }
  }, [handleProgress, appendLog]);

  const handleResetSigner = useCallback(async () => {
    await resetThrowawaySigner();
    setSignerAddress(null);
    setSignatures([]);
    setErrorMessage(null);
    appendLog('signer cleared — next run will mint a fresh address');
  }, [appendLog]);

  const isRunning = runState === 'running';

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
});
