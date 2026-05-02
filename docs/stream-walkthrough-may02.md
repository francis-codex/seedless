# Seedless × Umbra — Stream Walkthrough

**Stream:** Ownership Report #3 · Saturday May 2 2026 · 3PM UTC / 4PM WAT
**Hosts:** @8bitpenis (CEO, @ownershipfm) · @Abbasshaikh (COO, @umbraprivacy)
**Lineup:** @gesimxyz, @seedless_wallet, @agentis_hq, @solpayserver, @hush_wallet, Unseen Finance, Obscura
**Mode:** audio-only (camera off — face reveal saved for mainnet, see `feedback_no_doxx.md`)
**Deck:** `assets/deck-v3-export/seedless-deck-v3.pdf`
**Google Slides (live, comment-enabled):** https://docs.google.com/presentation/d/1CSdDchdbGw4h0KTKXSG0yV0b3305N_GU45gD515QSH8/edit?usp=sharing
**Slot:** 10 minutes total per project — target ~6-7 min presentation + 3-4 min Q&A

This walkthrough is mapped slide-by-slide to the pitch deck. Use it for the live stream and as the canonical script for any 60-90 second deck-walkthrough video later.

---

## Hard rules during the stream

- Don't over-talk. Answer the question, stop, hand it back.
- Don't apologize for devnet. Say "live on devnet, mainnet next" and move on (`feedback_audit_framing.md`).
- Don't dump the X25519 saga unprompted — honest answer if asked, not a feature.
- Do mention shipping the demo + submission for May 11.
- Do thank @ownershipfm and @abbasshaikh on the way out.
- Camera off is the call. If asked: "going camera-off today, saving the face reveal for mainnet — happy to take any questions."

---

## Opening (10 sec — when called on)

> "hey, francis here, building seedless — the simple and private passkey wallet on solana. been integrating umbra under the hood. happy to be here."

Keep it short. Don't over-introduce.

---

## Beat 1 → Slide 1 (Cover) + Slide 2 (Lead Fact) — 20 sec

**Slide 1 — Cover:** Seedless · Simple and Private Passkey Wallet
**Slide 2 — Live on Solana Mainnet Beta · Log In With Face ID**

> "what is seedless: the simple and private passkey wallet on solana. live on mainnet beta as of may first. you log in with face id. no seed phrase. no gas to start. privacy by default."

If pressed for less detail, just the punch: *"we're the passkey-first wallet on solana. no seed phrase, no gas to start."*

---

## Beat 2 → Slide 3 (Friction) + Slide 4 (Loss) — 30 sec

**Slide 3 — 60.8% custodial · only 43% recognize a seed phrase** (CHI 2025, ACM)
**Slide 4 — $9.3B fraud · 69% from compromised keys, not smart contracts** (FBI IC3 + DeepStrike)

> "couple of stats sit behind everything we build:
> sixty percent of crypto users default to custodial wallets, and a peer-reviewed study last year found only forty-three percent could even recognize a seed phrase.
> meanwhile, sixty-nine percent of wallet losses in 2025 came from compromised keys — not smart contract bugs.
> the seed phrase is the single biggest UX and security failure in crypto. seedless removes it."

---

## Beat 3 → Slide 5 (How It Works) — 15 sec

**Slide 5 — Log In With Face ID · Sign With Your Phone · Gas Paid For You**

> "the experience: open the app, face id, you're in. you sign with the secure enclave on your phone. paymaster covers gas, so a new user doesn't need to buy SOL before doing anything."

---

## Beat 4 → Slide 6 (Comparison) — 15 sec

**Slide 6 — No Other Solana Wallet Ships All Three** (Phantom, Backpack, Solflare, TipLink vs Seedless)

> "phantom, backpack, solflare, tiplink — none of them ship passkey login, sponsored gas, and native encrypted privacy together. seedless is the only solana wallet doing all three."

If asked about Solflare specifically (they do have privacy now): *"solflare's private send routes through the houdini swap aggregator — it's third-party send obfuscation. ours is native, on-chain encrypted accounts via umbra. different category."*

---

## Beat 5 → Slide 7 (Umbra Integration) — 90 sec — **THE MEAT**

**Slide 7 — Private Payments, Inside the Wallet Anyone Can Use** + Encrypted Ops mockup (Deposit / Withdraw / Create Receiver-Claimable UTXO)

> "we're a consumer wallet. our users aren't going to deposit into umbra and figure out stealth addresses. so the question we asked was: how do we make encrypted balances feel as native as a regular send?
>
> what we shipped:
> — pre-flight burner registration, so a user's first private op doesn't require a separate setup step
> — multi-tree merkle scan with indexer warmup retries, so claimable utxos surface reliably
> — a relayer-backed claim flow for receiver-claimable utxos
> — full devnet flow live: deposit, withdraw, create receiver-claimable utxo
>
> you're a passkey user. you tap send. behind the scenes the wallet wraps SOL, creates the encrypted utxo via umbra's v4 SDK, and the recipient claims it later — same UX as a regular transfer."

**If Abbas asks about challenges:**
> "the X25519 master-seed derivation between SDK versions is a real surface. cal traced it on the umbra side, we have two fix paths in motion. honest learning — passkey wallets and SDK signature flows need a clean override surface, and that's a conversation we're having with the team."

**If asked "why umbra and not roll your own?":**
> "we've been there — we shipped a stealth-address module in-house. when we saw umbra's MPC-backed encrypted accounts and shielded balances, the right move was integrate, not duplicate. their team is solving the hard cryptography part; we focus on making it feel like one tap."

