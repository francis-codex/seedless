# Seedless × Ika — Integration Proposal

A native multi-chain capability for Seedless, powered by Ika's dWallet primitive. Following our last call, this document outlines the approach, what gets shipped first, and where we'd value Ika's input before we begin.

---

## 1. The thesis

Seedless is a passkey-first Solana wallet. The user model is "Face ID is the wallet" — no seed phrase, no external private key, gasless by default. Adding Ika is the most direct path to extending that model beyond Solana, without compromising any of it.

The dWallet primitive is uniquely well-suited to mobile passkey UX:
- The user share is a small piece of cryptographic state that fits naturally inside biometric-gated secure storage.
- The smart-contract-mediated authority pattern composes cleanly with Seedless's existing LazorKit smart wallet model, where transactions are already approved through programmatic policy.
- The Zero Trust property means Seedless never has to custody a non-Solana private key on behalf of the user — which is the current ceiling for any mobile wallet trying to go multi-chain.

Stitched together, Seedless becomes the first consumer mobile wallet where a single passkey signs natively on Bitcoin, Ethereum, and Solana — no bridge, no wrapped token, no seed phrase, no compromise on the passkey-only model.

This is a v1.5 / v2 capability for Seedless and a long-term integration. The work below is framed accordingly.

---

## 2. The MVP we ship first

A user installs Seedless, opens the app, taps "add Ethereum," authenticates with Face ID, and the app shows an Ethereum address. They send a small amount of ETH on Sepolia by tapping Send and approving with Face ID. The signature is produced via Ika; the transaction lands on Sepolia.

Three screens. Two passkey taps. One foreign-chain transaction. No seed phrase. No bridge.

This is the smallest end-to-end flow that proves the integration works and gives users an immediately useful capability — and it's the foundation everything else (Bitcoin, Sui, Arbitrum, multi-chain balance views, contract-gated policies) builds on top of.

### MVP scope

| Capability | In MVP | Notes |
|---|---|---|
| dWallet creation (DKG) on first chain-add | ✅ | passkey unlocks → DKG with Ika network → user share encrypted at rest |
| Ethereum (Sepolia) signing | ✅ | primary demo chain |
| Bitcoin testnet signing | nice-to-have | same code path, different chain selector |
| Multi-chain balance row | minimal | one row per added chain, balance fetched via public RPC |
| Recovery on device loss | v1.5 | designed for from day one; ships after MVP |
| Contract-gated approval policies | v1.5 | uses Ika's smart-contract authority pattern; large surface, dedicated phase |

---

## 3. Architecture

```
┌──────────────────────┐    Face ID     ┌──────────────────┐
│   Seedless RN app    │ ──────────────▶│ LazorKit passkey │
│                      │                │  smart wallet    │
└──────────┬───────────┘                └────────┬─────────┘
           │                                     │
           │ @ika.xyz/sdk                        │ Solana sigs
           │                                     ▼
           ▼                              ┌──────────────────┐
┌──────────────────────┐                  │  Solana devnet   │
│  Ika gRPC pre-alpha  │ ◀────────────────┤  + Ika program   │
│   (network share +   │                  └──────────────────┘
│    threshold MPC)    │                           ▲
└──────────┬───────────┘                           │ approve_message
           │                                       │
           │ signature                             │
           ▼                                       │
┌──────────────────────┐                  ┌────────┴─────────┐
│  Sepolia / Bitcoin   │                  │  dWallet authority │
│  testnet / etc.      │                  │  PDA (CPI signer)  │
└──────────────────────┘                  └────────────────────┘
```

### The Seedless-specific contribution

The user MPC share is the security-critical local secret. In Seedless, that share is encrypted at rest with a passkey-derived key — produced by hashing a domain-separated WebAuthn signature over a canonical message, then persisted only as ciphertext in iOS Keychain / Android Keystore.

Concretely: `encryption_key = keccak512(passkey_signature(canonical_message) ‖ domain_separator)`, then the share is sealed with an AEAD under that key.

The result: the share is bound to the user's biometric and device, never persisted in plaintext, and decryptable only on a Face-ID-authenticated session. It mirrors a pattern Seedless already uses for its Umbra integration master seed — domain-separated so the two derivations are cryptographically independent.

