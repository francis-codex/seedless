# Seedless — Agentic Engineering Grant Application

**Applicant:** Francis (`@francis_codex`)
**Project:** Seedless — simple and private passkey wallet on @solana
**Repos:**
- `github.com/seedless-labs/seedless` (org)
- `github.com/francis-codex/seedless` (personal mirror)

**Date:** 2026-05-02 (Africa/Lagos)

---

## Step 1 — Basics

**Project Title**
> Seedless

**One Line Description**
> simple and private passkey wallet on @solana

**TG**
> t.me/francis_codex

**Wallet**
> (Superteam Earn-linked wallet on submission)

---

## Step 2 — Details

### Project Details

seedless is a simple and private passkey-native solana wallet — no seed phrase, no extensions, no custody. you sign in with face id, get a smart wallet, your sends are private by default, and your tx are gasless via kora.

problem: every solana wallet today still hands users a 12-word seed phrase. it's the #1 reason normies bounce. on top of that, every send is fully public on-chain — your balance, your counterparties, your habits. and agentic flows on solana are stuck because agents can't safely hold seed phrases, and traditional wallets can't grant scoped, revocable, private agent permissions.

solution being shipped through the frontier hackathon (10-day sprint, may 1 → may 11):

1. **private sends by default** — umbra privacy sdk integrated, stealth addresses + zk-proof claims so the receiver address never appears on-chain. 1,122 lines of typescript + 9 commits already merged on the branch.
2. **multi-chain via ika dwallet** — 2pc-mpc on solana pre-alpha, one passkey controls eth + btc + sol from a single seedless account. anchor program + react-native polling client, integration plan locked with the ika team this week.
3. **private payments** — magicblock private payments api wired into the burner-wallet flow.
4. **mainnet-beta launch** — lazorkit v2.0.0-beta.4 with kora gasless relayer, dropping next week.

agentic angle: the wallet is the agent substrate. passkey-derived ephemeral keys = an agent signs scoped tx without ever touching a seed. ika gives the agent cross-chain reach from one identity. umbra keeps every move private. simple, private, agent-ready.

### Deadline

> 2026-05-11 (Frontier hackathon submission deadline)

### Proof of Work

**This repo (158 commits, AI-paired throughout):**
- `github.com/seedless-labs/seedless`
- 22MB / 1,424-turn Claude Code session transcript attached (`claude-session.jsonl`)

**Recent shipped work (last 20 commits):**
- `b098c8b` Pre-flight register burner and add scan diagnostics + retries
- `0a445f1` Scan claimable UTXOs across multiple trees with indexer warmup
- `d8091dd` Fix Umbra scan partition and probe recipient X25519 lookup
- `9e7a2f1` Route devnet RPC and WS through public endpoints with Alchemy fallback
- `8940a2c` Add Umbra relayer and claim flow for receiver-claimable UTXOs
- `da594ef` Wire Umbra burner bridge with consent fallback for Private Send
- `2be6ac6` Add passkey-derived master seed and X25519 registration path
- `1f2f6c2` Ship Bags hackathon submission: cap devnet rewards, monochrome UI, deck export
- `529249d` Wire Umbra ZK prover, debug screen, and integration plan
- `bff5c76` Wire LazorKit v2 session keys, deferred exec, and device authorities

**Public artifacts:**
- Bags Hackathon submission (Apr 25): https://x.com/seedless_wallet/status/2048128023698813228 — 4 integrations shipped (fee claims, gasless swap, random rewards, token launch)
- Live thread + community demo series: https://x.com/seedless_wallet
- Mert (Helius) public co-sign on seedless launch threads
- Umbra core team (Cal) actively diagnosing X25519 issues with us — root cause traced collaboratively over TG

**Live partnerships in motion:**
- LazorKit (Kay) — passkey + smart wallet + Kora relayer integration; weekend mainnet smoke test owed
- Ika (Fesal) — integration plan locked, anchor program scaffolding starting this weekend
- Alchemy (Kenneth) — successful infra call May 1, RPC fit confirmed for getProgramAccounts-heavy workload
- MagicBlock — private payments api integration scoped for week 2

### Personal X

> x.com/francis_codex

### Personal GitHub

> github.com/francis-codex

---

## Step 3 — Solana.new evaluation prompt

Prompt run: `help me apply for the agentic engineering grant by Superteam`

Skill triggered: `apply-grant` (installed via solana.new setup)

Artifacts produced (uploaded to Drive alongside this doc):
- `claude-session.jsonl` — 22MB / 1,424 turns of AI-paired Solana development on the seedless project
- `grant-application.md` — this document

The session transcript is the proof-of-work: it covers the May 1 sprint kickoff including Umbra X25519 diagnosis with Cal, Ika integration architecture lock with Fesal, Alchemy infra call recap with Kenneth, the 10-day Frontier sprint plan, and this grant application itself — all paired with Claude Code in real time.

---

## Submission link

https://superteam.fun/earn/grants/agentic-engineering
