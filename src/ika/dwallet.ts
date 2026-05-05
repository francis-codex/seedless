// dWallet lifecycle: create (DKG) and load.
//
// Persistence layout: one DWalletRecord per chain, keyed by chain id under
// SecureStore. Multi-chain users get one record per add-chain action. The
// user share ciphertext lives inside the record so a single fetch returns
// everything needed to sign on that chain.

import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';
import { v4 as uuid } from './uuid';

import type {
  ChainId,
  DWalletRecord,
  IkaProgressCb,
  SignRequest,
  SignResult,
} from './types';
import { deriveAddress, getIkaNetwork, localDkg, sign as ikaSign } from './client';
import { IkaError, asIkaError } from './errors';
import { openUserShare, sealUserShare } from './user-share';

const DWALLET_STORAGE_PREFIX = 'ika_dwallet_v1_';

function storageKey(chain: ChainId): string {
  return `${DWALLET_STORAGE_PREFIX}${chain}`;
}

export async function loadDWallet(chain: ChainId): Promise<DWalletRecord | null> {
  const raw = await SecureStore.getItemAsync(storageKey(chain));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DWalletRecord;
    if (!parsed.id || !parsed.address || !parsed.userShareCiphertextB64) {
      throw new Error('missing fields');
    }
    return parsed;
  } catch (e) {
    throw new IkaError('storage_corrupt', 'Stored dWallet is malformed.', e);
  }
}

export async function deleteDWallet(chain: ChainId): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey(chain));
}

export async function createDWallet(
  chain: ChainId,
  onProgress?: IkaProgressCb,
): Promise<DWalletRecord> {
  try {
    onProgress?.({ stage: 'dkg-pre' });

    // Touch the SDK so the network handshake (or its failure) is recorded
    // before we generate keys. The DKG itself stays local until the RN-side
    // 2PC-MPC path is validated on Hermes.
    const network = await getIkaNetwork();
    onProgress?.({ stage: 'dkg-network' });
    const { privateKey, publicKey } = await localDkg();

    onProgress?.({ stage: 'dkg-seal-share' });
    const userShareCiphertextB64 = await sealUserShare(privateKey);
    const address = deriveAddress(chain, publicKey);
    const record: DWalletRecord = {
      id: uuid(),
      chain,
      address,
      publicKeyHex: '0x' + Buffer.from(publicKey).toString('hex'),
      userShareCiphertextB64,
      createdAt: Date.now(),
      network: network ? 'testnet' : 'local',
    };
    await SecureStore.setItemAsync(storageKey(chain), JSON.stringify(record));

    onProgress?.({ stage: 'dkg-success', dWallet: record });
    return record;
  } catch (e) {
    throw asIkaError('dkg_failed', 'Failed to create dWallet.', e);
  }
}

export async function signWithDWallet(
  record: DWalletRecord,
  req: SignRequest,
  onProgress?: IkaProgressCb,
): Promise<SignResult> {
  try {
    onProgress?.({ stage: 'sign-pre' });
    const sk = await openUserShare(record.userShareCiphertextB64);
    onProgress?.({ stage: 'sign-network' });
    const sig = await ikaSign(req, sk);
    // Best-effort wipe of the unwrapped share (V8/Hermes don't guarantee
    // this, but we clear the visible reference so it's not GC-pinned).
    sk.fill(0);
    onProgress?.({ stage: 'sign-success', signatureHex: sig.signatureHex });
    return sig;
  } catch (e) {
    throw asIkaError('sign_failed', 'Failed to sign with dWallet.', e);
  }
}
