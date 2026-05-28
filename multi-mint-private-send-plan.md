# Multi-mint private send refactor — execution plan

Written: Thu May 28 2026, 6am WAT. Recon done against `src/hooks/usePrivateMode.ts` (476 lines) + `src/umbra/*` + `src/tokens/registry.ts` + `src/screens/WalletScreen.tsx`.

Goal: extend Umbra-backed private send from SOL-only to also support USDC. SEED stays out of scope (no Umbra support per board). Ship as part of the next batched APK alongside cold-start fix + tester feedback fixes.

This is fund-path crypto. The board rule is "do NOT half-wire." This doc is the contract between recon and execution so the actual code change is sober and complete.

---

## 1. Architecture decisions (resolve BEFORE typing)

Three calls are yours, not mine.

### 1.1 State shape in usePrivateMode

**Option A — per-mint map (recommended).**
```ts
privateBalances: Record<MintAddress, bigint>   // raw units per mint
incoming: Record<MintAddress, { count: number; totalRaw: bigint }>
```
Pros: clean, future-proof, every mint is first-class. Cons: WalletScreen consumer rewires (was `privateBalanceLamports`, becomes `privateBalances[mint]`).

**Option B — "selected mint" + single balance.**
```ts
selectedMint: MintAddress
privateBalanceRaw: bigint     // raw units for selectedMint
```
Pros: smaller diff in WalletScreen. Cons: balance flicker on mint switch, awkward when you want to show both SOL + USDC private balances in the same view.

**My pick: A.** Future-proof, the consumer rewire is mechanical, and we already plan to show both balances in the sheet eventually.

### 1.2 moveAllToPublic for USDC (cleanup pattern)

Current SOL path: deposit → withdraw to signer wSOL ATA → `closeAccount` unwraps wSOL to native lamports → lamports + rent flow to main wallet. Elegant, mint-specific.

For USDC, that pattern does NOT apply. USDC isn't wrapped. Two options:

**Option A — transfer + close (recommended).** After withdraw lands USDC in signer's USDC ATA:
1. If main wallet USDC ATA doesn't exist → create it (signer pays rent ~0.002 SOL from its setup-fund leftover, NOT main wallet)
2. `transferChecked` from signer USDC ATA → main wallet USDC ATA (full amount)
3. `closeAccount` on signer's USDC ATA → reclaims rent back to signer (or main wallet, decide)

**Option B — leave USDC in signer ATA.** User would manually pull later. Bad UX, breaks the "move all to public" promise. Skip.

**My pick: A** — keep the one-tap UX guarantee.

Sub-decision: who pays the new USDC ATA on main wallet?
- Signer (from its setup-fund leftover ~0.017 SOL minus prior fees) — keeps main wallet from needing SOL. Recommended.
- Main wallet itself — fails if main wallet is empty, which is exactly the cold-start case we just fixed for sends. Bad.

### 1.3 Rollout — combined path or parallel paths?

**Option A — single new code path for SOL + USDC.** Both go through the refactored multi-mint hook. Less code, but if there's a regression it hits SOL too (the production path with real user balances).

**Option B — parallel paths.** Keep current SOL flow byte-for-byte. Add NEW USDC code that lives alongside. Branch at the call site: `selectedToken.isNative ? oldSolFlow() : newUsdcFlow()`. More code, but a regression in the new path only hits USDC (which is being introduced for the first time, so the blast radius is zero existing users).

**My pick: B (parallel paths) for 0.4.3. Unify in 0.4.4 once USDC has burned in.** This is the safest rollout for fund-path code. The "more code" cost is temporary — we delete the SOL-old branch once USDC has been live for a release or two.

---

## 2. File-by-file change list

Recon results from May 28. Line numbers from today's tree; will drift, search by anchor instead.

### 2.1 `src/tokens/registry.ts`

Add the flag.

```ts
export interface Token {
  // ...existing fields...
  /** True if this token can be sent privately via Umbra. USDC: yes, SOL: yes, SEED: no. */
  umbraPrivateSupported: boolean;
}
```

Set: SOL=true, USDC=true, SEED=false. Used by the WalletScreen "send privately" toggle to decide whether to show the option.

### 2.2 `src/hooks/usePrivateMode.ts` — the main rewire

This file is 476 lines. The SOL hardcoding is in 8+ spots. Surfaces:

