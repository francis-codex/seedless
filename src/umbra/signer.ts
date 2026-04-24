// LazorKitUmbraSigner — adapts our secp256r1 passkey smart wallet to Umbra's
// IUmbraSigner interface. signTransaction routes through lazorClient.execute;
// signMessage throws (master seed comes from master-seed.ts via masterSeedStorage override).
// See docs/umbra-integration-plan.md §5 (the integration's hardest piece).

export {};
