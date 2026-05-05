// Public types for the Seedless × Ika integration. Intentionally narrow —
// the live SDK surface (dWallet objects, presignatures, network configs) is
// kept inside src/ika/client.ts so the rest of the app reasons about Ika
// in domain terms.

export type ChainId = 'sepolia' | 'bitcoin-testnet';

export interface ChainConfig {
  id: ChainId;
  label: string;
  curve: 'secp256k1';
  rpcUrl: string;
  explorerTxBase: string;
  explorerAddrBase: string;
  nativeSymbol: string;
  nativeDecimals: number;
}

// On-disk representation of a dWallet from the user's perspective. The user
// share is sealed at rest (see user-share.ts); `userShareCiphertextB64` is the
// only piece persisted in plaintext — never the share itself.
export interface DWalletRecord {
  id: string;                       // Ika dWallet id (uuid for now, real id in v0.2)
  chain: ChainId;
  address: string;                  // foreign-chain address derived from the dWallet pubkey
  publicKeyHex: string;             // compressed secp256k1 public key
  userShareCiphertextB64: string;   // AEAD-sealed user MPC share
  createdAt: number;                // ms epoch
  network: 'testnet' | 'local';     // 'testnet' if @ika.xyz/sdk init succeeded, 'local' on RN/WASM fallback
}

export interface SignRequest {
  chain: ChainId;
  message: Uint8Array;              // 32-byte digest (e.g. keccak256 tx hash)
}

export interface SignResult {
  signatureHex: string;             // 65-byte ECDSA signature (r || s || v)
  mocked: boolean;                  // true while pre-alpha network signing is local-only
}

export interface SendRequest {
  dWallet: DWalletRecord;
  to: string;
  amount: bigint;                   // smallest unit (wei for sepolia)
}

export interface SendResult {
  txHash: string;
  explorerUrl: string;
}

// Lightweight progress events used by IkaScreen for live status text. Mirrors
// the umbra/registration RegistrationProgress shape so the UX patterns line up.
export type IkaProgress =
  | { stage: 'dkg-pre' }
  | { stage: 'dkg-network' }
  | { stage: 'dkg-seal-share' }
  | { stage: 'dkg-success'; dWallet: DWalletRecord }
  | { stage: 'sign-pre' }
  | { stage: 'sign-network' }
  | { stage: 'sign-success'; signatureHex: string }
  | { stage: 'broadcast-pre' }
  | { stage: 'broadcast-success'; txHash: string };

export type IkaProgressCb = (e: IkaProgress) => void;
