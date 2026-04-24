# Umbra Integration Plan — Seedless Wallet

**Drafted:** Apr 22 2026 · **Status:** Planning (v2 — comprehensive rewrite) · **Author:** Francis (claude pairing)
**Targets:** Colosseum Frontier hackathon — Umbra side-track (Superteam Earn). Submission window: now → May 11 2026.

**Sources crawled (Apr 22 2026):**
- `sdk.umbraprivacy.com` (TypeDoc + llms.txt)
- `docs.umbraprivacy.com` Mintlify site (every page under `sdk/`, `reference/`, `indexer/`, `relayer/`, `concepts/`, `advanced/` — all read locally from the `umbra-defi/docs` repo at `/tmp/umbra-docs/`)
- `github.com/umbra-defi/rn-examples` — full `zk/` module read verbatim
- OpenAPI specs `openapi-relayer.yaml`, `openapi-read-service.yaml`
- Architecture deep-dives: `comprehensive-indexer-architecture.md`, `relayer-architecture.md`, `utxo-indexer-architecture.md`

---

## 00. Bounty Blueprint — Colosseum Frontier × Umbra side-track

**READ BEFORE EVERY CHANGE.** This is the contract we're shipping against. Every PR, every file, every design decision must trace back to one of the judging criteria below. If a change doesn't serve one of these, question it.

### 00.1 Prize pool
- 🥇 1st place — **$5,000 USDC**
- 🥈 2nd place — **$3,000 USDC**
- 🥉 3rd place — **$2,000 USDC**

### 00.2 Judging criteria (the 7 axes every decision gets scored on)

| # | Criterion | What it means for Seedless × Umbra |
|---|---|---|
| 1 | **Core SDK Integration** | How deeply we use `@umbra-privacy/sdk`. Not just one call — multiple flows: register, deposit, UTXO create, claim. Use the SDK surfaces as intended. Don't reimplement primitives. |
| 2 | **Innovation** | A novel way Umbra gets used. Our hook: **private main-wallet → burner funding** — breaks the on-chain link between smart-wallet and burner. Nobody else will have this. |
| 3 | **Technical Execution** | Clean adapter pattern, correct error handling (8 staged error classes — §8), deterministic master-seed derivation, proper proof freshness / staleness handling, recovery paths for failed MPC callbacks. No shortcuts. |
| 4 | **Product/Commercial Potential** | Seedless already has users, $SEED token, active community, 4 phases shipped. Umbra inside Seedless = real path to monetization, not a throwaway demo. |
| 5 | **Impact** | Measurable privacy improvement. Replace our fake SHA256-stealth with real mixer UTXOs. Quantify: anonymity set size, unlink probability, relayer-as-fee-payer gas savings. |
| 6 | **Usability** | Mobile-first. Passkey wallet (no seed phrase). One-tap private receive. Clear UX for the dual-instruction pattern (progress: handler tx → MPC → callback tx). Error copy humans understand. |
| 7 | **Completeness / Clarity** | README is crisp. Demo video walks every flow. Program IDs, endpoints, and versions documented. Judge should be able to run it in under 10 minutes. |

### 00.3 Submission requirements (checklist — this is non-negotiable)

- [ ] **Public GitHub repo** — code visible to judges, license file present
- [ ] **README covering:**
  - [ ] Problem statement — what privacy gap we solve
  - [ ] Target users + concrete use cases
  - [ ] **How we use the Umbra SDK** — specific modules, flows, integration points (not just "we call the SDK")
  - [ ] Build instructions — `npm i`, `expo prebuild`, native module notes for `rn-zk-prover`
  - [ ] Test instructions — how a judge runs our flows end-to-end on devnet
  - [ ] Use instructions — walkthrough of each feature
  - [ ] **Program IDs + relevant on-chain links** — mainnet + devnet Umbra programs, our LazorKit program, devnet explorer links to example txs
- [ ] **Demo video ≤ 5 minutes** — shows every Umbra flow we ship. Voiceover. No dead air. Devnet is fine.

### 00.4 Self-audit questions (run these before every commit)

1. Does this change serve a judging criterion? Which one?
2. Is the Umbra SDK doing the work, or are we reimplementing crypto primitives?
3. If a judge ran this right now, would the README let them reproduce the flow?
4. Is the demo-video storyboard still coherent after this change?
5. Have I updated the program-IDs / endpoints doc if anything moved?

### 00.5 What this blueprint is NOT

- Not a plan. The plan is §10 (phased roadmap).
- Not a technical spec. That's §5–§9.
- It's the **rubric**. Keep it next to you.

---

## 0. tl;dr (read this if nothing else)

Seedless ships a **fake stealth layer today** — `src/utils/stealth.ts` SHA256-derives sequential keypairs and sweeps everything back to the main wallet. It's privacy theatre.

**Umbra** is real: encrypted balances (Rescue cipher + Arcium MPC) + a unified mixer (Indexed Merkle Tree, depth 20, ~1M leaves/tree, Groth16 ZK proofs) + compliance viewing keys (Poseidon hierarchy + X25519 grants). Their SDK is factory-pattern TypeScript built on `@solana/kit`, with first-class React Native support via `@umbra-privacy/rn-zk-prover` (native Mopro/Arkworks bindings — **no WASM-on-mobile blocker**).

**The single real blocker** is wiring LazorKit's secp256r1-passkey smart wallet into Umbra's `IUmbraSigner` interface, which expects an Ed25519 wallet for both transaction signing and the master-seed-derivation message signature. There is a clean escape hatch the docs spell out: override `masterSeedStorage.generate` so we derive (and persist) the master seed ourselves, completely bypassing `signer.signMessage`. Combined with a thin `LazorKitUmbraSigner` adapter for `signTransaction(s)`, that's the integration.

**Strategy for Frontier:**
1. **Stealth replacement** — swap `stealth.ts` for Umbra receiver-claimable UTXOs. (Real privacy.)
2. **Burner anonymous funding** — main wallet funds burners via receiver-claimable UTXOs. Breaks the on-chain main→burner link. (Composable narrative.)
3. **Compliance viewing key share** — generate a yearly TVK and let user share it via QR. Judges love this. Optional polish.

