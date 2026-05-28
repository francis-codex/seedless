# Tester feedback batch — May 28 2026

Source: TG beta group dump from Francis, May 28. 5 testers, 24 distinct items. Structured below for batched execution before next APK ship.

Companion docs: `multi-mint-private-send-plan.md` (refactor plan).

---

## ✅ Already covered by tonight's cold-start fix (just needs to ship)

| # | item | source | resolution |
|---|---|---|---|
| 1 | "need SOL for gas to send USDC / swap" | tester C | Fixed in `WalletScreen.tsx:519` (conditional gate) — zero-SOL wallet now sends USDC if recipient has ATA. Honest helper copy on `WalletScreen.tsx:1227`. Lands in next APK. |

## 🚫 Not a bug — clarify in copy if possible

| # | item | source | response |
|---|---|---|---|
| 2 | "sent devnet SOL, didn't reflect" | tester B | User sent on devnet to a mainnet wallet. Defensive fix: add a small "Mainnet wallet" badge on the receive screen so this doesn't happen again. Low priority. |

## 🔴 Bugs to fix (ship-blocking small)

| # | item | source | file/area | effort |
|---|---|---|---|---|
| 3 | Android system nav bar overlapping bottom menu | tester D (screenshot pending) | Bottom nav / root layout — likely need `useSafeAreaInsets()` bottom inset honoured | ~30 min |
| 4 | Settings icon has no function | tester D | Settings entry point in nav. Either wire it to a real settings screen OR hide it until built. | ~10 min to hide; days to wire properly |

## 🟡 Copy/UX small wins (batchable in next APK)

| # | item | source | effort |
|---|---|---|---|
| 5 | Dark mode is permanent — testers want a toggle | tester A, D | ~3-4 hr — settings screen + theme provider rewire |
| 6 | "Mainnet wallet" small indicator on receive screen | derived from #2 | ~10 min |
| 7 | Link to seedless X + website from settings | tester D | ~15 min, static `Linking.openURL` |
| 8 | Lock wallet option (biometric on app foreground / inactivity) | tester D | ~2 hr — new app-state listener + biometric prompt on resume |
| 9 | Notifications when receiving / sending | tester E | ~3-4 hr — local push on confirmed tx (skip server push for now) |
| 10 | Address book | tester D | ~4-5 hr — SecureStore-backed list + add/edit UI + recipient field autocomplete |

## 🟠 Missing features (medium-large, real work)

| # | item | source | effort | notes |
|---|---|---|---|---|
| 11 | Transaction history (send, receive, swap) | tester D, E | ~6-8 hr | `getSignaturesForAddress` + parse tx instructions + screen. Bundle with #9 (notifications) since both consume the same tx stream. |
| 12 | Multi-wallet — add more normal (non-stealth, non-burner) wallets | tester D | ~6-10 hr | Already investigated — see `[[project_multi_wallet_lazor_investigation_may18]]`. LazorKit SDK supports it, was blocked on portal UX verification last sprint. Time to revisit. |
| 13 | Show all coins the wallet holds (auto-detect every SPL) | tester D | ~4-6 hr + curation layer | Replace fixed registry display with token-account scan (`getParsedTokenAccountsByOwner`). **Caveat:** undermines the "for people who don't live in crypto" positioning if every airdropped scam token shows up. Needs a curation layer (whitelist + verified-mint check + dust filter) before shipping. |
| 14 | Swap ANY coin (not just SOL/USDC/SEED) | tester D | mostly free after #13 | Jupiter routes any-to-any natively. Once #13 detects what the user holds, swap is just a list-of-mints UI change. |

## ❓ Architecture decision — the LazorKit redirect (your question to me)

| # | item | source |
|---|---|---|
| 15 | "Why does swap redirect me out to approve?" | tester E + Francis question |

**It's not LazorKit-by-design.** LazorKit v2 has two paths:
- **Session signer (ed25519 ephemeral, local sign)** — no redirect, instant. Tonight's send fast-path uses this at `WalletScreen.tsx:611` (`signAndSendWithSession`).
- **Passkey-prompted** — biometric ceremony in a web sheet → the "redirect-feel" testers notice. Falls back here when session is expired OR tx exceeds session scope.

**The real question:** why is swap going down the passkey path instead of the session path?

