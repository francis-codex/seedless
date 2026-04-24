// Our own master-seed derivation + SecureStore persistence.
// Bypasses signer.signMessage by overriding masterSeedStorage.generate on the
// Umbra client. KMAC256 over a passkey signature, persisted per-wallet.
// See docs/umbra-integration-plan.md §5.3 (the escape hatch).

export {};
