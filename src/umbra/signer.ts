// LazorKit ↔ Umbra bridge.
//
// Phase 3 status (Apr 28 2026):
//
// - Path B SHIPPED — "passkey-derived master seed".
//   The on-chain payer is still a throwaway Ed25519 signer, but the
//   master seed (root of all viewing/spending keys) is derived from a
//   secp256r1 passkey signature over a canonical message and persisted
//   in SecureStore. Cryptographic identity = the user's smart wallet,
//   even though tx fees come from the throwaway. See `master-seed.ts`
//   and the `passkeyMasterSeed` option on `runHelloWorldRegistration`
//   / `getStoredSignerAndClient` in `registration.ts`.
//
// - Path A NOT SHIPPED — "smart-wallet-as-Umbra-signer".
//   Would let LazorKit's smart wallet PDA be the on-chain Umbra signer
//   directly (eliminating the throwaway). Blocked: Umbra's IUmbraSigner
//   interface assumes a classic Ed25519 partial-signing flow, while
//   LazorKit signs+sends atomically via passkey CPI. Cal owes us either
//   a smart-wallet hook in IUmbraSigner or a session-key bridge.
//
// When Path A unblocks, this file gains a `LazorKitUmbraSigner` class
// implementing IUmbraSigner against either:
//   (a) a LazorKit session key (Ed25519, time-boxed), or
//   (b) the passkey directly via a SDK-side WebAuthn signer wrapper.
//
// Plan reference: docs/umbra-integration-plan.md §5.

export {};