This is the consumer-grade biometric-binding layer that the dWallet primitive enables on mobile, and the part Seedless is best positioned to contribute back to the Ika ecosystem.

---

## 4. Code shape

```
src/
  ika/
    client.ts          # @ika.xyz/sdk client construction + transport
    dwallet.ts         # DKG + signing wrappers
    user-share.ts      # passkey-derived encryption of the user MPC share
    chains.ts          # chain registry: Sepolia, Bitcoin testnet, etc.
    tx.ts              # build unsigned tx → request Ika signature → broadcast
    errors.ts          # staged error taxonomy
  screens/
    IkaScreen.tsx      # add-chain + send flows
docs/
  ika-integration-proposal.md
```

The structure intentionally mirrors Seedless's existing `src/umbra/` adapter, so anyone reading one can immediately read the other.

---

## 5. Build phases

We're aiming for a working v0.1 within roughly five days of greenlight, and a polished v0.2 inside two weeks. Specific milestones:

- **Phase 1 — alignment (today / tomorrow).** Finalize this plan with Ika's input. Lock the gRPC transport choice and the user-share encryption pattern before writing TypeScript.
- **Phase 2 — v0.1 testable demo.** dWallet creation + Ethereum (Sepolia) send working end-to-end on a single device. Demo-grade.
- **Phase 3 — v0.2 polish + second chain.** UI cleaned, Bitcoin testnet or multi-chain balance row added, recovery flow documented and prototyped.
- **Phase 4 — review + handoff.** Walkthrough with Ika team, demo video, public announcement.

Pace can compress if blockers don't surface. Phases 2 and 3 are the load-bearing work.

---

## 6. Open questions for alignment

A few things we'd value Ika's input on before we begin building, so we don't burn cycles on assumptions:

1. **Transport in React Native.** `@ika.xyz/sdk` uses gRPC under the hood. RN doesn't have native gRPC support. Does the SDK ship a fetch- or grpc-web-compatible path that runs in RN today, or is there a recommended sidecar pattern we should follow?
2. **Default dWallet-controller program.** For the MVP, is there a reference Solana program we can use as the dWallet authority out of the box, or is the convention to write a minimal Anchor program per integrator?
3. **dWallet account costs.** What's the typical SOL fee for DKG / dWallet creation on the pre-alpha? We sponsor user gas via Kora and want to plan around that.
4. **Mocked-signing disclosure.** Pre-alpha signing is currently mocked. We're happy to surface that on-screen in our demo and any public material until real MPC ships — wanted to confirm that's the right framing for the team.
5. **Anything in this plan that misreads how Ika actually works.** Better to take any feedback now than re-architect mid-build.

---

## 7. Strategic fit

Why this integration matters for both projects:

- **For users:** the first consumer mobile experience where Bitcoin and Ethereum can be signed natively from a passkey, with no seed phrase or wrapped token detour. That's a meaningful step-change in mobile crypto UX.
- **For Ika:** a flagship consumer-mobile integration that demonstrates the dWallet primitive at the user-facing surface, beyond infrastructure and institutional use cases.
- **For Seedless:** the cleanest path to becoming a multi-chain wallet without compromising the passkey-only thesis the product is built on.
- **Composability:** Seedless already integrates LazorKit (passkey smart wallet) and Umbra (privacy primitives). Adding Ika makes it the first consumer wallet stitching three Solana-anchored protocols into a single coherent product — a strong story for everyone involved.

---

## 8. Note on the Frontier side-track

Seedless intends to submit this work to the Encrypt × Ika Frontier side-track. The integration is being scoped and built as a long-term capability of the wallet; the side-track submission is a natural byproduct rather than the driver. Happy to align on submission details (deadline, criteria, video format) closer to the time.

---

## 9. References

- Whitepaper: Ika v1.0, October 2024
- Pre-alpha: https://solana-pre-alpha.ika.xyz/introduction
- Docs: https://docs.ika.xyz/docs/sdk
- Github: https://github.com/dwallet-labs/ika
- Reference apps: keyspring.app, x.com/waapxyz
