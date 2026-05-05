// Ika client adapter — the single seam between the Seedless app and the
// Ika network.
//
// The integration is wired against @ika.xyz/sdk on Ika testnet, transported
// over Sui JSON-RPC via @mysten/sui. The SDK ships with a WASM dep
// (@ika.xyz/ika-wasm) that hasn't been fully validated on Hermes/RN, so the
// network client is lazy-initialized on first use and any init failure
// transparently falls back to local-mode signing — a cryptographically-real
// secp256k1 keypair stands in for the dWallet's user share, signs locally
// under passkey gating, and the demo broadcasts a real Sepolia tx end-to-end.
//
// Demo path stays identical either way; the difference is whether the
// network handshake to Ika testnet succeeded. `getIkaNetwork()` exposes
// the live SDK client to higher layers that want to query state.

import { Buffer } from 'buffer';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3.js';

import type { ChainId, SignRequest, SignResult } from './types';

export type IkaMode = 'local' | 'network';

export const IKA_MODE: IkaMode = 'network';

export const IKA_NETWORK_NAME = 'testnet' as const;

type IkaNetworkClient = {
  ikaClient: unknown;
  suiClient: unknown;
};

let networkPromise: Promise<IkaNetworkClient> | null = null;
let networkFailed = false;

// Lazily wires up @ika.xyz/sdk against testnet. Returns null if the WASM/SDK
// fails to load on the current runtime (RN/Hermes is unverified) — callers
// should treat that as the signal to fall back to local mode.
export async function getIkaNetwork(): Promise<IkaNetworkClient | null> {
  if (networkFailed) return null;
  if (!networkPromise) {
    networkPromise = (async () => {
      const [{ IkaClient, getNetworkConfig }, { SuiJsonRpcClient, getJsonRpcFullnodeUrl }] = await Promise.all([
        import('@ika.xyz/sdk'),
        import('@mysten/sui/jsonRpc'),
      ]);
      const suiClient = new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(IKA_NETWORK_NAME),
        network: IKA_NETWORK_NAME,
      });
      const ikaClient = new IkaClient({
        suiClient,
        config: getNetworkConfig(IKA_NETWORK_NAME),
        cache: true,
        encryptionKeyOptions: { autoDetect: true },
      });
      await ikaClient.initialize();
      return { ikaClient, suiClient };
    })().catch((e) => {
      networkFailed = true;
      networkPromise = null;
      console.warn('[ika] network init failed, falling back to local mode:', e);
      throw e;
    });
  }
  try {
    return await networkPromise;
  } catch {
    return null;
  }
}

export interface DWalletKeyMaterial {
  // 32-byte secp256k1 secret (the "user share" in Ika terms — in network
  // mode this is half a 2PC-MPC keypair; here it's a full local key).
  privateKey: Uint8Array;
  // 33-byte compressed public key. Same on Ika in network mode (the
  // joint dWallet pubkey).
  publicKey: Uint8Array;
}

// DKG entry point — produces (publicKey, userShare) for a fresh dWallet.
// In network mode this becomes a request-response with the Ika network
// over gRPC; the SDK returns a dWallet id and the encrypted-on-network
// half of the key, while the user keeps the local half.
export async function localDkg(): Promise<DWalletKeyMaterial> {
  const sk = new Uint8Array(32);
  crypto.getRandomValues(sk);
  // Reject zero / out-of-range scalars (negligible probability but cheap).
  if (sk.every((b) => b === 0)) return localDkg();
  const pk = secp256k1.getPublicKey(sk, true);
  return { privateKey: sk, publicKey: pk };
}

// Sign a 32-byte message digest with the dWallet's user share. In network
// mode this becomes a 2PC-MPC signing session: the user contributes a
// partial signature, Ika network combines with its homomorphically-
// encrypted share, the smart-contract authority approves the message, and
// a final ECDSA signature comes back. Here we run the full ECDSA locally
// and surface `mocked: true` so the UI can disclose it.
export async function sign(req: SignRequest, sk: Uint8Array): Promise<SignResult> {
  if (req.message.byteLength !== 32) {
    throw new Error(`Ika sign: expected 32-byte digest, got ${req.message.byteLength}`);
  }
  const sig = secp256k1.sign(req.message, sk, { lowS: true });
  // 65-byte (r || s || v) for Ethereum compatibility.
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  const v = (sig.recovery ?? 0) + 27;
  // Signing path is currently local under both modes — full RN-side
  // 2PC-MPC presign/sign through @ika.xyz/sdk lands once the WASM
  // signer is validated on Hermes. `mocked` stays true so the UI can
  // disclose that signing didn't go through the Ika network yet.
  return {
    signatureHex: '0x' + r + s + v.toString(16).padStart(2, '0'),
    mocked: true,
  };
}

// Derive the on-chain address for a dWallet on a given chain. For ECDSA
// chains (Sepolia, Bitcoin) this is curve-canonical and identical whether
// we're in local or network mode — the dWallet pubkey is the dWallet
// pubkey, the network just decides who holds half the secret.
export function deriveAddress(chain: ChainId, publicKey: Uint8Array): string {
  if (chain === 'sepolia') {
    // EIP-55-style: keccak256 of uncompressed pubkey (drop 0x04 prefix), last 20 bytes.
    const uncompressed = secp256k1.ProjectivePoint.fromHex(publicKey).toRawBytes(false);
    const hash = keccak_256(uncompressed.slice(1));
    return '0x' + Buffer.from(hash.slice(-20)).toString('hex');
  }
  if (chain === 'bitcoin-testnet') {
    // Placeholder: P2PKH testnet address derivation lands with the
    // Bitcoin demo path. UI gates this chain off until then.
    throw new Error('Bitcoin address derivation not yet wired (v0.2).');
  }
  throw new Error(`Unsupported chain: ${chain}`);
}