Phased plan in §10. Ship-non-stop mode — no calendar, exit criteria gate each phase.

---

## 1. Mental model — what Umbra actually is

### 1.1 Two privacy primitives, used independently or together

| Primitive | Hides | How |
|---|---|---|
| **Encrypted Token Accounts (ETAs)** | The *amount* | Rescue cipher (over `p = 2^255 − 19`) encrypts the balance on-chain. Arcium MPC does add/subtract on the ciphertext during deposits/withdraws. |
| **Unified Mixer Pool (UTXOs)** | *Who paid whom* | Poseidon commitments inserted as leaves into an Indexed Merkle Tree. Burning a leaf releases funds via Groth16 ZK proof — the burn doesn't reveal which leaf. |

You can use either alone or both together. Strongest privacy is **mixer + ETAs**: amount and counterparty both hidden.

### 1.2 The dual-instruction pattern (everything confidential)

Every confidential op (deposit, withdraw, MXE→Shared conversion, compliance re-encryption) is two on-chain transactions:

1. **Handler tx** — your wallet signs; validates inputs; queues an MPC computation
2. **Arcium callback tx** — Arcium nodes compute off-chain; threshold-sign the result; submit it back on-chain to update state

The SDK awaits both before returning. Adds ~few seconds of latency vs a vanilla SPL transfer. Result objects include both `queueSignature` and `callbackSignature` so the UI can show progress.

For mixer claims specifically, the **relayer** pays SOL and submits the tx — your wallet **never appears as fee payer** for the claim. This is the strongest UX win Umbra has over rolling our own.

### 1.3 What Umbra does NOT hide

- That you are interacting with Umbra (program calls are public)
- Mixer deposit/withdraw amounts (committed at deposit, revealed at claim)
- Timing (deposit → immediate withdraw is correlation-trivial)

### 1.4 Confirmed key facts (from docs)

- **Programs:** mainnet `UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh`, devnet `DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`
- **Indexer:** mainnet `https://utxo-indexer.api.umbraprivacy.com`, devnet `https://utxo-indexer.api-devnet.umbraprivacy.com`. Returns Protobuf. No auth — rate-limited (429 on overflow).
- **Relayer:** mainnet `https://relayer.api.umbraprivacy.com`, devnet `https://relayer.api-devnet.umbraprivacy.com`. JSON. No auth — rate-limited.
- **ZK CDN:** `https://zk.api.umbraprivacy.com` (versioned manifest)
- **Merkle tree:** depth 20 → 1,048,576 leaves per tree, up to 2^128 trees per pool (effectively infinite)
- **Stale-proof window:** on-chain program stores **100 most recent Merkle roots**; a proof against any of them is valid. Always fetch fresh proofs near submission.
- **Protocol fee:** `floor(amount × 35 / 16384)` ≈ 0.2136%
- **Relayer fee:** currently 0
- **Anonymity set:** the entire pool — every UTXO is a candidate for any burn proof
- **Recovery:** same wallet + same network = same keys. Deterministic. No backup phrases beyond the wallet itself.

---

## 2. Where Seedless is today (what changes, what stays)

### 2.1 Current "stealth" — to be replaced

`src/utils/stealth.ts` (292 lines):
```ts
masterSeed = SecureStore.get('stealth_master_seed_<walletId>') || random(32)
stealthKey[i] = Keypair.fromSeed(SHA256(masterSeed || walletId || 'stealth' || i))
```

This is sequential keypair derivation, not stealth. Sweeps re-link everything to the main wallet. No ZK, no mixer, no anonymity set.

**Action:** delete (or hide behind a `LEGACY_STEALTH=true` flag for one release). Replace `StealthScreen.tsx` (734 lines) UI surface with Umbra UTXO flow.

### 2.2 Current burners — keep, augment with Umbra funding

`src/utils/burner.ts` (287 lines): isolated `Keypair.generate()` ed25519 keypairs, secret stored in SecureStore. Sweep via `SystemProgram.transfer`. **This is fine** — burners aren't the problem; the problem is that *funding* a burner from main wallet leaves a public link.

**Action:** add `fundBurnerViaUmbra(burnerId, amount)` — main wallet creates a **receiver-claimable UTXO** with the burner address as recipient. Burner claims later (or on first spend). Main→burner link is broken.

Bonus: the burner keypair itself is already a regular Ed25519 keypair, so when the burner claims its UTXO it can be a vanilla `IUmbraSigner` (no LazorKit adapter needed for the burner side). Simpler than the main-wallet path.

### 2.3 Main wallet — LazorKit smart wallet

Our main wallet is a passkey-controlled smart wallet PDA under program `4h3XoNReAgEcHVxcZ8sw2aufi9MTr7BbvYYjzjWDyDxS` (v2). Signing is **secp256r1 (passkey)**, not Ed25519. All sends go through `execute(ixs, ...)` / `signAndSendWithSession(ixs)` / `transferSol(...)`.

**This is where the only real integration friction lives.** See §5.

### 2.4 Stack we already have

- React Native 0.81.5, Expo 54.0.30 (dev-client — native modules OK)
- `@solana/web3.js` 1.98.4, `@coral-xyz/anchor` 0.32.1
- `@lazorkit/wallet-mobile-adapter` 2.0.0-beta.0
- `react-native-get-random-values`, `buffer`, `expo-secure-store`, `expo-crypto`, `expo-file-system`, `expo-asset` (transitive via Expo)
- Helius RPC keyed via `EXPO_PUBLIC_HELIUS_DEVNET_KEY`

---

## 3. The dependency delta

### 3.1 New packages

```jsonc
// package.json additions
"@umbra-privacy/sdk":           "^<latest>",
"@umbra-privacy/rn-zk-prover":  "^<latest>",  // native, requires dev-client rebuild
"@tanstack/react-query":        "^5",          // used by rn-examples zk module — optional but easier
// expo-asset, expo-file-system already transitive via Expo SDK 54
```

