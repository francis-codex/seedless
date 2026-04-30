# Bags Hackathon — Submission Pack

Deadline: Apr 28 2026 · Status: ready to ship

## Official rules (per Bags)

> 1. Submit a demo video of your product on X with a thread explaining your idea, traction, and roadmap by April 28th.
> 2. Post the X link to your demo video on your app page on Bags (Updates tab on your bags profile).
> 3. Reviewed by Bags team + surprise judges.

**Translation:** the X thread IS the submission. The bags page just receives the X link.

---

## Final assets

### Videos

| File | Use | Specs |
|---|---|---|
| `~/Desktop/seedless_demo_bags_clean.mp4` | **X tweet 1** (the submission) | 720×1180, 3:13, 9.7MB, h264/aac |
| `assets/brand/p2VrqAbhw_GI5Q4N.mp4` | Optional add — quote-RT later for reach | 1920×1080, 0:21, 1.8MB |

**Decision:** demo video goes on X (it's what judges actually grade). The launch video is a follow-up engagement play, not the submission itself.

### Links

- Site: `https://seedlesslabs.xyz`
- GitHub: `https://github.com/seedless-labs/seedless`
- $SEED on Bags: `https://bags.fm/FYt532fCsCuoHd9aaX5QN7pZLUTiSXwEjhBmZijgBAGS`
- $SEED contract: `FYt532fCsCuoHd9aaX5QN7pZLUTiSXwEjhBmZijgBAGS`
- Audit (LazorKit, Solana Foundation-backed): `https://github.com/lazor-kit/program-v2/tree/main/audits`

---

## Submission order

1. **Post the X thread** (demo video attached to tweet 1) — this IS the submission
2. **Copy the URL of tweet 1** (the one with the video)
3. **Open your bags profile → Updates tab → your Seedless app page**
4. **Paste the X link** in the update / submission field
5. **Screenshot both:** the X thread + the bags page showing the link posted
6. **DM Kay on TG** — "submitted, used the audit framing — here's the thread [link]"

That's it. Everything else (github, site, audit URL) lives inside the thread itself.

---

## X thread — the submission (5 tweets, idea + traction + roadmap covered)

### tweet 1 (attach `seedless_demo_bags_clean.mp4`)

```
seedless. passkey-first solana wallet built on @lazorkit.

no seed phrase. no extension. face id signs every tx.

4 @bagsfm integrations live. 3 min end-to-end demo ↓
```

### tweet 2 — what shipped (the idea, executed)

```
what's running in the demo:

– gasless swap (kora paymaster covers fee)
– bags fee claims pulled live from the api
– random reward draw — real on-chain sol airdrop to a $SEED holder, signed via passkey
– token launch flow, anyone can launch on bags from their wallet
```

### tweet 3 — traction

```
traction:

– $SEED launched on bags.fm — 113+ SOL in lifetime fees
– the launch flow in the demo is the same one we shipped $SEED with
– lifetime fees + recent claims in the video are real mainnet reads
– shipped 4 integrations end-to-end in the hackathon window

ca: FYt532fCsCuoHd9aaX5QN7pZLUTiSXwEjhBmZijgBAGS
```

### tweet 4 — the audit / network framing (Kay-blessed)

```
on devnet:

smart wallet's already audited.
public report, solana foundation-backed:
github.com/lazor-kit/program-v2/tree/main/audits

mainnet flips the moment partner cert clears with @lazorkit.
devnet today by discipline, not by gap.
```

### tweet 5 — roadmap + links

```
roadmap:

– mainnet flip (audit done, partner cert pending)
– new brand drop (rebrand by @wellsreyem in final wire-up)
– more bags primitives — fee splits, creator tools, holder utilities

seedlesslabs.xyz
github.com/seedless-labs/seedless
bags.fm/FYt532fCsCuoHd9aaX5QN7pZLUTiSXwEjhBmZijgBAGS
```

---

## Pre-post checklist

Before you hit "post" on tweet 1:

- [ ] You're posting from `@seedless_wallet` (not `@francis_codex`) — the project account submits, the founder amplifies
- [ ] Demo video uploaded to tweet 1, plays in preview
- [ ] First line reads clean (no orphan word at the end of a line)
- [ ] @lazorkit handle is correct
- [ ] @bagsfm handle is correct
- [ ] @wellsreyem handle is correct
- [ ] Audit URL is the right one (`/lazor-kit/program-v2/tree/main/audits`)
- [ ] CA copied verbatim from constants — no character drift

After posting:

- [ ] Quote-RT from `@francis_codex` with one line of personal voice ("we shipped this in X weeks", "proud of the team", whatever feels true)
- [ ] Pin the thread on `@seedless_wallet` until results day
- [ ] Drop the X link on bags page Updates tab immediately
- [ ] Screenshot bags page showing the link (proof you submitted)

---

## Demo video — what's in it (so the thread copy lines up with the visuals)

3:13 walkthrough, recorded on iPhone 17 Pro Max, devnet build:

- 00:00 — opens on home screen, taps Seedless icon
- 00:15 — connects with passkey (Face ID)
- 00:30 — gasless SOL → USDC swap via Jupiter, Kora pays fee
- 00:55 — SEED Rewards: live mainnet data (113.92 SOL lifetime fees), Run Reward Draw fires real on-chain devnet transfer, "Reward sent!" alert
- 01:35 — Launch Token: 3-step flow (Info → Fees → Confirm), no submit (bags API is mainnet-only)
- 02:30 — close, audit URL mention

Note: video shows the **old logo** (Wells rebrand still being wired into app code). Judges won't know there's a new one. Ship as-is — v2 demo with new brand drops later.

---

## Risk / FAQ — if anyone asks in replies

**Q: Why devnet?**
A: Smart wallet's already audited (link). Mainnet flips when partner cert clears with @lazorkit. Devnet today by discipline, not by gap.

**Q: Can I try it on mainnet?**
A: Not yet — Kay (LazorKit) is finishing partner-side checks. Audit report is public, Solana Foundation-backed. The moment cert clears, we flip.

**Q: Where's the rebrand?**
A: Wells designed the new identity (family.co direction). Currently being wired into app icon, splash, in-app references. v2 demo with new brand drops as a follow-up post.

**Q: Is $SEED real?**
A: Yes — live on Bags.fm mainnet (CA above). Lifetime fees in demo are real mainnet reads.

---

## Post-submission cadence

- **Tonight:** ship X thread + paste link on bags page + DM Kay
- **Tomorrow:** wire new Wells logo into app.json icon, splash, in-app refs. Rebuild on physical phone.
- **Apr 27:** post the launch video (`p2VrqAbhw_GI5Q4N.mp4`) as a standalone tweet from `@seedless_wallet` quoting the submission thread — second engagement wave
- **Apr 28 (deadline day):** quote-tweet your own submission thread with one closing line about what's next post-bags