Three possibilities, in likelihood order:
- (a) **`SwapScreen.tsx` doesn't use `signAndSendWithSession` at all** — just always passkey-prompts. Probability: high. The send path got the session fast-path retrofitted in 0.4.2; swap may have been missed.
- (b) Session is used but Jupiter swap instructions exceed session scope (program/account allowlist). Probability: medium. Fixable by extending session scope, may need Kay confirm.
- (c) Real LazorKit limit (e.g., swap has a leg session can't sign). Probability: low. Real Kay convo.

**Action before asking Kay:** read `SwapScreen.tsx`, grep for `signAndSendWithSession`. If absent → it's (a) — pure local fix, ~2-3 hr work, no Kay needed.

### Diagnosis result (grepped May 28)

Theory (a) **confirmed**. `SwapScreen.tsx` has zero session-signer refs. Both branches at lines 402-416 (`authorizeAndExecute`, `signAndSendTransaction`) are passkey-prompted. The session fast-path that send got in 0.4.2 was never wired up for swap.

### Implementation shape

Port the pattern from `WalletScreen.tsx:610-619`:
1. Import `getActiveSession`, `signAndSendWithSession`, `walletId` from `../utils/session` and the LazorKit session call site.
2. In the swap submit block, fetch fresh session before the if/else at line 402.
3. Wrap the existing if/else inside a new outer branch:
   ```ts
   if (session) {
     try {
       sig = await signAndSendWithSession({ sessionKeypair, sessionPda, instructions, transactionOptions: txOpts });
     } catch (err) {
       if (isSessionScopeError(err)) {
         // fall through to passkey path silently
       } else { throw err; }
     }
   }
   if (!sig) {
     if (shouldUseDeferredExec(instructions)) { await authorizeAndExecute(...) }
     else { await signAndSendTransaction(...) }
   }
   ```
4. Define `isSessionScopeError(err)` — check for LazorKit's program/account allowlist rejection error code(s).

### Real risk

LazorKit session has a program/account allowlist. Known to cover SystemProgram + SPL Token + ATA. Jupiter swap CPIs into Raydium/Orca/Meteora via Jupiter's main program. If any aren't in the default allowlist, the session-signed tx rejects on chain — fall-through to passkey path must handle this silently. If Jupiter's main program ISN'T in the allowlist by default, we need Kay to widen it (1-message ask).

**Effort: 1-2 hr** for the port. +30 min if Kay needs to widen the allowlist.

**Why this jumps to the top of the priority list:** testers are not wrong — this is the worst UX in the app right now. If swap doesn't redirect, half the "I want history / notifications" complaints quiet down because the experience already feels like a real app instead of a web browser pretending to be one.

---

## Batch order for next APK — EVERYTHING ships, nothing deferred (per Francis May 28)

Sequence is by dependency + energy curve, not "must-have vs stretch." All items below are in scope for the same APK.

1. **#1 cold-start fix** (already in, uncommitted) — commit first, clears the deck
2. **#15 swap redirect investigation + fix** — biggest single UX win, likely a 2-3 hr local fix
3. **#3 Android nav overlap** + **#4 settings icon wire-up** — quick bugs
4. **#6 mainnet badge** + **#7 X/website links from settings** — copy wins, 25 min combined
5. **#5 light/dark mode toggle** + theme provider rewire (lands a real settings screen we can hang #4/#7/#8 onto)
6. **Multi-mint private send refactor** (per `multi-mint-private-send-plan.md`) — heavy sober crypto work, 9-12 hr
7. **#8 lock wallet** + **#10 address book** — quality features, 6-7 hr combined
8. **#11 transaction history** + **#9 notifications** — bundle (same tx stream powers both), 9-12 hr
9. **#13 all-SPL detection** + **#14 any-coin swap** + curation layer
10. **#12 multi-wallet** — sequence last because it interacts with #11, #13 and #5 (every new wallet has its own theme/history/holdings)

Total realistic effort: ~50-70 hr of focused work. Treat this as a multi-day block, not a single session. The order matters — earlier items (settings screen, theme provider, session-signer wiring) become the scaffolding the later items hang off, so no rework if we go in this order.

## Out of scope for THIS APK batch (separate lanes, in flight)

- DUNS / Play Store launch — separate lane, DUNS submitted May 28 via Apple flow, waiting on issuance
- Tochi / paj.cash offramp — separate lane, waiting on the scope call
- Cross-chain via Ika (`frontier-ika-bounty/`) — its own repo, separate cadence
- Major rebrand or positioning changes — positioning is locked per [[positioning_audience_locked_may26]]
