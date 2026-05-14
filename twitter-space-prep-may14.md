# Twitter Space Prep — The Degen Lounge

**Date:** Thursday, May 14, 2026
**Time:** 4:00 PM UTC · 5:00 PM WAT · 11:00 AM EST
**Venue:** [@degen_lounge](https://x.com/degen_lounge) on X
**Hub:** [dl.carbium.io](https://dl.carbium.io/)
**Announce post:** https://x.com/degen_lounge/status/2054519413383057580

| Role | Handle |
|------|--------|
| Series operator | [@carbium](https://x.com/carbium) (Carbium, Swiss Solana infra) |
| Co-sponsor | [@onchaincc](https://x.com/onchaincc) (Bitso Onchain) |
| Host | [@CryptoMaltese](https://x.com/CryptoMaltese) |
| Host | [@Cryptohalo1](https://x.com/Cryptohalo1) |
| Co-guest | [@securecheckio](https://x.com/securecheckio) |
| Guest | [@seedless_wallet](https://x.com/seedless_wallet) (Francis) |

---

## 1. Room Dynamics — Read First

The series is **operated by Carbium**, not merely sponsored. The Space lives on `dl.carbium.io`. Bitso Onchain is the paying co-sponsor.

**Posture implications:**

1. **Carbium ships its own gasless swap product.** See `docs.carbium.io/docs/gasless-token-swap`. Do not walk in claiming to have invented gasless on Solana. Position Seedless as the **consumer app layer** on top of infra. Compliment, don't compete.
2. **Bitso Onchain = LatAm fiat on/off-ramp giant.** Their thesis (on-chain ↔ bank in emerging markets) is the exact mirror of our **paj.cash NG** offramp story. Lean into that parallel if it surfaces.
3. **Hosts run broad-crypto Spaces, not Solana-maxi rooms.** Audience is general Web3. Explain in human terms. No Anchor, no Pinocchio, no Toly references without context.
4. **Co-guest is a security/audit player.** Natural foil: they cover risk and audits, we cover UX and onboarding. Complement, not competition.
5. **Past guests:** `@streamflow_fi`, `@orogoldapp`. Mid-tier serious projects. Not memes. Match that register.

---

## 2. Pitches

### Canonical (5 words)

> simple and private passkey wallet on solana

### Punchier variants for the live mic

1. **passkey wallet. no seed phrase.** — strongest opener
2. **solana wallet. face id. private.** — most ELI5
3. **the wallet your mom can use.** — risky, but lands in broad rooms

### "What is Seedless?" — full answer

> Seedless is a passkey wallet on Solana. You log in with Face ID, no seed phrase, no extension. Gasless first transaction. Private balances by default. Live in private mainnet beta. We're the consumer layer on top of Solana's infra rails.

---

## 3. Three Talking Points (in order)

### A. Why we exist — the cold-start problem

- Onboarding is the wall, not features.
- Phantom and Solflare are great if you already own crypto. Most people don't.
- "Write down these 12 words" kills 90% of new users before they swap once.
- Passkey + Face ID deletes that step. Gasless first transaction removes the "buy SOL first" trap. Private balances mean users aren't naked on-chain on day one.
- **Live today** in private mainnet beta. Just submitted to Colosseum Frontier.

### B. What we shipped

- **Passkey login** via LazorKit (secp256r1 verified on-chain)
- **Gasless transactions** via Kora paymaster
- **Private balances** via Umbra integration
- **Stealth addresses + burner wallets** — receive privately, isolate exposure
- **Token swap** via Jupiter, routed through Kora so even swaps stay gasless
- One mobile app. Android and iOS. No browser extension. No seed phrase. Anywhere.

### C. What's next — the real story

- **paj.cash NG offramp** — wallet to bank. The retention rail. Without offramp, every wallet is a one-way trip. We close the loop in Nigeria first.
- **Play Store launch** — making it downloadable like any normal app.
- **Multi-token everywhere** — SOL plus any SPL token in every flow.

**Thesis:** Most wallets compete on onboarding. We win on **retention**. The cold start gets you in. The cash-out keeps you. Without the stablecoin rail to a bank account, every wallet is a one-way trip — that's the real churn killer in emerging markets, not seed phrases.

---

## 4. The Sharp Answer

**Q: How is this different from Phantom / Solflare / Backpack?**

> Phantom and Solflare are excellent for people who already own crypto. Seedless is for the next 100 million who don't. They download Phantom, see "write down these 12 words," and close the app. We delete that step. Face ID in, gasless first transaction, private send by default. The big wallets compete on power-user features. We compete on the cold start and on the cash-out, which is why we're shipping NG offramp at launch. Different lane.

---

## 4b. Landscape — what Colosseum data says

Pulled May 14, 2026 from Colosseum Copilot (5,428 projects, 293 winners across all Solana hackathons).

**Direct competitors (cluster: Solana Privacy + Identity Management, 260 projects):**

| Project | Hackathon | Pitch | Prize |
|---|---|---|---|
| Spiral Safe | Renaissance 2024 | Passkey + biometric, no seed | ❌ |
| Astro Wallet | Radar 2024 | Non-custodial passkey + biometric | ❌ |
| Gokei Wallet | Breakout 2025 | Multi-sig + biometric + seedless recovery | ❌ |

Three direct clones of the "passkey + biometric + no seed" pitch. Zero prized. The cluster's only notable winner is **Encifher** — and it won on encrypted DeFi actions, not on wallets.

**What winners actually do (primitives, winners overindex):**

- DePIN (+6.6%), Stablecoins (+5.2%), Oracle (+2.9%), Tokenization / RWA (+2.0%)

**What winners DO NOT do (winners underindex):**

- NFT (−16.4%), Token-gating (−6.0%), generic Token (−4.4%), Smart contracts (−3.8%), Payments / Marketplace / DAO (all negative)

**Problem tags judges have rewarded:** *fragmented liquidity*, *capital inefficiency*, *rug pulls.*
**Problem tags judges have NOT rewarded:** *complex web3 onboarding*, *high barrier to entry.*

**Implication for posture in this room:**

1. The "we deleted seed phrases" hook works for retail audiences (Degen Lounge has a broad listener mix), but it's the historically-losing pitch with hackathon-shaped listeners.
2. The **stablecoin / wallet-to-bank rail (paj.cash NG)** is the strongest infra-credentialed angle — lines up with the stablecoin winner overindex and with Bitso Onchain's own thesis.
3. Don't claim blue ocean. The honest line: *"the wallet category is busy. Ours is the one that actually shipped end-to-end on mainnet, with an offramp on the way."*

---

## 5. Prepped Q&A

**Q: What chain? Why Solana?**
> Solana. Speed and fee structure mean we can do gasless without bleeding money. The dev tooling (LazorKit, Kora, Umbra, Jupiter) lets a small team punch above its weight.

**Q: Is it custodial?**
> Non-custodial. The passkey lives on the user's device, verified on-chain by the LazorKit program. We never hold keys. We never see balances.

**Q: What's the moat? Anyone can build a wallet.**
> Two-sided. Cold-start UX (passkey, gasless, private by default — no incumbent combines all three) and wallet-to-bank rails in emerging markets (paj.cash NG, then more). Wallets that solve onboarding AND cash-out keep users. The rest churn.

**Q: How do you make money?**
> Three lanes. Swap fees. A premium private-send tier. A B2B SDK so other apps can drop in passkey and gasless. Real product economics, not token-only.

**Q: Token?**
> $SEED exists. Community token, not a fundraise vehicle. Mint is in the bio. Pending Jupiter strict-list verification. Fundraise is via SAFT, separate track.

**Q: Audits?**
> Audit in place. We're in private mainnet beta — gated rollout while we accumulate real-world signal before public launch. *(Do not apologize for devnet. We're on mainnet.)*

**Q: Why the name "Seedless"?**
> Because there's no seed phrase. That's the entire point.

**Q: Traction?**
> 100+ waitlist signups in 8 days. Private mainnet beta live. Submitted to Colosseum Frontier this week. Play Store launch is the next beat.

**Q: Where can people try it?**
> seedlesslabs.xyz for the waitlist. Mainnet beta is gated. Play Store launch incoming.

**Q: Aren't there already other passkey wallets on Solana?**
> A few have been prototyped — Spiral Safe, Astro, Gokei from past Colosseum hackathons. The category is real. The gap is that none have shipped end-to-end on mainnet with an offramp. We did the integration work: LazorKit passkey, Kora gasless, Umbra privacy, Jupiter swap, all wired into one mobile app. That's the moat — fully assembled, not a demo.

---

## 6. Gracenotes (use if the moment opens)

**On Carbium / infra:**
> Carbium is doing real work on Solana infra — RPC, DEX, gasless swap rails. We sit on top of that stack as the consumer wallet. Different layer, same mission of making Solana usable.

**On Bitso Onchain / LatAm:**
> What Bitso is doing in LatAm with on-chain ↔ fiat is exactly what crypto needs in every emerging market. We're shipping the NG version through paj.cash. The wallet that gets you in AND out is the wallet that retains.

---

## 7. Do Not Say

- Em-dashes when reading aloud (force "and" or full stops)
- "AI-powered", "leverage", "ecosystem play", "synergies", "next-gen", "revolutionary"
- "Privacy-first" (Umbra has its own wallet now — overclaiming this lane is risky)
- Drop the word "private" from "**private** mainnet beta" — load-bearing
- Apologize for being on devnet (we're on mainnet)
- Location mention (Nigeria-as-origin) unless it's the offramp answer. No struggle framing.
- Trash Phantom / Solflare / Backpack by name. Frame the lane difference instead.
- Claim to have "invented gasless" — Carbium is right there.
- ChatGPT or Cursor if asked about dev stack. Claude Code only.

---

## 8. Voice (companion posts)

- `@seedless_wallet` — proper case
- `@francis_codex` — lowercase
- Builder-journey posts from `@francis_codex` use "day N of 240" framing
- No em-dashes, no horizontal-rule separators in tweets

---

## 9. Checklists

### Pre-Space (May 14 morning)

- [ ] QT the announce post from @seedless_wallet with a one-line value prop
- [x] Appreciation reply to @toniku from @francis_codex *(shipped May 13)*
- [ ] Pin the QT to @seedless_wallet for the duration of the Space
- [ ] Refresh the @seedless_wallet bio one-liner
- [ ] Water, mic test, wired headphones (not Bluetooth)
- [ ] Keep this brief open in another tab during the Space

### Post-Space (within 60 minutes of close)

- [ ] Thank-you post tagging hosts, sponsor (@carbium), co-sponsor (@onchaincc), co-guest
- [ ] One-tweet recap with the cold-start thesis as the hook
- [ ] DM Toniku — thanks and ask if the recording lands on dl.carbium.io
- [ ] Note inbound DMs / follows in the priority board

---

## 10. Sources

- Degen Lounge hub: https://dl.carbium.io/
- Past Space lineup (Streamflow, Orogold): https://x.com/degen_lounge/status/1995534343674941790
- Carbium services: https://www.carbium.io/
- Carbium gasless swap docs: https://docs.carbium.io/docs/gasless-token-swap
- Bitso Onchain inferred from past-Space sponsorship pattern