### 3.2 The `@solana/kit` question

**Umbra is built on `@solana/kit`, not `@solana/web3.js`.** Kit is the new modular Solana SDK (formerly `@solana/web3.js v2`). Our codebase is on classic `@solana/web3.js 1.98.4`.

**What this means in practice:**
- Umbra exports its types through `@umbra-privacy/sdk`, `@umbra-privacy/sdk/types`, `@umbra-privacy/sdk/interfaces`, `@umbra-privacy/sdk/utils`, `@umbra-privacy/sdk/constants`, `@umbra-privacy/sdk/errors`. We talk to *those* surfaces — we don't need to import from `@solana/kit` directly for normal flows.
- `Address` in the Umbra SDK is a branded base58 string — interchangeable with the base58 string form of our `PublicKey.toBase58()`.
- `SignableTransaction` / `SignedTransaction` / `SignedMessage` are Kit types. Our `LazorKitUmbraSigner` will need to construct/return them. Kit's transaction format differs from web3.js `VersionedTransaction`.
- Umbra adds `@solana/kit` as a transitive dep — fine for our bundle, just larger. Both libraries can coexist.

**Action:** in `src/umbra/signer.ts`, do all Kit ↔ web3.js adapter work in **one file**. Don't leak Kit types into the rest of the codebase.

### 3.3 Polyfills

Already shipping the ones Umbra needs (random, buffer). No new polyfills expected. If anything fails at runtime, suspect `text-encoding` or `crypto.subtle` — both already polyfilled in our setup.

---

## 4. New files / change map

```
src/umbra/
  ├─ client.ts            # getUmbraClient wrapper, network toggle, endpoints, masterSeedStorage override
  ├─ signer.ts            # LazorKitUmbraSigner adapter (the hard part — see §5)
  ├─ master-seed.ts       # Our own master-seed derivation + SecureStore persistence (escape hatch)
  ├─ registration.ts      # register() wrapper, idempotent, callbacks → UI progress
  ├─ deposit.ts           # ATA → ETA helper (DepositResult unwrap, await/non-await modes)
  ├─ withdraw.ts          # ETA → ATA helper
  ├─ utxo.ts              # createReceiverClaimableUtxo / scanClaimableUtxos / claim (self/receiver × encrypted/public)
  ├─ conversion.ts        # MXE → Shared upgrade
  ├─ compliance.ts        # viewing-key TVK derive + grant create/revoke (Phase 5)
  ├─ recovery.ts          # claimStagedSol/Spl for failed-MPC-callback funds
  ├─ errors.ts            # error mappers — translate UmbraError stages to user-facing messages
  └─ zk/                  # ← copy verbatim from rn-examples
      ├─ index.ts
      ├─ constants.ts                # ZK_ASSETS_BASE_URL = https://zk.api.umbraprivacy.com
      ├─ types.ts                    # ZKeyType, ClaimVariant n1-n4, MoproInputs
      ├─ query.ts                    # @tanstack/react-query hooks
      ├─ provers/
      │   ├─ prover.ts               # createZkProver → Zk.mopro_umbra_2.generateCircomProof
      │   ├─ register.ts
      │   ├─ create-utxos.ts
      │   └─ claims-utxos.ts
      ├─ services/
      │   └─ zk-asset-service.ts     # bundled BUNDLED_ZKEYS + versioned CDN cache via expo-file-system
      └─ utils/
          ├─ mopro-inputs.ts         # u256ToBeBytes
          └─ proof-converter.ts      # Groth16 → flattened byte arrays

assets/zk/
  ├─ userregistration.zkey                # bundled (every user hits it once)
  └─ createdepositwithpublicamount.zkey   # bundled (most-common path)
  # all other variants: CDN-downloaded on first use

src/screens/
  ├─ StealthScreen.tsx              # REWRITE — receive via UTXO, ETA balance, claim
  ├─ BurnerScreen.tsx               # ADD "Fund anonymously via Umbra" button
  └─ WalletScreen.tsx               # OPTIONAL: "Send private" entry point routing through ETA/mixer

src/constants/index.ts              # ADD UMBRA_PROGRAM_ID_DEVNET/MAINNET, indexer/relayer URLs, USE_DEVNET-toggled
.env.example                        # ADD note about (no Umbra keys required — open API)
App.tsx                             # Wrap in QueryClientProvider IF using rn-examples query hooks
```

