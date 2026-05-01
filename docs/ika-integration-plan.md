# Ika Integration Plan — Seedless Wallet

**Drafted:** May 1 2026 · **Author:** Francis (claude pairing) · **Reviewer:** Fesal (@iamknownasfesal)
**Target:** Colosseum Frontier — Encrypt × Ika side-track ($15K USDC pool, only 4 submissions, June 1 winners)
**Sprint:** May 1 → ~May 11 (Frontier wall) · plan vetted today/tomorrow → build over weekend → testable demo by Mon May 5

---

## 0. Why Ika, not Encrypt

Per call with Mehmet (Apr 28): FHE on a mobile wallet is the wrong shape. Ika's 2PC-MPC dWallet primitive maps cleanly onto Seedless's existing model:

- Seedless = passkey-gated Solana wallet (LazorKit smart wallet, Face ID = signing root).
- Ika dWallet = a smart-contract-controlled signer whose user share can be encrypted by an arbitrary key derivation — including a passkey-derived key.
- Net result: Seedless gains native Bitcoin / Ethereum / Sui / Arbitrum signing **without leaving the Face-ID-only model**, and without holding any seed phrase or external private key. One mental model end-to-end.

This is what we ship for the bounty: **"the first consumer mobile wallet that signs native non-Solana txs from a passkey via Ika"**.

---

## 1. What Ika gives us — the technical surface (verified)

From whitepaper + pre-alpha docs + Mehmet call:

- **dWallet primitive** — distributed key generated via DKG between user (1 share) and Ika network (N shares, threshold-encrypted via homomorphic encryption). Signs ECDSA today, EdDSA + Schnorr coming. Controls addresses on Bitcoin, Ethereum, Arbitrum, Sui, Solana, etc.
- **Pre-alpha network**:
  - dWallet gRPC: `https://pre-alpha-dev-1.ika.ika-network.net:443`
  - Solana RPC: `https://api.devnet.solana.com`
  - Ika Solana program ID: `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY`
  - **Signing is mocked** (single mock signer, not real distributed MPC) — full protocol surface is real, signature security is not. Demo-grade is fine for the bounty.
- **TS SDK**: `@ika.xyz/sdk` — installable today. Uses gRPC inputs underneath. Mehmet confirmed "can be adapted for Swift or other standards" — RN compatibility is the first thing we validate (see §6 risks).
- **On-chain shape**: a Solana program holds a CPI authority PDA that is the dWallet's authority. The program approves messages meeting its own logic, then Ika produces the signature.

---

## 2. Bounty MVP — the smallest end-to-end demo that wins

A user installs Seedless, opens the app, taps "add Ethereum," does Face ID, and the app shows an Ethereum address. They send 0.001 ETH on Sepolia to a friend by tapping Send and approving with Face ID. The signature is produced via Ika's pre-alpha network. The tx lands on Sepolia.

**That's the demo.** Three screens. Two passkey taps. One foreign-chain tx. No seed phrase. No bridge. No wrapped token.

### Feature inventory

| Feature | In MVP | Notes |
|---|---|---|
| dWallet create (DKG) on first chain-add | ✅ | passkey unlocks → DKG with Ika network → user share encrypted at rest |
| Ethereum (Sepolia) signing | ✅ | primary demo chain — most legible to a hackathon judge |
| Bitcoin signing | nice-to-have | adds wow factor; same code path, different chain selector |
| Sui signing | skip | Sui wallets are a crowded surface |
| Multi-chain balance view | minimal | one row per added chain; balance from a public RPC, not Ika |
| dWallet recovery | skip for MVP | document the path; ship in v1.5 |
| Smart-contract-gated approval (custom Solana program) | skip for MVP | use the SDK's default authority program; custom passkey-gated approval lands in v1.5 |

---

## 3. Architecture — how Seedless ↔ Ika fits

```
┌──────────────────────┐    Face ID     ┌──────────────────┐
│   Seedless RN app    │ ──────────────▶│ LazorKit passkey │
│  (UmbraDebugScreen,  │                │  smart wallet    │
│   new IkaScreen)     │                └────────┬─────────┘
└──────────┬───────────┘                         │
           │                                     │ Solana sigs
           │ @ika.xyz/sdk                        ▼
           │                              ┌──────────────────┐
           ▼                              │  Solana devnet   │
┌──────────────────────┐                  │  + Ika program   │
│  Ika gRPC pre-alpha  │ ◀────────────────┤  87W54k...q1oY   │
│   (network share +   │                  └──────────────────┘
│    threshold MPC)    │                           ▲
└──────────┬───────────┘                           │ approve_message
           │                                       │
           │ signature for foreign-chain tx        │
           ▼                                       │
┌──────────────────────┐                  ┌────────┴─────────┐
│  Sepolia / Bitcoin   │                  │  dWallet authority │
│  testnet / etc.      │                  │  PDA (CPI signer)  │
└──────────────────────┘                  └────────────────────┘
```

### The key insight — where Seedless adds value

