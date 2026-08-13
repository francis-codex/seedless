# BUILDER JOURNEY POST — drafted 13 Aug 2026, NOT YET FIRED

**Account: @francis_codex, lowercase founder voice. @seedless_wallet quotes to amplify.**
**Format: LONG-FORM post, not a thread.** Last builder journey post was 4 Apr 2026 (`x.com/francis_codex/status/2040444365428989980`), so this covers four months since then, eight months of building total. First commit 25 Dec 2025.

**Card:** `assets/brand/builder-journey-aug13-dark.png` (dark, current pick) · light version `builder-journey-aug13.png` · sources beside them.
✅ **DONE 13 Aug 23:45: card deck rebuilt with REAL win tweet screenshots** — `win-bags-aug13.jpg`, `win-umbra-aug13.jpg`, `win-100xdevs-aug13.jpg`, `win-ika-aug13.jpg` captured from X and embedded.

---

## THE POST

```
eight months of seedless

the first commit was on christmas day, the 25th of december 2025. an expo
project with lazorkit pinned in it and nothing else.

i last wrote one of these on the 4th of april. i was pre-mainnet then,
still guessing at whether any of it would hold together. four months
later there is a launch date, a company, a shipped beta and a test suite.
here is what i built in between, and what broke.


the first of may, mainnet went live. lazorkit v2, gasless sponsorship,
real money moving through a real wallet. months of saying "coming soon"
ended that day.

what followed was the least glamorous stretch of work i have ever done
and probably the most useful.

i migrated the whole private transfer stack from umbra v4 to v5. nine
files, every import path changed, the deposit and burn and query surfaces
all renamed. the sdk's root barrel pulls in a proving backend that cannot
resolve in react native, so i had to alias it to a stub through the metro
resolver, and i made the stub throw rather than return empty, because a
silent stub in a proving path does not crash, it produces an invalid
proof. that distinction matters more than the fix.

then i found out main had not been able to build an android bundle for
weeks and nobody knew. a dependency had been bumped to a new major
without migrating the code calling it, so every function it reached for
no longer existed. typecheck passed the entire time. it only surfaced
when i tried to boot the simulator and it refused. the lesson cost me
weeks and i will not lose it again: a migration is not done when it
compiles, it is done when it bundles.

around that i shipped multi wallet support, transaction history with per
wallet caching and a cold start retry, an address book, a wallet lock,
burner wallets with spl support, stealth addresses with a sweep all, and
token detection that filters against a verified list so a fake usdc
airdrop never appears next to your real one.

i put sol rent guards on send and swap, because an account creation costs
about 0.002 sol and a wallet that does not tell you that is lying to you
by omission.

i built session keys on slot based expiry with a local estimate and a
safety buffer, so common actions stop asking for your face every time,
and the expiry is still confirmed against the chain when it is close.

a tester found that cancelling the biometric prompt and force quitting
the app relaunched straight into an unlocked wallet. that one kept me up.
the fix was to stop consuming the lock arm on the check and only clear it
after a real unlock. there is a test pinning it now.


on the 18th of june seedless labs limited was incorporated. on the 25th
the d-u-n-s number came through. one number, issued by a credit bureau,
that most builders never think about, and the only reason google play and
apple will talk to us as a company at all.

i named that exact blocker in the june update and closed it in the july
one. june i told you the gate, july it was cleared. i think that matters
more than any weekend result, because anyone can win a hackathon. fewer
people go and do the paperwork.

on the 22nd of june v0.4.4-beta shipped to testers and we ran #goseedless.
twenty five people got paid on chain for breaking things. one of them,
who i had never spoken to, wrote an eight tweet review i never asked for.
stealth wallet "awesome". sweep all "worked flawlessly". he also found two
real bugs, which was the entire point. waitlist is past a hundred and
fifty, nothing spent on acquisition.

the results came too. bags named us winner number five in may. umbra put
us second in their frontier track and wrote their own description of what
we are building. ika's cofounder dm'd to say we had won theirs. 100xdevs
frontier, second place in july. i am not going to pretend that is not
good.


now the half nobody posts.

between the 24th and the 29th of july i lost four bounties in one week.
multihopper. a production mvp listing. the txodds nigeria track. then
proofxi, two hundred and forty seven submissions deep, which was the last
line on my income board. four for four.

solana mobile declined a builder grant on the 1st of july.

a cofounder offer i made in may got pulled, because the pattern kept
being money first and the work second.

and in may someone said publicly that passkeys should just be a feature
inside phantom, not a whole new wallet, and that i was chasing an audience
phantom already owns. it stung because it is the sharpest version of the
question. i have spent every month since answering it with the product
instead of a reply.

on the money: bags was twenty five thousand in may. i am at about ten now.
that is not a complaint, it is arithmetic. a pile with no income is not a
war chest, it is a countdown, and i would rather say that out loud than
perform a runway i do not have.

i also sat seven final year exams between the 27th of july and the 8th of
august while all of the above was running.


this week is the one i am proudest of and none of it is a feature.

i took the test suite from zero to a hundred and ninety tests. session key
lifecycle and expiry. the wallet lock, including that force quit bypass.
the recipient pre flight on private sends, including the case where an
account reports itself registered while its encryption key is still
thirty two zero bytes. amount conversion, where dust that rounds to zero
has to be refused rather than silently sent. transfer assembly, where the
recipient token account is only created when it is genuinely missing and
the rent lands on the right payer. address book lookups that will not
match a lookalike address on case or a prefix. and the token curation
layer, which fails closed, so if the verified list cannot be reached
nothing is shown at all rather than showing you everything.

i ran a dependency audit that took findings from fifty nine to thirty one
and caught a breaking api change in a signing library that would have
shipped silently invalid signatures. silently is the word that should
scare you.

and i found a privacy leak inside the privacy feature. every private send
was writing the recipient's address to the device log in release builds.
the exact linkage that feature exists to break, written to a file anyone
holding the phone could read. fixed, gated, and pinned with a regression
test.

the security policy, the threat model and the known gaps are public at
seedlesslabs.xyz/security. we are not audited. one is being lined up.
publishing the gaps before someone finds them is the only version of this
i can live with.


september is the launch date. the first one i have ever committed to
publicly, and i know what that means.

the thing that makes seedless different is not the passkey. it is that
your money can leave. wallet to a nigerian bank account, inside the app,
no exchange account, no p2p trader, no chat. money in crypto, life runs
in fiat. that is the thesis and it is the half every other wallet skips.

the integration is built and the credentials are live. it has still never
carried a real user transaction. that is the next thing i do, and until it
does none of the rest of this counts.

eight months ago this was an expo project with one dependency. four months
ago i was guessing. i am not guessing now, i am just behind. those are
different problems and i prefer this one.

still building.
```