**Files NOT changing:**
- `src/utils/burner.ts` core (just adds one new function, doesn't rewrite the keypair model)
- LazorKit integration files (we adapt around them, not into them)
- Existing session/authoritites/swap screens

---

## 5. The real blocker — LazorKit signer adapter (and the escape hatch)

### 5.1 What `IUmbraSigner` requires

```ts
interface IUmbraSigner {
  readonly address: Address                                              // base58 string
  signTransaction(tx: SignableTransaction): Promise<SignedTransaction>
  signTransactions(txs: readonly SignableTransaction[]): Promise<SignedTransaction[]>
  signMessage(msg: Uint8Array): Promise<SignedMessage>                   // returns Ed25519 sig
}
```

**Two sub-problems:**

1. **`signTransaction(s)`** — Umbra builds a Kit-format `SignableTransaction` and expects a fully signed transaction back. LazorKit signs through `client.execute(ixs, ...)`, which wraps everything in a passkey signature → lazorkit program call. Different signing model.

2. **`signMessage(msg)`** — Umbra default behaviour is: prompt the user to sign a deterministic message, then run `KMAC256(key="Umbra Privacy - MasterSeedGeneration", msg=Ed25519_sig(UMBRA_MESSAGE_TO_SIGN), dkLen=64, S="umbra/1.0.0|...|seed")` to derive a **64-byte master seed**. From that master seed every Umbra key (MVK, Poseidon PK, X25519, Rescue blinding, etc.) is derived via further KMAC256 calls. **This requires an Ed25519 signature.** LazorKit signs with secp256r1.

### 5.2 The escape hatch — `masterSeedStorage.generate` override

Per `sdk/wallet-adapters.mdx` and `sdk/advanced/recovery.mdx`, `getUmbraClient` accepts a `masterSeedStorage` dep with `load`, `store`, and **`generate`** functions. Override `generate` and Umbra **never calls `signer.signMessage`**. We supply the master seed ourselves.

```ts
// src/umbra/master-seed.ts
import * as SecureStore from 'expo-secure-store';
import { kmac256 } from '@noble/hashes/sha3-addons';

const MASTER_SEED_KEY = (smartWalletPda: string) => `umbra_master_seed_${smartWalletPda}`;

export async function loadMasterSeed(addr: string): Promise<Uint8Array | null> {
  const raw = await SecureStore.getItemAsync(MASTER_SEED_KEY(addr));
  return raw ? new Uint8Array(Buffer.from(raw, 'base64')) : null;
}

export async function storeMasterSeed(addr: string, seed: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(MASTER_SEED_KEY(addr), Buffer.from(seed).toString('base64'));
}

export async function generateMasterSeed(addr: string, lazorkitClient: LazorKitClient): Promise<Uint8Array> {
  // Option A (preferred): ask user to passkey-sign a deterministic message, KMAC256 it.
  const msg = new TextEncoder().encode(`Umbra Master Seed | Seedless | ${addr}`);
  const passkeySig = await lazorkitClient.signMessageWithPasskey(msg);  // secp256r1 sig
  return kmac256(
    new TextEncoder().encode('Umbra Privacy - MasterSeedGeneration'),
    passkeySig,
    { dkLen: 64, personalization: 'umbra/1.0.0|seedless|seed' }
  );
}
```

Wire it into `getUmbraClient`:

```ts
const client = await getUmbraClient({
  signer: lazorKitUmbraSigner,
  network: USE_DEVNET ? 'devnet' : 'mainnet',
  rpcUrl: HELIUS_RPC,
  rpcSubscriptionsUrl: HELIUS_WS,
  indexerApiEndpoint: UMBRA_INDEXER_URL,
  deferMasterSeedSignature: true,  // don't prompt at construction
}, {
  masterSeedStorage: {
    load:     () => loadMasterSeed(smartWalletPda),
    store:    (s) => storeMasterSeed(smartWalletPda, s),
    generate: () => generateMasterSeed(smartWalletPda, lazorkitClient),
  },
});
```

**This is the integration's single most important architectural decision.** It means:
- We control the master seed lifecycle entirely — derive once, persist in SecureStore, reuse forever
- LazorKit's passkey signing is used **once at first registration**, never again for Umbra
- `signer.signMessage` becomes **dead code** for our setup — we can throw `NotImplementedError` from it
- Recovery story: same passkey on the same device → same seed (because the message + passkey is deterministic). Cross-device recovery needs the seed to be backed up via LazorKit's existing key-sync (or just user logs in fresh and re-registers — Umbra registration is **idempotent**).

### 5.3 The `signTransaction(s)` adapter

For Umbra → LazorKit transaction signing, build a `LazorKitUmbraSigner`:

```ts
class LazorKitUmbraSigner implements IUmbraSigner {
  constructor(public readonly address: Address, private lazorClient: LazorKitClient) {}

  async signTransaction(tx: SignableTransaction): Promise<SignedTransaction> {
    // 1. Decompile Kit tx → instruction list
    const ixs = decompileToInstructions(tx);
    // 2. Run through LazorKit's execute pipeline
    const sig = await this.lazorClient.execute(ixs, { feePayer: this.address });
    // 3. Repack into Kit SignedTransaction (only the signature, not a full re-sign)
    return attachSignature(tx, sig);
  }

  signTransactions(txs) { return Promise.all(txs.map(t => this.signTransaction(t))); }

  async signMessage(_msg: Uint8Array): Promise<SignedMessage> {
    throw new Error('signMessage not used — masterSeedStorage.generate handles it');
  }
}
```

**Risks here, by likelihood:**
- **Kit ↔ web3.js instruction translation friction** — Umbra builds Kit `IInstruction` objects; LazorKit `execute` expects web3.js `TransactionInstruction[]`. Field-by-field shim required. Manageable.
- **Fee payer mismatch** — Umbra may set fee payer = caller's address; LazorKit always pays through its smart wallet. The smart wallet PDA *is* our address from Umbra's perspective, so this should align — but worth verifying in the first integration test.
- **Multi-tx flows** — UTXO creation submits 2 txs (proof account + UTXO). Both need to land. Use Umbra's `TransactionCallbacks` (`pre`/`post` per step) for UI progress.
- **Session keys** — our v2 Fast Send uses a session keypair. Umbra ops have non-trivial CU usage (especially ZK-proof-bearing claim txs); they may exceed `SolLimit`/`ProgramWhitelist` defaults. Test session compatibility in Phase 4. Worst case: Umbra ops always require a passkey prompt.

### 5.4 Path tiering for the hackathon

| Path | Description | Phase | Risk | Use case |
|---|---|---|---|---|
| **C** | Demo with a local ed25519 throwaway keypair as `IUmbraSigner` (separate "Umbra demo wallet" inside the app) | 1–2 | Low | Day-one unblock; ensures we have a working integration to demo even if Path A stalls |
| **A** | Full LazorKitUmbraSigner with masterSeedStorage override | 3 | Med-High | The real integration story for the pitch |
| **B** | Hybrid: smart wallet funds an in-memory ephemeral keypair (created per-session) which acts as Umbra signer | fallback | Med | Salvage option if A's tx adapter is too painful for the deadline |

**Always** start Path C in Phase 1 so we have something to demo. Switch to A in Phase 3.

### 5.5 Unblocker — DM Umbra team in Phase 1

Ask Marcus / the Umbra team on Discord:
1. "Has anyone integrated Umbra against a non-Ed25519 signing wallet (passkey, MPC, multisig)? Any reference for the `masterSeedStorage.generate` override pattern?"
2. "Are devnet relayer + indexer fully populated, or should we focus on mainnet for any specific demo?"
3. "Devnet supported tokens — `supported-tokens.mdx` only lists mainnet. What's available for devnet testing?"

---

## 6. Registration, deposit, withdraw, UTXO flow — what the code actually looks like

### 6.1 Registration (one-time per user, idempotent)

Three on-chain steps, each **skipped if already done** in a previous session:

1. `userAccountInitialisation` — creates the on-chain user PDA
2. `registerX25519PublicKey` — registers the user's X25519 pubkey for ETA shared-mode encryption (`confidential: true`)
3. `registerUserForAnonymousUsage` — registers the Poseidon user commitment + Groth16 proof, enabling mixer claims (`anonymous: true`)

```ts
import { getUserRegistrationFunction } from '@umbra-privacy/sdk';
import { getUserRegistrationProver } from '@umbra-privacy/web-zk-prover';  // OR rn-zk-prover equivalent

const register = getUserRegistrationFunction(
  { client },
  { zkProver: getUserRegistrationProver() },
);

const sigs = await register({
  confidential: true,    // enables ETAs in Shared mode (locally decryptable)
  anonymous: true,       // enables mixer eligibility
  callbacks: {
    userAccountInitialisation:    { pre: () => setStep('Creating account…'),    post: () => setProgress(33) },
    registerX25519PublicKey:      { pre: () => setStep('Registering encryption key…'), post: () => setProgress(66) },
    registerUserForAnonymousUsage:{ pre: () => setStep('Enabling mixer…'),      post: () => setProgress(100) },
  },
});
```

**Idempotency:** safe to call on every app launch. Umbra checks on-chain state and skips completed steps. We can use `getUserAccountQuerierFunction` to check `state === "exists"` first and skip the call entirely if all flags are set.

### 6.2 ETA Encryption modes — MXE-only vs Shared

When a user registers with `confidential: true`, deposits go into **Shared mode** by default — encrypted under both the Arcium MPC key AND the user's X25519 key. Lets the user decrypt their own balance locally without an MPC round-trip. This is what we want.

If the account is in MXE-only mode (older flow), upgrade with:

```ts
const convert = getNetworkEncryptionToSharedEncryptionConverterFunction({ client });
const result = await convert([usdcMint, solMint]);
// result.converted = Map<mint, signature>; result.skipped = Map<mint, reason>
```

### 6.3 Deposit (public ATA → ETA)

Direct deposit, no ZK proof, dual-instruction MPC pattern under the hood:

```ts
const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
const result = await deposit(destinationAddress, mintAddress, 1_000_000n);
// result.queueSignature, result.callbackSignature, result.callbackStatus, result.callbackElapsedMs
```

Returns a `DepositResult` with both signatures. `callbackStatus` is `"finalized" | "pruned" | "timed-out"`. If `awaitCallback: false`, returns immediately after handler tx — UI polls separately.

### 6.4 Withdraw (ETA → public ATA)

Mirror of deposit:

```ts
const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });
const result = await withdraw(destinationAta, mintAddress, 500_000n);
```

### 6.5 Mixer — UTXO creation

Four creator functions, the matrix is **source × claim-type**:

|   | **Self-claimable** (only creator can claim) | **Receiver-claimable** (encrypted to recipient) |
|---|---|---|
| **From ATA** (public balance) | `getPublicBalanceToSelfClaimableUtxoCreatorFunction` | `getPublicBalanceToReceiverClaimableUtxoCreatorFunction` |
| **From ETA** (encrypted balance) | `getEncryptedBalanceToSelfClaimableUtxoCreatorFunction` | `getEncryptedBalanceToReceiverClaimableUtxoCreatorFunction` |

Each requires `deps.zkProver` (Groth16). Returns `[proofAccountSig, utxoCreationSig]`.

```ts
const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
  { client },
  { zkProver: getCreateReceiverClaimableUtxoFromPublicBalanceProver() },
);
await createUtxo({ amount: 1_000_000n, destinationAddress: burnerPubkey, mint: USDC_MINT });
```

### 6.6 Mixer — scan + claim

```ts
const scan = getClaimableUtxoScannerFunction({ client });   // requires indexerApiEndpoint
const { selfBurnable, received, publicSelfBurnable, publicReceived } = await scan(treeIndex, 0);

// Claim path — decide whether claim into ETA or back to public ATA
const claimToEncryptedBalance = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
  { client },
  { zkProver: getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver() },
);
await claimToEncryptedBalance(received);
```

**Receiver-claimable batch sizes:** 1–16 (sixteen distinct ZK circuits). The batch endpoint `POST /v1/trees/{i}/proofs` accepts max **8 indices per request** for atomic same-root proofs. Self-claimable claims are always single-UTXO (`maxUtxoCapacity: 1`).

### 6.7 The 8-tier UTXO privacy table

From `sdk/mixer/privacy-analysis.mdx` — UTXOs are tagged by (creator-source, claim-side). 4 creators × 2 claim-sides = 8 tiers. Tier 1 = ETA→ETA (strongest). Tier 3 = ATA→ATA (weakest, but breaks the direct sender↔receiver link). Receiver-claimable UTXOs are naturally stronger anonymity than self-claimable because the burn timing is independent of any single user's behavior.

For Seedless:
- **Stealth replacement:** receiver-claimable, ATA → ETA (tier 5-ish). Sender public, recipient hidden, amount hidden after claim into ETA.
- **Burner funding:** receiver-claimable, ATA → ATA, with the burner address as recipient (tier 3). Sender public, recipient = burner pubkey but no direct on-chain link.

### 6.8 Querying balances

```ts
const queryBalances = getEncryptedBalanceQuerierFunction({ client });
const balances = await queryBalances([usdcMint, solMint]);
// Map<Address, { state: "shared"; balance: U64 } | { state: "mxe" } | { state: "uninitialized" } | { state: "non_existent" }>
```

For Shared-mode accounts, the SDK locally decrypts via Rescue cipher. For MXE-only, balance is opaque without an MPC re-encryption (use `getNetworkEncryptionToSharedEncryptionConverterFunction` to upgrade).

### 6.9 Failed-MPC recovery

If a confidential op queues but the Arcium callback never lands, the SOL/SPL fees are staged in a unified pool PDA. Recovery functions:

```ts
const claimSol = getClaimStagedSolFromPoolFunction({ client });
const claimSpl = getClaimStagedSplFromPoolFunction({ client });
await claimSol(mint, lamports, destination);
await claimSpl(mint, amount, destinationAta);
```

**Wire these into the Errors UI** — if user sees a `"timed-out"` callback status, surface a "recover funds" button.

---

## 7. ZK proving on React Native — the rn-examples pattern

### 7.1 Architecture

`@umbra-privacy/rn-zk-prover` is a Mopro/Arkworks native module. JS calls `Zk.mopro_umbra_2.generateCircomProof(zkeyPath, inputs, ProofLib.Arkworks)` and receives the proof bytes. **No WASM**, no main-thread blocking beyond the native call.

### 7.2 zkey distribution

| zkey | Bundling decision |
|---|---|
| `userRegistration` | **Bundled** — every user hits it once |
| `createDepositWithPublicAmount` | **Bundled** — primary deposit path |
| `createDepositWithConfidentialAmount` | CDN |
| `claimDepositIntoConfidentialAmount` (n1, n2, n3, n4 batch sizes) | CDN, lazy per batch |
| `claimDepositIntoPublicAmount` (n1, n2, n3, n4) | CDN, lazy per batch |

**Manifest URL:** `https://zk.api.umbraprivacy.com/manifest.json` (versioned).
**Local cache path:** `Paths.document/zk-assets/<version>/`.
**Cache strategy:** check manifest version on app launch, evict + re-download on mismatch.

### 7.3 Sizes

The rn-examples repo bundles only the two most common zkeys, which strongly implies the others are large enough that bundling all bloats the install. **Action:** measure actual sizes during Phase 1 (`du -h *.zkey` from the manifest URL) and re-decide bundle policy if numbers warrant it.

### 7.4 Optional: react-query

rn-examples uses `@tanstack/react-query` for `useZKey`, `useDownloadZKey`, `usePreloadZKeysOnMount` hooks. Nice ergonomics for prefetch. We can adopt the hooks 1:1 by wrapping the app in `QueryClientProvider` in `App.tsx`. **Optional** — we can also call the underlying functions directly without the hook layer.

---

## 8. Compliance — viewing keys + X25519 grants (Phase 5 polish)

### 8.1 Viewing key hierarchy

Poseidon-derived TVKs scoped by time:
```
Master TVK
  └─ Mint TVK (per token)
       └─ Yearly TVK
             └─ Monthly TVK
                   └─ Daily TVK
                         └─ Hourly TVK → Second TVK
```

Sharing the **yearly TVK** for USDC means an auditor can decrypt every USDC balance change you made that year — and nothing else. Sharing the **daily TVK** scopes it tighter. View-only — never spend.

### 8.2 X25519 compliance grants

For **active disclosure** (auditor can re-encrypt your ciphertexts under their X25519 key):

```ts
const createGrant = getComplianceGrantIssuerFunction({ client });
await createGrant(receiverAddr, granterX25519, receiverX25519, nonce);

const revoke = getComplianceGrantRevokerFunction({ client });
await revoke(receiverAddr, granterX25519, receiverX25519, nonce);
```

Re-encryption (auditor side, using their own client):
```ts
const reencrypt = getSharedCiphertextReencryptorForUserGrantFunction({ client });
await reencrypt(granterX25519, receiverX25519, grantNonce, inputNonce, ciphertexts);
```

**Demo angle:** generate a yearly TVK for a single mint, render as QR, recipient scans → can decrypt that year's balance history. "Compliance without surveillance" is the soundbite.

---

## 9. Constraints, error-handling, edge cases

### 9.1 Network constraints

- **Token list (mainnet):** USDC, USDT, wSOL, UMBRA confirmed. Devnet token list **not documented** — needs Phase 1 confirmation from team.
- **Indexer rate-limit:** 429 on excess. Hold per-call retry with backoff.
- **Relayer rate-limit:** 429 on excess. Same retry policy.
- **Stale Merkle proofs:** 100-root rolling window on-chain. If a claim fails with `transaction-validate` stage, fetch fresh proofs and retry — that's the canonical signal for staleness.

### 9.2 Error handling — staged errors

Every major op throws a typed error with a `stage` field:
- `EncryptedDepositError` (12 stages)
- `EncryptedWithdrawalError` (9 stages)
- `RegistrationError` (12 stages)
- `ConversionError` (9 stages)
- `CreateUtxoError` (14 stages)
- `FetchUtxosError` (5 stages)
- `ClaimUtxoError` (11 stages)
- `QueryError` (6 stages)

**Retry policy:**
- `transaction-sign` / `MasterSeedSigningRejectedError` → **never auto-retry** (user cancelled)
- `transaction-send` with `signature` present → **check on-chain first**, may have landed
- `transaction-validate` (claims) → fetch fresh UTXOs (stale proof)
- `RpcError` → exponential backoff
- All others → exponential backoff is safe

**Action:** `src/umbra/errors.ts` should map each `(errorClass, stage)` to a user-facing toast string. Example: `ClaimUtxoError.transaction-validate` → "Mixer state changed, refreshing UTXOs…" + auto-retry.

### 9.3 Branded types — TypeScript discipline

The SDK uses phantom-branded types extensively (`U64`, `U256`, `RcCiphertext`, `Bn254FieldElement`, `OptionalData32`, etc.). You can't pass a raw `bigint` where a `U64` is expected — compiler error. Use the `create*` helpers from `@umbra-privacy/sdk`:

```ts
import { createU64, createOptionalData32 } from '@umbra-privacy/sdk';
const amount = createU64(BigInt(userInput), 'depositAmount');
const meta   = createOptionalData32(new Uint8Array(32));
await deposit(dest, mint, amount);
```

These also do runtime range/length validation. Throw `MathematicsAssertionError` on bad input — catch at the UI boundary and show a validation message.

### 9.4 Recovery model

Same wallet + same network + same `masterSeedStorage.generate` implementation = **same master seed every time** = same keys. No mnemonic backup needed beyond:
- Keep the LazorKit passkey (already what users do)
- Don't change the passkey-message we KMAC256 (constant in `master-seed.ts`)
- The SecureStore copy is just a cache — losing it is recoverable if user re-passkey-signs

---

## 10. Phased plan — ship-non-stop mode

No calendar. Each phase has a clear exit criterion. The next phase starts the moment the previous one passes its check. Submission window closes May 11 — pace is "as fast as the previous phase clears."

### Phase 1 — Foundation + unblock

- [ ] DM Umbra team (passkey adapter, devnet endpoints, devnet token list)
- [ ] Install `@umbra-privacy/sdk`, `@umbra-privacy/rn-zk-prover`, `@tanstack/react-query`
- [ ] `npx expo prebuild --clean`, rebuild dev-client (iOS first; Android once iOS is green)
- [ ] Copy `zk/` module from `rn-examples` into `src/umbra/zk/` (verbatim, then adapt imports)
- [ ] Download bundled zkeys → `assets/zk/`, measure sizes
- [ ] Wire `src/constants/index.ts`: `UMBRA_PROGRAM_ID_*`, `UMBRA_INDEXER_URL_*`, `UMBRA_RELAYER_URL_*`, `UMBRA_ZK_CDN`
- [ ] **Hello-world (Path C):** `getUmbraClient` with a throwaway local Ed25519 keypair as signer; call `register({ confidential: true, anonymous: true })`; verify on devnet via `getUserAccountQuerierFunction`

**Exit criteria:** Hello-world registration tx lands on devnet, user account queryable.

### Phase 2 — Core Umbra flows

- [ ] Deposit: public devnet SOL/USDC → ETA, log `DepositResult`
- [ ] Query encrypted balance, render decrypted Shared-mode amount in UI
- [ ] Withdraw: ETA → public ATA
- [ ] Create receiver-claimable UTXO → second test wallet
- [ ] Scan + claim that UTXO into ETA on the recipient
- [ ] Wire `TransactionCallbacks` for UI progress on every op
- [ ] Error mapping: `src/umbra/errors.ts` covering all 8 staged error classes
- [ ] **New StealthScreen UI** (Path C signer): receive via UTXO, view ETA balance, claim button

**Exit criteria:** end-to-end private send between two test wallets working, fully on devnet, UI rendering correctly.

### Phase 3 — LazorKit adapter

- [ ] `src/umbra/master-seed.ts`: KMAC256-from-passkey-sig + SecureStore persistence
- [ ] `src/umbra/signer.ts`: `LazorKitUmbraSigner` — `signTransaction` via `lazorClient.execute`, `signMessage` throws (unused)
- [ ] Wire `masterSeedStorage` override on `getUmbraClient`
- [ ] Re-run Phase 2 flows with LazorKit signer instead of throwaway keypair
- [ ] Debug Kit↔web3.js instruction adapter
- [ ] Test: does a session-key Fast Send work for Umbra ops? (probably not for ZK-bearing claims; document the finding)
- [ ] **Bailout:** if Path A blocks for more than two consecutive sessions, ship demo with Path C signer and document Path A as a known follow-up

**Exit criteria:** main wallet can deposit/withdraw/create-UTXO via Umbra without per-op passkey prompts beyond initial registration.

### Phase 4 — Burner integration

- [ ] `fundBurnerViaUmbra(burnerId, amount, mint)` in `src/utils/burner.ts`
- [ ] BurnerScreen: "Fund anonymously (via Umbra)" button alongside existing direct fund
- [ ] Burner claims UTXO on first spend (or via "Refresh balance" button)
- [ ] Verify on-chain: explorer view of main wallet shows mixer deposit, burner shows mixer claim, **no direct edge**

**Exit criteria:** demo-ready anonymous burner funding flow.

### Phase 5 — Polish + submission

- [ ] **Optional:** compliance viewing-key generation + QR share (yearly TVK for one mint)
- [ ] **Optional:** "recover staged funds" UI for `timed-out` callback states
- [ ] Demo video ≤5 min: register → deposit → private send → anonymous burner fund → (optional) viewing key share
- [ ] README: architecture diagram, setup, screenshots, link to `umbra-integration-plan.md`
- [ ] Pitch deck v3: add Umbra slide as Phase 5 milestone, narrative of "real privacy primitives"
- [ ] Submit to Colosseum Frontier + Umbra side-track on Superteam Earn

**Order of operations if time pressure hits:** Phases 1+2+4 are the minimum viable submission. Phase 3 (LazorKit adapter) is the differentiator but Phase 4 also works with Path C. Phase 5 polish is upside, not floor.

---

## 11. Requirements & verification checklist

### 11.1 Already in place

- [x] Expo dev-client (native modules OK)
- [x] Helius RPC (mainnet + devnet)
- [x] Polyfills: `react-native-get-random-values`, `buffer`
- [x] SecureStore, expo-crypto, expo-asset, expo-file-system
- [x] LazorKit smart wallet PDA (= our `address` for Umbra)
- [x] Devnet env toggle (`USE_DEVNET`) and devnet faucet rhythm

### 11.2 Need to add

- [ ] `@umbra-privacy/sdk`, `@umbra-privacy/rn-zk-prover`, `@tanstack/react-query`
- [ ] Bundled zkeys: `assets/zk/userregistration.zkey`, `assets/zk/createdepositwithpublicamount.zkey`
- [ ] Constants for all Umbra endpoints + program IDs
- [ ] `LazorKitUmbraSigner` adapter
- [ ] `masterSeedStorage` override in client config
- [ ] Devnet test funds (SOL guaranteed; USDC TBD pending team confirmation)
- [ ] Dev-client rebuild after `rn-zk-prover` install

### 11.3 NOT needed (confirmed)

- ~~WASM runtime~~ — native prover
- ~~Self-hosted indexer~~ — Umbra hosts
- ~~Self-hosted relayer~~ — Umbra hosts (and devnet has one too)
- ~~API keys for Umbra~~ — open + rate-limited

### 11.4 Open questions for team

- Devnet token list (mainnet docs only list USDC/USDT/wSOL/UMBRA)
- Reference for non-Ed25519 signer integrations (passkey/MPC/multisig)
- Recommended pattern for `masterSeedStorage.generate` override (ours vs theirs)
- Rate-limit numbers on devnet indexer and relayer
- Anything special about Token-2022 mints in devnet pool?

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LazorKit Kit-tx adapter friction | High | High | Path C from Phase 1 ensures a demoable integration regardless |
| zkey bundle bloats install | Med | Med | Bundle 2 most-common, CDN-cache the rest (rn-examples pattern) |
| Devnet supports tokens we need | Med | Med | Pivot to mainnet for demo if necessary; mainnet relayer = no SOL fees |
| Dev-client rebuild breaks something | Low | High | Branch + revert ready; rebuild on a known-good commit |
| Android-vs-iOS prover parity | Low | Med | Demo iOS first (matches all our prior demos); test Android once iOS is green |
| Stale Merkle proof at claim time | Med | Low | Built-in retry mechanism; SDK error stage is the signal |
| Master seed lost (SecureStore wipe) | Low | Med | Recovery via re-deriving from passkey-sig; user re-registers (idempotent) |
| Umbra program deploys new version mid-hackathon | Low | High | Pin to specific program ID; ask team for stability commitments |
| Old-wallet `0x2` (LazorKit) blocks demo | Low | Med | Use a fresh v2 wallet for Umbra testing from the start |

---

## 13. Success criteria — Frontier Umbra side-track

Per Superteam Earn bounty (re-verify exact requirements when posting):

- [ ] Live devnet (or mainnet, if devnet token gap) demo of Umbra integration inside Seedless
- [ ] GitHub repo public; README explains the integration with diagram
- [ ] ≤5 min technical demo video
- [ ] Pitch deck slide on Umbra as a privacy primitive in Seedless
- [ ] At least **one** user-facing flow fully working end-to-end:
  - private send via mixer UTXO
  - private receive replacing stealth.ts
  - anonymous burner funding via UTXO
  - compliance viewing-key share
- [ ] Strong submission target: **two or more** of the above

**Minimum viable submission:** Phase 1 + Phase 2 + Phase 4 burner flow. Everything else upside.

---

## 14. Open items to track during implementation

- [ ] Exact `.zkey` file sizes (bundle vs CDN decision lives here)
- [ ] Devnet relayer URL: confirmed `https://relayer.api-devnet.umbraprivacy.com`
- [ ] Does `rn-zk-prover` need any iOS pod / Android Kotlin tweaks beyond `expo prebuild`?
- [ ] Master-seed derivation format — final spec for KMAC256 personalization string we use
- [ ] Indexer + relayer rate limits in numbers
- [ ] Exact size measurements after `prebuild` rebuild (App Store concern only if we ever go mainnet on iOS)
- [ ] Compliance demo: yearly TVK QR format — is it just a base58 string or a structured payload?

---

## 15. Sources (all read Apr 22 2026)

**Primary docs (Mintlify site / `umbra-defi/docs` repo):**
- `concepts/how-umbra-works.mdx`, `concepts/encrypted-balances.mdx`, `concepts/utxos-and-mixer.mdx`
- `sdk/{introduction, installation, quickstart, pricing, supported-tokens, wallet-adapters, creating-a-client, registration, deposit, withdraw, query, conversion, account-state, transfers, compliance, compliance-viewing-keys, compliance-x25519-grants}.mdx`
- `sdk/mixer/{overview, creating-utxos, fetching-utxos, claiming-utxos, privacy-analysis}.mdx`
- `sdk/advanced/{key-derivation, recovery, zk-provers, token-2022}.mdx`
- `sdk/advanced/cryptography/{overview, arcium-mpc, groth16, indexed-merkle-tree, kmac256, poseidon, rescue-cipher, x25519}.mdx`
- `sdk/understanding-the-sdk/{overview, dependency-injection, types, key-rotation, branded-types, callbacks, key-generators, zk-provers}.mdx`
- `sdk/api-reference/signers.mdx`
- `reference/{overview, client, registration, deposit, withdraw, query, conversion, mixer, compliance, errors}.mdx`
- `indexer/overview.mdx`, `indexer/api-reference/*` (stats, tree-metadata, tree-utxos, merkle-proofs, batch-proofs, utxos, utxo-single, health/{basic, detailed, liveness, readiness})
- `relayer/overview.mdx`, `relayer/api-reference/*` (info, submit-claim, claim-status, health)
- `openapi-relayer.yaml`, `openapi-read-service.yaml`
- Architecture deep-dives: `comprehensive-indexer-architecture.md`, `relayer-architecture.md`, `utxo-indexer-architecture.md`

**Reference implementation:**
- `github.com/umbra-defi/rn-examples` — `zk/` module read in full (constants, types, query hooks, all 4 prover factories, zk-asset-service with bundled + CDN cache, mopro-inputs, proof-converter)

**Our current state:**
- `src/utils/stealth.ts` (292 lines), `src/utils/burner.ts` (287 lines)
- `src/screens/StealthScreen.tsx` (734 lines), `src/screens/BurnerScreen.tsx`, `src/screens/WalletScreen.tsx`
- `src/constants/index.ts`, `package.json`

---

**Phase 1 kickoff action:** open Umbra Discord, post the three questions from §5.5 + §11.4. Then `npm i @umbra-privacy/sdk @umbra-privacy/rn-zk-prover @tanstack/react-query` and start Phase 1.