---

## Beat 6 → Slide 8 (Traction) — 20 sec

**Slide 8 — Shipped Before Raising:** Mainnet · 343 onchain wallets pre-mainnet · 4 Modules (Wallet, Swap, Stealth, Burner) + Validated By Mert (Helius), Kru (Umbra), Solana Foundation

> "we've shipped before raising. live on mainnet beta. three hundred forty-three onchain wallets bought in pre-mainnet. four production modules. validated by mert at helius, kru at umbra, and the solana foundation listed seedless on their privacy wallet watchlist."

Drop the cosign part if Abbas/Kru is on the call — don't quote them to themselves. Just say "validated by helius, umbra, solana foundation."

---

## Beat 7 → Slide 9 (Team) — 15 sec

**Slide 9 — Why We Ship This:** Codex (Founder) + LazorKit founders (Chau Khac, Kay) as infrastructure rails

> "i'm francis codex, founder. solana engineer, ex superteam, ex chainlink. shipped four production betas in fourteen weeks. seedless runs on lazorkit's smart-wallet rails — kay (lazorkit CTO) led our program audit."

If asked "how big is the team?":
> "i'm leading product and engineering. infrastructure backed by the lazorkit founders. hiring growth and design next."

---

## Beat 8 → Slide 10 (Ask) — 10 sec — **CLOSE**

**Slide 10 — Join the Beta · seedlesslabs.xyz**

> "if you want to try it: seedlesslabs dot xyz. beta is opening up. we're at @seedless_wallet, i'm at @francis_codex. thanks @ownershipfm and @abbasshaikh for having us. that's it."

---

## Pacing — 10 min slot (6-7 min talk + 3-4 min Q&A)

If you read every beat tight: ~3 min 35 sec. That leaves ~3 min of breathing room you should USE — slow down, take micro-pauses between beats, and add live texture (see expansions below). Don't rush. Empty seconds in a 10-min slot make you look prepared, not lost.

### Where to add texture (turning 3:35 into ~6:30)

**On Beat 3 (How it works) — add the live demo line:**
After the three-line core, walk the listener through one concrete moment:
> "to make it tangible: someone signs up, sees a face id prompt, taps once. wallet's created. they can immediately receive a payment, swap, or make a private send — all without ever buying SOL first. that's the bar we're shipping at."

**On Beat 5 (Umbra integration) — add the design tradeoff:**
After listing what shipped, add why it was hard:
> "the design tradeoff that took us the longest: umbra's encrypted accounts derive a master seed from a signature. lazorkit signs with secp256r1 passkeys, not ed25519. we built a bridge — a deterministic master seed bound to a per-device burner signer, persisted in the secure enclave. that bridge is the reason a passkey user can transact on umbra at all without knowing umbra exists. honest call: we'd love to see the SDK expose a cleaner override surface for non-ed25519 wallets, and that's a conversation we're already having with cal."

**On Beat 6 (Traction) — add the velocity story:**
> "we started in january. four betas shipped in fourteen weeks. mainnet went live this past thursday. what we're optimizing for is shipping velocity with a real audit, not vanity metrics — three hundred forty-three onchain wallets aren't a stat we'd lead with normally, but those are real people who bought in before we ever showed them mainnet. that's a demand signal, not a vanity number."

**On Beat 7 (Team) — add the conviction line:**
> "the reason this works: i'm the engineer who picked the rails, and lazorkit's founders are the team who built them. kay led our audit personally. that's a tighter loop than most consumer wallets get to operate with."

### Cut order if you're running long

Trim from bottom up:
1. First to cut: Beat 6 expansion (velocity story) — keep the headline numbers
2. Then: Beat 4 (comparison) — the deck slide does the work, you don't need to narrate
3. Then: Beat 2 (loss stat) — lead with the friction stat (43% recognize), drop the FBI number
4. Never cut: Beats 1, 3, 5, 8 — those are the load-bearing beats

Minimum viable (~90 sec): Beats 1 → 3 → 5 (core, no expansion) → 8.

---

## Contingency answers — quick reference

| Question | Beat to deliver |
|---|---|
| "tell us about seedless" | Beat 1 + Beat 3 |
| "why this matters / what problem" | Beat 2 |
| "how does it work for the user" | Beat 3 |
| "how is it different from phantom/backpack" | Beat 4 |
| "what did you build with umbra" | Beat 5 (full) |
| "what was hard" | Beat 5 (challenges box) |
| "why umbra" | Beat 5 (why-not-roll-your-own box) |
| "what traction" | Beat 6 |
| "who are you / team" | Beat 7 |
| "how do people try it" | Beat 8 |

---

## Mic check before going live (5 min before)

- Headphones with built-in mic, NOT laptop speakers
- Pfp loaded in X profile (purple SMB)
- Pitch deck PDF open in fullscreen as a personal cheat sheet (slide numbers map 1:1 to beats above)
- Glass of water in reach
- This file pinned in a second window — scroll as you speak

---

## After the stream

- Quote tweet @ownershipfm thanking the hosts and tagging the other featured teams
- Post a short recap thread (3-4 tweets) hitting the same beats — converts stream traffic to beta signups at seedlesslabs.xyz
- DM Abbas a thank-you and re-confirm the umbra side-track submission timeline (May 11)
- Save any standout questions or feedback to memory for the colosseum deck v2 polish session
