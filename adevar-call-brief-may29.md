# Adevar Labs Qualification Call — Brief

**Date:** Fri May 29 2026
**Time:** 12:00 – 12:15 PM WAT (15 minutes)
**Meet link:** https://meet.google.com/rhu-efnc-wtx
**Dial-in (ZA):** +27 10 823 0320 — PIN: 361 953 239 7366#
**Frame:** Qualification call for shortlisted projects (196 submissions reviewed, you're in the cut)
**Project name on calendar:** seedless

---

## Who is on the call

| Person | Email | Role |
|--------|-------|------|
| **Ostanescu** | ostanescu@adevarlabs.com | Organizer + sponsor TG (@ostanescu) — decision-maker |
| **Audits team** | audits@adevarlabs.com | Awaiting acceptance — likely technical reviewer |
| You | franciscodex.sol@gmail.com | Founder, Seedless |

---

## Who Adevar Labs is

- Web3 security firm: smart contract audits, formal verification, fuzzing, pentesting
- Stack expertise: **Rust + Solidity primary**, also Move, Go, Vyper, C++
- Ecosystems: Solana + Ethereum primary, also Sui, Cosmos, Polkadot
- Credentials: **100+ audits, $700M+ secured, 1,300+ academic citations**
- Founders: academic security researchers
- Notable clients: **Li.Fi**, Archer Exchange, The Vault
- Web: adevarlabs.com

---

## What is on the table — the bounty

- **$50,000 USDC total** in security audit credits
- **5 winners × $10,000 each**
- Bounty covers **up to 50% of audit cost** if awarded
- Winner announcement: **Jun 10 2026**
- Frontier hackathon track on Superteam Earn

---

## What they want from this call (their stated reason)

- Understand audit timeline + scope
- Figure out how to best support each shortlisted project
- Real read: sizing which shortlisted projects will actually deploy and absorb an audit. Real-deployment projects beat vibes projects.

---

## Your 30-second opener (rehearse)

> "codex, founder of seedless — passkey wallet on solana. mainnet private beta live since may 1, 100+ on waitlist. we won the bags hackathon recently and placed in the umbra frontier side-track. partner stack is lazor for passkeys, kora for gasless, umbra for private transfers. we're prepping the public mainnet unlock + play store ship in the next 4-6 weeks, and that's the window where an audit lands perfectly. happy to dive into scope."

---

## 15-minute time budget

| Minutes | What |
|---------|------|
| 0–2 | Intros, opener |
| 2–10 | Their questions (scope, timeline, codebase) |
| 10–13 | Your questions |
| 13–15 | Confirm next step, wrap |

You will not get to cover everything. Prioritize ruthlessly.

---

## The 3 things you MUST get on the call

1. **Anchor the scope.** TypeScript wallet client + Ika Pinocchio rust program + integration layer (Lazor / Kora / Umbra).
2. **Anchor the timeline.** "Play store + public mainnet in 4–6 weeks. Audit window kicks off as soon as we're awarded."
3. **Confirm next step.** What do they need from you to make the final cut? Codebase access, scope doc, loom walkthrough?

---

## What to lead with (talking points)

- Mainnet private beta live since May 1
- 100+ on waitlist
- **Bags hackathon win — $25K** (public credibility, public)
- Placed in **Umbra Frontier side-track** (public, fair game)
- Partner stack: **Lazor, Kora, Umbra, Alchemy**
- Pre-public-mainnet launch = the perfect audit window
- Open-source codebase — easy to scope

### ⚠️ DO NOT mention on the call

- **Ika placement** — embargoed until Ika posts publicly Fri May 29. If they post before the call, OK to mention. If not, hold.
- Bags is a **standalone hackathon**, not a Frontier side-track. Keep separate when you say "won Bags" vs "placed in Umbra Frontier side-track."

---

## Your top 2 questions (ask if time permits)

1. **Audit cost ballpark** — "what's the typical audit cost for a passkey wallet + a small rust program? want to make sure the 50% covers something concrete on our side."
2. **Continuous security option** — "do you offer PR-based continuous review post-audit? want to know what the ongoing engagement looks like."

---

## Codebase to be audited (have these links ready in chat)

| Component | Stack | Notes |
|-----------|-------|-------|
| Wallet client | TypeScript / React Native | Main app — Lazor + Kora + Umbra integration |
| Ika Pinocchio controller | Rust / Pinocchio | Own program, devnet-deployed (`frontier-ika-bounty/`) |
| Integration surface | TS | LazorKit SDK v2 calls, Kora paymaster, Umbra private flow |

---

## Voice on the call

- Match register — they are a serious technical shop with academic founders
- Technical specifics beat vibes
- Audit framing: "audit in place," not apologizing for current state
- Proper case in any follow-up email (formal writing)

---

## Pre-call checklist (do before 11:55 AM WAT)

- [ ] Meet link tested in browser
- [ ] Closed door, water, headphones
- [ ] GitHub repo links ready to drop in Meet chat (main wallet repo + Ika Pinocchio repo)
- [ ] One-line answers rehearsed for: scope, timeline, team size, current security posture
- [ ] DexScreener / partner credibility links ready as chat-drop if needed
- [ ] Bags win + Umbra placement screenshots open in a tab (proof if asked)
- [ ] Phone on silent

---

## Post-call (within 2 hours)

Send recap email to **both** ostanescu@adevarlabs.com + audits@adevarlabs.com:

- Thank you for the time
- Scope as discussed
- Timeline as discussed
- Any artifact they asked for (repo link, scope doc, etc)
- Confirm next step + when to expect their decision

Save call outcome to memory + update priority board #41.