**Imports/constants (line 26, 31):**
- Keep `SOL_MINT` import (still used as the default), but stop treating it as the only mint.
- `CACHED_BALANCE_KEY` (line 31) — change from single `umbra_cached_balance_lamports_v1` to per-mint key: `umbra_cached_balance_${mintBase58}_v1`. Existing users on the old key need a one-time migration shim: on first hook mount, if old key exists, copy its value into the SOL-mint per-mint key and delete the old. ~10 lines.

**State shape (per decision 1.1, assuming Option A):**
- Replace `privateBalanceLamports: bigint` with `privateBalances: Map<string, bigint>` (or `Record<string, bigint>`; Map gives cleaner mutation).
- Replace `incoming: IncomingSummary` (singular) with `incoming: Map<string, IncomingSummary>`.
- Return shape gains `privateBalanceFor(mint: string): bigint` and `incomingFor(mint: string): IncomingSummary`. Drop the SOL-flavored `privateBalanceSol` exposed number — consumers compute display via `raw / 10^decimals`.

**Action signatures change:**
- `refreshDeep(mint?: string)` — defaults to SOL for back-compat, but accepts any registry mint.
- `moveAllToPublic(mint: string, mainWalletPubkey: string)` — mint becomes first arg.
- `privateSend(args: { mint?: string; ... })` — mint optional (defaults SOL).
- `refreshIncoming(mint?: string)` and `claimIncoming(mint?: string)` similar.

**Heavy work — the new USDC moveAllToPublic (per decision 1.2):**
Rewrite around lines 238-350. The SOL branch keeps the closeAccount/unwrap pattern. The USDC branch:
1. SDK withdraw → USDC lands in `signer USDC ATA`
2. Pre-check `main wallet USDC ATA` existence
3. If absent → `createAssociatedTokenAccountInstruction(signerKp.publicKey, mainUsdcAta, mainWalletPubkey, USDC_MINT)`
4. `createTransferCheckedInstruction(signerUsdcAta, USDC_MINT, mainUsdcAta, signerKp.publicKey, amount, 6)`
5. `createCloseAccountInstruction(signerUsdcAta, signerKp.publicKey, signerKp.publicKey)` — reclaim signer's ATA rent back to signer (NOT main wallet — main wallet didn't pay it)
6. Bundle into ONE tx, signer signs + pays fee. Same blockhash/confirm dance as current.

**Decimal normalization:**
- All places that do `Number(lamports) / LAMPORTS_PER_SOL` get replaced with `Number(raw) / 10^token.decimals`. Add a helper `rawToUiAmount(raw: bigint, token: Token): number` in `tokens/registry.ts` (already exists for the reverse direction — `uiAmountToRaw`).
- Remove `privateBalanceSol` from return shape (consumer computes display).

### 2.3 `src/umbra/private-send-from-main.ts`

Already accepts `mint` param (line 61: `const mint = args.mint ?? SOL_MINT`). The hard part is line 130: `(Number(lamports) / LAMPORTS_PER_SOL).toFixed(...)`. Replace with decimal-aware formatting using `getTokenByMint(mint).decimals`.

### 2.4 `src/umbra/auto-setup.ts`

`PRIVATE_MODE_MIN_FUND_LAMPORTS` (line 31) is the SOL funding amount for the throwaway signer. It's not actually mint-specific — the signer needs ~0.02 SOL to cover its tx fees regardless of which mint it operates on. **Leave this alone.** The signer is one-per-user, mint-agnostic. Just make sure the comment is accurate after the refactor.

### 2.5 `src/umbra/withdraw.ts`, `deposit.ts`

Should already take a `mint` parameter (the deposit doc comment says "Pass mint = SOL_MINT"). Verify by reading and confirm the SDK signature. If they accept mint cleanly, no changes needed beyond callers.

### 2.6 `src/umbra/private-balance.ts`

`fetchPrivateBalanceForMint(client, mint)` — already mint-aware. No changes.

### 2.7 `src/umbra/utxo.ts` + `claim.ts`

UTXO scanning and claiming — verify these are mint-aware too. The Umbra encrypted-balance program separates accounts by mint, so the SDK calls likely handle this. Confirm by reading both.

### 2.8 `src/screens/WalletScreen.tsx`

Send flow currently has:
```ts
if (sendPrivately && selectedToken.isNative) { /* private send */ }
```
(line ~534). Change to:
```ts
if (sendPrivately && selectedToken.umbraPrivateSupported) { /* private send */ }
```

Pass mint into `privateSend`:
```ts
await handlePrivateSend(recipient.trim(), parsedAmount, selectedToken.mint);
```

