// Foreign-chain tx assembly + broadcast. Sepolia is the primary path.
//
// We deliberately bypass ethers' JsonRpcProvider for tx-side calls — its
// getFeeData() pulls eth_feeHistory which is flaky over publicnode.com
// from RN/iOS-sim. Instead we hit the JSON-RPC endpoint with raw fetch for
// nonce/gas-price/chainId/broadcast, and keep ethers.Transaction only for
// RLP encoding. Legacy (type-0) tx — Sepolia accepts these.

import { ethers } from 'ethers';

import { getChain } from './chains';
import { signWithDWallet } from './dwallet';
import type { DWalletRecord, IkaProgressCb, SendRequest, SendResult } from './types';
import { asIkaError, IkaError } from './errors';

interface RpcOk<T> { jsonrpc: '2.0'; id: number; result: T }
interface RpcErr { jsonrpc: '2.0'; id: number; error: { code: number; message: string; data?: unknown } }

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  } catch (e) {
    throw asIkaError('rpc_failed', `${method}: network unreachable`, e);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new IkaError('rpc_failed', `${method}: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as RpcOk<T> | RpcErr;
  if ('error' in json) {
    throw new IkaError('rpc_failed', `${method}: ${json.error.message}`, json.error);
  }
  return json.result;
}

const hexToBig = (h: string): bigint => BigInt(h);

export async function getNativeBalance(record: DWalletRecord): Promise<bigint> {
  const chain = getChain(record.chain);
  return hexToBig(await rpc<string>(chain.rpcUrl, 'eth_getBalance', [record.address, 'latest']));
}

export async function sendNative(
  req: SendRequest,
  onProgress?: IkaProgressCb,
): Promise<SendResult> {
  const { dWallet, to, amount } = req;
  if (dWallet.chain !== 'sepolia') {
    throw new IkaError('unsupported_chain', `Send not wired for ${dWallet.chain} yet.`);
  }
  const chain = getChain(dWallet.chain);

  let nonceHex: string;
  let gasPriceHex: string;
  let chainIdHex: string;
  try {
    [nonceHex, gasPriceHex, chainIdHex] = await Promise.all([
      rpc<string>(chain.rpcUrl, 'eth_getTransactionCount', [dWallet.address, 'pending']),
      rpc<string>(chain.rpcUrl, 'eth_gasPrice', []),
      rpc<string>(chain.rpcUrl, 'eth_chainId', []),
    ]);
  } catch (e) {
    throw asIkaError('rpc_failed', 'Failed to fetch Sepolia network state.', e);
  }

  // Bump gas price 25% for faster inclusion on a noisy testnet.
  const gasPrice = (hexToBig(gasPriceHex) * 125n) / 100n;
  const tx = new ethers.Transaction();
  tx.type = 0;
  tx.chainId = hexToBig(chainIdHex);
  tx.nonce = Number(hexToBig(nonceHex));
  tx.to = to;
  tx.value = amount;
  tx.gasLimit = 21_000n;
  tx.gasPrice = gasPrice;
  tx.data = '0x';

  const digest = ethers.getBytes(tx.unsignedHash);
  const sig = await signWithDWallet(dWallet, { chain: 'sepolia', message: digest }, onProgress);

  const sigHex = sig.signatureHex.startsWith('0x') ? sig.signatureHex.slice(2) : sig.signatureHex;
  const r = '0x' + sigHex.slice(0, 64);
  const s = '0x' + sigHex.slice(64, 128);
  const v = parseInt(sigHex.slice(128, 130), 16);
  tx.signature = { r, s, v };

  onProgress?.({ stage: 'broadcast-pre' });
  let txHash: string;
  try {
    txHash = await rpc<string>(chain.rpcUrl, 'eth_sendRawTransaction', [tx.serialized]);
  } catch (e) {
    throw asIkaError('broadcast_failed', 'Sepolia broadcast failed.', e);
  }

  onProgress?.({ stage: 'broadcast-success', txHash });
  return { txHash, explorerUrl: chain.explorerTxBase + txHash };
}