## THE AMPLIFICATION MESSAGE (TG both groups + as the pointer)

```
just dropped a builder journey post on seedless

eight months in. the umbra v5 migration, a wallet lock bypass a tester
found, 190 tests from zero, and a privacy leak i found inside my own
privacy feature

also four bounties lost in one week. that part is in there too

please give it a read, drop a like, and retweet

[link]
```

## DELIBERATE CALLS
- **The offramp provider is NEVER named** — embargoed. It reads as "the integration".
- **Losses sit in the middle**, not the end, so they cannot be skimmed past. `fail in public, not fumble`.
- **Closes on something unfinished** (the offramp has never carried a real transaction), same shape as the partner-stack thread closing on the cash-out gap.
- **Does NOT mention the document that sat in git history** — it is still live on three forks and writing about it would point people at it. Publish that story only AFTER GitHub Support purges it.
- **Money figure kept at Francis's instruction**, but framed as arithmetic, not as a headline. He said: focus on the work, not the money made.
- **Does not lead on "no seed phrase"** per the standing rule.

---

# ✅ DONE — WIN SCREENSHOT RUN (completed 13 Aug 23:45)

**Task: capture the real win-announcement tweets and rebuild the card deck with them** — COMPLETE.

| Source | URL | File |
|---|---|---|
| **Bags** Winner #5 | `x.com/BagsHackathon/status/2055033580460585240` | `win-bags-aug13.jpg` |
| **Umbra** 2nd place | `x.com/UmbraPrivacy/status/2059396584807272957` | `win-umbra-aug13.jpg` |
| **100xDevs** 2nd place | `x.com/kirat_tw/status/2078164744855527703` | `win-100xdevs-aug13.jpg` |
| **Ika** Winner #04 | `x.com/ikadotxyz/status/2060346275556454834` (thread reply) | `win-ika-aug13.jpg` |

All 4 screenshots captured in dark mode from X, saved to `assets/brand/`, HTML updated, PNG re-rendered at 1280x720.