Update balance display: wherever `privateBalanceSol` was shown, branch on selected mint and show `privateBalanceFor(mint) / 10^decimals` formatted with the token's symbol.

Toggle UI: the "Send privately" toggle currently hides for non-SOL (per existing logic). After the refactor, show it for SOL + USDC, hide for SEED. Hook off `selectedToken.umbraPrivateSupported`.

### 2.9 Cache migration shim

One-time migration on hook mount. Detect old key, copy to new per-mint SOL key, delete old. ~10 lines. Run once, idempotent.

---

## 3. Per-mint sim test checklist (REQUIRED before APK ship)

Run on mainnet with small real amounts. Do NOT skip.

### SOL (regression — must still work)
- [ ] Setup from scratch → SOL deposit → private balance shows correctly
- [ ] Private send SOL to registered recipient → recipient encrypted balance up, sender down
- [ ] Private send SOL to unregistered recipient with consent → falls back to public send
- [ ] moveAllToPublic SOL → exact amount lands in main wallet
- [ ] Cache value reads correctly after hook remount

### USDC (new)
- [ ] Setup if not already (signer is mint-agnostic, should reuse)
- [ ] USDC deposit → private USDC balance shows correctly (6-decimal formatting, NOT 9)
- [ ] Private send USDC to registered recipient → amounts match (1 USDC = 1_000_000 raw, not 1_000_000_000)
- [ ] Private send USDC to unregistered → fallback public USDC transfer
- [ ] moveAllToPublic USDC:
  - [ ] Main wallet already has USDC ATA → transfer + close signer ATA cleanly
  - [ ] Main wallet has NO USDC ATA → signer-funded ATA creation + transfer + close all in one tx
  - [ ] Resulting USDC in main wallet === withdrawn amount (no decimal misalignment, no missing units)
- [ ] Cache key namespaces correctly per mint

### Mixed
- [ ] Setup happens once. Switching between SOL and USDC mid-session works (no re-setup prompt)
- [ ] Header private balance displays current selected mint's amount, switches when mint changes
- [ ] SEED is gated out — "Send privately" toggle hidden when SEED is selected

---

## 4. Rollout / safe-ship sequence

1. Implement registry flag + hook state shape (no behavior change yet). Commit.
2. Implement parallel USDC path in moveAllToPublic + privateSend (decision 1.3 Option B). SOL path untouched. Commit.
3. WalletScreen rewire (display, toggle, send-flow branch). Commit.
4. Cache migration shim. Commit.
5. Run the full sim checklist above on mainnet.
6. **Beta tester subset only first.** Ship to ~5 power testers, not the full group, with explicit "test USDC private send" instruction.
7. Soak 48 hours. If clean → full group.
8. After 0.4.4 if no regressions: collapse parallel paths into one (delete the SOL-specific branch).

---

## 5. Out of scope for this refactor

- SEED on private send (no Umbra support).
- Per-mint signer (one signer handles all, no change needed).
- Migrating users who currently have SOL in encrypted balance — they keep their balance, refactor is additive.
- v5 SDK migration (still its own deferred item — `withdraw` is broken on v5 separately, multi-mint refactor stays on v4 until v5 lands).
- Multi-mint stealth or burner (separate work).

---

## 6. Estimated effort (honest)

- Reading + confirming SDK mint support across `withdraw.ts` `deposit.ts` `utxo.ts` `claim.ts`: 1 hr
- Registry flag + hook state shape: 1.5 hr
- USDC moveAllToPublic implementation: 2-3 hr (the hardest piece, transfer + ATA creation + close in one tx, fee/rent flow correct)
- USDC privateSend wiring: 1 hr
- WalletScreen consumer rewire: 1 hr
- Cache migration shim: 0.5 hr
- Sim test on mainnet (every box in section 3): 2-3 hr (this is real test time, NOT skippable)

**Total: 9-12 hours sober, focused work.** Realistic 1.5-2 day block, NOT a single-session push.

---

## 7. Open questions to log answers against

- [ ] Does Kora paymaster sponsor ATA creation rent (the `ataPayer` question to Kay)? Affects whether the USDC ATA on the main wallet can be Kora-funded instead of signer-funded.
- [ ] Confirm Umbra SDK `withdraw` mint param actually works for USDC on mainnet (it's documented as taking mint but per the v4→v5 issue, mainnet behavior may differ).
- [ ] Does the encrypted-balance program create a separate on-chain account per mint, or is it one account with mint-tagged entries? Affects the setup flow and whether incoming-payment scans need to widen.

Answer these BEFORE step 2 of the rollout sequence.
