// Umbra relayer factory.
//
// The relayer is a semi-trusted intermediary that builds + broadcasts claim
// transactions on behalf of users (it can see amounts/mints/timing but cannot
// steal funds, forge sigs, or link sender↔recipient — all of that is enforced
// by the on-chain ZK proofs).
//
// We pass the relayer instance into claim functions; otherwise the SDK has no
// path to actually land the claim tx on chain.
//
// Endpoint comes from `UMBRA_RELAYER_URL` (devnet vs mainnet split lives in
// constants/index.ts).

import { getUmbraRelayer } from '@umbra-privacy/sdk';
import type { IUmbraRelayer } from '@umbra-privacy/sdk/interfaces';

import { UMBRA_RELAYER_URL } from '../constants';

let cached: IUmbraRelayer | null = null;

export function getRelayer(): IUmbraRelayer {
  if (cached) return cached;
  cached = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER_URL });
  return cached;
}