The user MPC share is the security-critical local secret. Existing Ika integrations ship reference apps that store this share in a browser localStorage / desktop keychain. **Seedless encrypts it with a passkey-derived key** (mirroring the pattern we use for Umbra's master seed today: `keccak512(passkey_signature || domain) → encryption_key`). This makes the share:

1. Bound to the user's biometric — recoverable only on a Face-ID-authenticated device.
2. Not persisted in plaintext anywhere.
3. Compatible with the LazorKit recovery flow if/when device migration ships.

This is the piece nobody else is doing on a mobile passkey stack, and it's the centerpiece of the bounty narrative.

---

## 4. Code shape — where it lands in the repo

```
src/
  ika/
    client.ts          # @ika.xyz/sdk client construction + gRPC bridge
    dwallet.ts         # DKG + signing wrappers, parallel to umbra/registration.ts
    user-share.ts      # passkey-derived encryption of the MPC user share
                       #   (mirrors umbra/master-seed.ts)
    chains.ts          # chain registry: Sepolia, Bitcoin testnet, etc.
    tx.ts              # build unsigned Ethereum/Bitcoin tx → submit to Ika for sig → broadcast
    errors.ts          # staged error taxonomy parallel to umbra/errors.ts
  screens/
    IkaScreen.tsx      # add-chain + send flows; dev-mode debug screen first
                       # (parallel to UmbraDebugScreen.tsx during build)
docs/
  ika-integration-plan.md   # this file
```

Pattern: clone the structure of `src/umbra/` so the codebase has consistent ergonomics. Anyone who's read the Umbra adapter can immediately read the Ika one.

---

## 5. Build sequence — 10 days, three checkpoints

**Today / tomorrow — plan vetted by Fesal.** No code yet. Lock the API surface and the user-share encryption pattern before writing TypeScript.

**Mon May 5 — checkpoint 1: testable demo.** dWallet create + Ethereum (Sepolia) send working end-to-end on a single device. Demo-grade, no polish.

**Thu May 8 — checkpoint 2: rough cut demo video.** UI cleaned, second chain (Bitcoin testnet OR multi-chain balance row) added, recovery path documented.

**Sat May 10 — checkpoint 3: submission ready.** Final demo video, GitHub repo cleaned, Superteam Earn submission drafted with judging-criteria-by-criteria mapping.

**Sun May 11 — buffer / ship.** Submit. Don't touch code on submission day.

---

## 6. Open risks — flagging up-front

1. **RN ↔ gRPC compatibility.** `@ika.xyz/sdk` uses gRPC under the hood. RN doesn't have native gRPC. Two paths: (a) the SDK ships a fetch/JSON layer over gRPC that works in RN out of the box, or (b) we proxy via a thin Node sidecar / `grpc-web`. Need Fesal's read on which the SDK supports today. **This is the #1 thing to confirm before writing code.**
2. **Pre-alpha mocked signing.** The signature is not cryptographically secure on pre-alpha. Bounty submission video must say so on screen ("running on Ika pre-alpha — signing currently mocked"). Auditors and judges will respect honesty over hand-waving.
3. **dWallet on-chain registration cost.** Ika program creates a dWallet account on Solana. We need to confirm SOL-fee size for DKG so we can either sponsor via Kora or surface to user. Probably trivial but unverified.
4. **User-share encryption canonical message.** The Umbra integration burnt a day on a non-deterministic-passkey-signature bug (master seed mismatch). For Ika we'll pre-derive once, persist, never re-derive — and the canonical message will be domain-separated from Umbra's. We do **not** want both protocols deriving from the same passkey signature.
5. **Recovery on device loss.** If the user share is encrypted with a device-bound passkey, losing the device = losing the dWallet. Path forward (post-MVP): integrate with LazorKit's planned device-migration flow OR ship a key-export-to-secure-cloud as opt-in. Document, don't ship in MVP.

---

## 7. What we need from Fesal

1. **gRPC-in-RN guidance** — does `@ika.xyz/sdk` work in React Native today, or do we proxy?
2. **Reference example for the Solana side** — is there a default dWallet-controller program we can use, or do we write a minimal Anchor one?
3. **CloudMax 20x program** — Mehmet mentioned this on the call; the bounty page also says "comment to be considered." Want to formalize the ask now since the build pace depends on it.
4. **Bounty submission deadline** — listing doesn't show it; want to align with May 11 Frontier wall.
5. **Anything in this plan that misreads how Ika actually works.** Better to take the hit now than re-architect mid-build.

---

## 8. Why this wins the side-track

- **Only 4 current submissions.** Mathematically generous bracket.
- **Consumer mobile angle is empty.** Most Ika integrations to date are infra / institutional. A passkey-first mobile wallet that hides MPC behind Face ID is the consumer surface they don't have yet.
- **Composability story.** Seedless already integrates Umbra (privacy primitives) and LazorKit (passkey smart wallet). Adding Ika makes it the first consumer wallet stitching three Solana-anchored protocols into one app — that's the hackathon thesis judges remember.
- **No bridge, no wrapped token, no seed phrase.** All three are crypto-UX failure modes. We delete all three at once.

---

## 9. Reference

- Whitepaper: `/Users/franciscodex/seedless/ika-whitepaper.pdf`
- Pre-alpha intro: https://solana-pre-alpha.ika.xyz/introduction
- Pre-alpha installation: https://solana-pre-alpha.ika.xyz/getting-started/installation.html
- Ika docs root: https://docs.ika.xyz/docs/sdk
- Ika dWallet concept: https://docs.ika.xyz/docs/core-concepts/dwallets
- Github: https://github.com/dwallet-labs/ika
- Bounty listing: https://superteam.fun/earn/listing/encrypt-ika-frontier-april-2026
- Fesal post: https://x.com/iamknownasfesal/status/2041960898533654618
- Reference apps on Ika: keyspring.app, x.com/waapxyz
