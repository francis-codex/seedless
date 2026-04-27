  IKA / ENCRYPT CALL BRIEF — apr 28, 5:30pm

  the headline (verified, this changes everything)

  both Ika and Encrypt are building on SOLANA. announced March 31 2026 (less than a month ago).

  - Ika = MPC-based "bridgeless cross-chain" via dWallet objects. Solana is their anchor chain. TypeScript SDK live. Open
  source. Backed by DCG, FalconX, Big Brain, Node Capital, Sui Foundation.
  - Encrypt = FHE on SVM. Pre-alpha, devnet Q2 2026. Means being a launch partner = significant leverage.
  - Both from dWallet Labs team.

  ---
  the side-track (verified)cl

  ┌─────────────────────┬─────────────────────────────────────────────────────────┐
  │        field        │                          value                          │
  ├─────────────────────┼─────────────────────────────────────────────────────────┤
  │ prize pool          │ $15,000 USDC                                            │
  ├─────────────────────┼─────────────────────────────────────────────────────────┤
  │ breakdown           │ 1st: $10K · 2nd: $3K · 3rd: $1K · 4th: $500 · 5th: $500 │
  ├─────────────────────┼─────────────────────────────────────────────────────────┤
  │ current submissions │ only 4 (low competition!)                               │
  ├─────────────────────┼─────────────────────────────────────────────────────────┤
  │ winner announcement │ June 1, 2026                                            │
  ├─────────────────────┼─────────────────────────────────────────────────────────┤
  │ submission deadline │ not stated on listing — MUST ASK FESAL ON CALL          │
  ├─────────────────────┼─────────────────────────────────────────────────────────┤
  │ contact             │ @iamknownasfesal on TG (which you already have)         │
  ├─────────────────────┼─────────────────────────────────────────────────────────┤
  │ scope               │ global, open                                            │
  └─────────────────────┴─────────────────────────────────────────────────────────┘

  critical: the listing is light on requirements (submission specs + judging criteria not posted publicly). that's actually
  opportunity — they're flexible, and you can shape what counts via the conversation.

  ---
  strategic overlap — lead with this

  the seedless × ika × encrypt thesis (one paragraph, memorize)

  ▎ "seedless is the mobile passkey wallet that makes Ika's bridgeless cross-chain usable by normal people, and Encrypt's
  ▎ institutional FHE accessible to consumer apps. We already shipped Umbra privacy primitives (stealth + ZK send) — Ika gives
  ▎ us native Bitcoin and Ethereum without leaving the passkey model, and Encrypt gives our users private balances + sealed-bid auctions on Solana. We are the consumer surface for the entire dWallet Labs stack."

  why this lands

  1. Ika needs consumer endpoints — they have institutional VC backing but no flagship mobile wallet integration. seedless =
  first
  2. Encrypt is pre-alpha — being among first integrators = positioning leverage
  3. Both anchor on Solana — no Sui detour, no chain mismatch, Lazorkit smart wallet model already lives there
  4. The TypeScript SDK exists for Ika — React Native compatible, you can wire it into seedless without a Rust port
  5. Privacy thesis double-down — you're already integrating Umbra (different layer: stealth/ZK), Encrypt adds FHE (computation on encrypted data) — these compose cleanly

  ---
  sharp questions to ask (8, prioritized)

  1. "Ika is now Solana-anchored as of March 31 — does that mean a seedless mobile user could sign a native Bitcoin tx via
  dWallet from the Solana program, with passkey as the user share?" (shows you read the Mar 31 launch + maps it to your stack)
  2. "The TypeScript SDK in dwallet-labs/ika — is it ready for React Native, or is there mobile-specific work needed before we
  can drop it in?" (technical, gauges integration cost)
  3. "For the side-track, do submissions need to integrate both Ika AND Encrypt, or does one count? And does our existing
  Umbra-on-Solana stealth + ZK send qualify as 'encrypted capital markets' on its own?" (clarifies bar — you do not want to
  over-commit)
  4. "What's the submission deadline? Listing doesn't show it, want to plan around May 11 Frontier deadline."
  5. "Encrypt is pre-alpha — what's the path to early access? We'd want to be among the first consumer apps shipping FHE
  primitives, not waiting for general availability." (positions you as design partner, not just participant)
  6. "Beyond the side-track — are dWallet Labs / DCG / FalconX writing checks into apps that build on Ika+Encrypt, or is it
  pure ecosystem incentives?" (opens fundraising lane subtly)
  7. "Who's on your consumer-app radar already? Any wallets you've talked to that we should know about?" (competitive intel)
  8. "What's the single most useful thing seedless could ship in the next 13 days that would matter to you?" (THE close — gives them ownership of next steps)

  ---
  anticipated questions + ideal one-line answers

  ┌───────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────┐
  │    their question     │                                          your answer                                           │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "walk us through      │ passkey-first solana wallet, Face ID signs every tx, zero seed phrase, audited via lazorkit    │
  │ seedless in 60        │ (foundation-backed), 343 $SEED holders, 4 bags integrations live, mainnet beta launching this  │
  │ seconds"              │ week, currently integrating Umbra privacy SDK                                                  │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "why privacy / why    │ mobile wallets are the consumer endpoint — without unlinkable sends, passkey just makes        │
  │ Umbra?"               │ surveillance easier. Umbra = stealth + ZK send. Encrypt would be the FHE computation layer on  │
  │                       │ top                                                                                            │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "how would you        │ bridge our LazorKit passkey signer into a dWallet object so a seedless user holds + signs      │
  │ actually use Ika?"    │ native BTC without leaving Face ID. cross-chain without wrapped assets                         │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "what's the technical │ IUmbraSigner is the same pattern — implement IDWalletSigner that bridges passkey → 2PC-MPC     │
  │  bar for shipping     │ user share. doable in days if your TS SDK has a JS client (we saw it's npm-published)          │
  │ that?"                │                                                                                                │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "are you raising?"    │ $SEED community-funded via bags.fm (113+ SOL lifetime fees), no VC yet, open to strategic      │
  │                       │ angels who unlock infra or distribution. no hard pitch tonight                                 │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "where would seedless │ we'd remain Solana-only. with Ika we become the first passkey wallet that signs natively on    │
  │  fail without us?"    │ every chain without bridges. that's a different product                                        │
  ├───────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ "can you ship by may  │ scoped MVP yes — passkey-signed dWallet object signing one cross-chain demo (BTC or ETH). full │
  │ 11?"                  │  Encrypt integration probably q2-q3. would want one of your engineers in the TG group for      │
  │                       │ unblocks                                                                                       │
  └───────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  red flags / things to be careful about

  1. scope creep — adding Ika integration ON TOP of the Umbra sprint in 13 days could blow May 11. Don't commit to shipping
  both for the side-track without scoping a tight MVP
  2. side-track ambiguity — listing doesn't say if Umbra-only build qualifies. get explicit confirmation on call — if "must
  integrate Ika or Encrypt SDK," your sprint just changed
  3. Encrypt pre-alpha risk — FHE is research-grade. don't promise FHE shipping in 13 days
  4. don't burn LazorKit publicly — Kay just confirmed mainnet beta. mention LazorKit positively, frame Ika as "complementary
  cross-chain layer," not replacement

  ---
  conversational tone notes

  - don't pitch fundraising live — get the handle, save for follow-up DM if natural
  - say "we" not "i" — sounds like a team, even though solo-founder right now
  - own the holder/user honesty — same line that worked on the ownership.fm space ("343 holders ≠ 343 users, sprint is this
  week")
  - mention Umbra integration is in flight — establishes you ship privacy work, not just talk it
  - mention Cal at Umbra, Kay at LazorKit by name — shows partner relationships, not solo cowboy
  - don't mention Altude — would read as competitive shopping, kills trust