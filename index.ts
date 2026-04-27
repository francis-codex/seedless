// Polyfills — order matters. EventTarget/CustomEvent must be installed before
// ANY module captures `globalThis.EventTarget` at init time (notably
// @solana/rpc-subscriptions-channel-websocket).
import './src/polyfills/event-target';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
// RN has no crypto.subtle.digest. @solana/addresses (PDA derivation) calls
// subtle.digest('SHA-256'), and noble ed25519's sha512Async calls
// subtle.digest('SHA-512'). Polyfill subtle.digest with @noble/hashes BEFORE
// any other module touches it.
import { sha256, sha384, sha512 } from '@noble/hashes/sha2';
import { sha1 } from '@noble/hashes/legacy';
{
  const cryptoObj: any = (globalThis as any).crypto ||= {};
  const subtleObj: any = cryptoObj.subtle ||= {};
  if (typeof subtleObj.digest !== 'function') {
    subtleObj.digest = async (algorithm: string | { name: string }, data: BufferSource) => {
      const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
      const bytes = data instanceof Uint8Array
        ? data
        : new Uint8Array(ArrayBuffer.isView(data) ? (data as ArrayBufferView).buffer : (data as ArrayBuffer));
      let out: Uint8Array;
      if (name === 'SHA-256') out = sha256(bytes);
      else if (name === 'SHA-512') out = sha512(bytes);
      else if (name === 'SHA-384') out = sha384(bytes);
      else if (name === 'SHA-1') out = sha1(bytes);
      else throw new Error(`Unsupported digest algorithm: ${name}`);
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    };
  }
}
// Wire @noble/hashes sha512 into @noble/ed25519 — keeps ed25519 sign/verify off
// the subtle.digest path entirely (faster + avoids one indirection).
import { hashes as ed25519Hashes } from '@noble/ed25519';
ed25519Hashes.sha512 = sha512;
ed25519Hashes.sha512Async = async (msg: Uint8Array) => sha512(msg);
import { install as installEd25519 } from '@solana/webcrypto-ed25519-polyfill';
installEd25519();
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

// Hermes ships AbortSignal but is missing throwIfAborted (ES2022). Umbra SDK
// calls callerAbortSignal.throwIfAborted() between registration steps.
{
  const proto: any = (globalThis as any).AbortSignal?.prototype;
  if (proto && typeof proto.throwIfAborted !== 'function') {
    proto.throwIfAborted = function () {
      if (this.aborted) {
        throw this.reason ?? new Error('AbortError');
      }
    };
  }
}

// Filter known-harmless console noise. @solana/web3.js (legacy v1) logs
// `console.error('ws error:', err.message)` whenever its WebSocket subscription
// channel reconnects — which it does aggressively after every confirmed tx.
// Same behavior on devnet and mainnet; the underlying tx already landed before
// the socket cycles. Drop only this exact prefix so real errors still surface.
{
  const origError = console.error;
  console.error = (...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'string' && args[0].startsWith('ws error:')) {
      return;
    }
    origError(...args);
  };
}

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
