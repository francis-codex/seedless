# Cal / Umbra — v5 SDK Migration Walkthrough

**When:** Fri Jun 5, 8pm WAT
**Who:** Cal (Umbra core)
**Format:** Personal hand-holding call — Cal walks Seedless through v5 migration live

## Why this call exists

- Seedless is on Umbra v4 stable mainnet, integrated as a first-class private-send flow
- v5 SDK (RC3) + codama (RC2) shipped but migration was blocked on Arcium dev tooling on Umbra's side
- Cal confirmed Thu Jun 4 that the tooling unblocked and v5 is moving today
- Code freeze is Wed Jun 10 (T-5 days). v5 migration ideally lands BEFORE freeze, but post-freeze remediation is OK

## Current Seedless Umbra integration state

- v4 private send flow shipped, mainnet, working with testers
- #38 multi-mint private send refactor committed Jun 3 (`privateBalancesByMint: Record<string, bigint>` in `usePrivateMode.ts` + `WalletScreen.tsx`)
- UmbraDebugScreen.tsx has preflight SOL balance check + friendly errors for LazorKit codes 7050003 and -32002
- Phantom recipient: gracefully degrades with consent gate (per [[project_phantom_recipient_behavior_may03]])

## What we want from this call

1. **Live walkthrough of v5 SDK changes** — what breaks, what's new, what's renamed
2. **Codama RC2 integration path** — how it slots in alongside the SDK
3. **Migration sequencing** — can we do this incrementally or is it a single-shot replace
4. **Backwards compat window** — is v4 going to be deprecated soon, or do we have time
5. **Multi-mint behavior in v5** — does the refactor we just shipped need adjustment
6. **Arcium dev tooling implications** — anything we need to know about our side

## Questions to ask Cal directly

- What's the breaking-change surface area between v4 and v5 for an integrator?
- Are there code samples / a migration guide you can share?
- Any gotchas with the LazorKit smart-wallet flow under v5?
- For testers already on v4 deposits, does v5 read them or do we need migration helpers?
- Is RC3 the final or do you expect another RC before stable?
- Best channel for follow-up debugging during migration (TG, Discord, async)?

## Listen for

- Hidden state requirements (account schemas changed?)
- New env vars or program IDs we need to swap
- Anything that would force a tester wipe (we want to avoid this)
- Cal's confidence on v5 mainnet stability
- Whether Umbra wants us to ship v5 by a specific date for co-marketing

## DO NOT

- Don't over-commit to v5-before-freeze if it's risky — post-freeze migration is acceptable
- Don't drop the multi-mint refactor without confirming v5 compat first
- Don't burn Cal's time on roadmap stuff — this is a technical walkthrough

## Context to keep handy

- Seedless launches end of June (Play Store + iOS TestFlight)
- Code freeze Wed Jun 10
- Audit window Jun 8 - Jul 5
- Umbra Q2 livestream delivered Thu Jun 4 — public commitment made on Umbra being privacy layer
- 5-partner stack: LazorKit + Umbra + Jupiter + Alchemy + Ika

## Post-call action checklist

- [ ] Save migration notes to a new memory file
- [ ] If migration plan crystallizes: create task #
- [ ] Update [[umbra_v5_migration_state_jun04]] with new state
- [ ] If post-freeze decision: flag in priority board
- [ ] Send Cal a thank-you DM after call

## Related

- [[umbra_v5_migration_state_jun04]] — current state
- [[lead_umbra_abbas]] — direct TG line for build blockers
- [[deferred_for_post_042_may21]] — v5 was the headline post-0.4.2 blocker
- [[end_of_june_launch_commitment_jun02]] — launch hard rule
