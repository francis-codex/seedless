# Seedless — Master Pitch Deck v3 (May 2 2026)

**Source of truth.** v2 (assets/deck-v3-export/*.png — confusingly named) is deprecated. Build this in Google Slides, NOT Figma or Canva (per Yosip / Superteam Balkans workshop — judges/mentors comment inline on slides, you can't with PDFs).

**Use cases for this single deck:**
- Today 4pm WAT: Umbra × Ownership roadshow stream (slides 6 + 7 use the **UMBRA** swap)
- Next: Colosseum Frontier submission (slides 6 + 7 use the **COLOSSEUM** swap)
- After: VCs / Mert DM / Alchemy fund app (same base; tweak slide 9 ask)

**Design rules (locked):**
- 9 slides. Hard cap at 10.
- Pure black background `#000000`. Pure white text `#FFFFFF`. ONE accent color: brand blue from `assets/brand/`.
- ≤20 words per slide. One big sentence. One big image. That's it.
- No animation, no transitions, no GIFs, no music. Default appear-on-click only.
- No section title slides ("Problem", "Solution", "Team"). Story flows without them.
- 8pt footer for sources (only on slides with stats). Format: `Source · Year · URL`
- Mobile-readable. Judges watch on phones in Ubers.

---

## SLIDE 1 — Cover

**Big text (centered):**
```
seedless
```
**Subtitle (smaller, below):**
```
simple and private passkey wallet on solana
```
**Visual:** brand logo above wordmark. Nothing else.

**No version stamp. No "$300K Pre-Seed SAFE" (kill — both Millian and 8bit flagged, fundraise is now token-based per `project_fundraise_structure_may02.md`).**

---

## SLIDE 2 — Lead with the strongest fact (per Mert)

**Big text:**
```
live on solana mainnet beta.
log in with face id.
```
**Visual:** one phone mockup — face id sheet over a clean wallet home screen. No multi-device collage.

*Why this is slide 2 instead of "problem first": Mert says lead with your strongest selling point, not a template. Our strongest opener is "this exists, it works, it's on mainnet, no seed phrase." That's the fact that earns the next 60 seconds of attention.*

---

## SLIDE 3 — The friction (peer-reviewed UX failure)

**Big text:**
```
60.8% of crypto users default to custodial wallets.
only 43% can even recognize a seed phrase.
```
**Visual:** a stylized 12-word seed phrase grid with question marks over half the words. Big, brutal.

**Footer (8pt):** `CHI 2025 (ACM) · n=643 · dl.acm.org/doi/full/10.1145/3706598.3713209`

*Teaches the judge something they didn't know: peer-reviewed academic data showing self-custody is a minority behavior because seed phrases are unrecognizable to most users. This is the strongest UX stat in the deck.*

---

## SLIDE 4 — The loss (security failure)

**Big text:**
```
$9.3B lost to crypto fraud in 2024.
69% of wallet losses came from compromised keys, not smart contracts.
```
**Visual:** big "$9.3B" centered, OR a clean 2-bar comparison: "credential/key compromise: 69%" tall, "smart contract exploits: 31%" short.

**Footer (8pt):** `FBI IC3 2024 · DeepStrike H1 2025 · ic3.gov/AnnualReport · deepstrike.io/blog/crypto-hacking-incidents-statistics-2025-losses-trends`

*Reframes the security narrative — most "crypto hacks" are key/seed compromises, not smart contract bugs. Seedless removes the seed.*

---

## SLIDE 5 — How it works (one image)

**Big text:**
```
log in with face id.
sign with your phone.
gas paid for you.
```
**Visual:** one phone showing a "send" screen with face id sheet over it. NOT a feature grid. NOT three icons in a row. ONE phone.

*Implicit competitive differentiation: no other Solana wallet does all three. Don't put a competitor matrix (Mert: "do not"). Let the viewer infer Phantom requires a seed, doesn't pay gas.*

---

## SLIDE 6 — SWAP SLOT (audience-specific)

### 6A — UMBRA STREAM cut (today, 4pm WAT)
**Big text:**
```
private payments, inside the wallet anyone can use.
```
**Visual:** the Umbra Debug screen Phase 2 ops crop — Deposit ✅ / Withdraw ✅ / Create receiver-claimable UTXO ✅ — all green. CROP ABOVE the Scan section. Use the second simulator screenshot from May 2 13:42 session.

**Footer (8pt):** `built on @umbraprivacy v4 SDK · live on devnet · mainnet next`

### 6B — COLOSSEUM cut (tonight + onward)
**Big text:**
```
mainnet next.
private by default.
yours forever.
```
**Visual:** clean roadmap or single hero mockup of the next milestone. To be designed.

### 6C — VC / FUND cut (later)
**Big text:**
```
the on-ramp for the next billion solana users.
```
**Visual:** a16z State of Crypto chart cropped — emerging markets growth. Argentina 16x in 3 years.
**Footer (8pt):** `a16z State of Crypto 2025 · a16zcrypto.com/posts/article/state-of-crypto-report-2025`

---

## SLIDE 7 — Proof (this is real)

**Big text:**
```
co-signed by mert (helius), kru (umbra), solana foundation.
```
**Visual:** composite of three tweet/post screenshots — Mert cosign, Kru cosign, Solana Foundation "Privacy Wallet" watchlist mention. Small thumbnails, clean spacing. If three feels busy, fall back to ONE big screenshot of the Foundation watchlist line.

*"Mert (Helius CEO)" — Millian flagged that "Helius CEO co-sign" alone is unclear. Spell it out: name + role.*

*Optional sub-line if room: "live on solana mainnet beta · X beta testers" (only if X is non-zero by stream time — otherwise just the cosigns).*

---

## SLIDE 8 — Why now / where this goes

**Big text:**
```
40–70 million people use crypto. 1 billion already use passkeys.
```
**Visual:** two big numbers side by side — `40–70M` and `1B+` — with tiny labels under each. Or a single phone with face id and a globe.

**Footer (8pt):** `a16z State of Crypto 2025 · FIDO Alliance World Passkey Day 2025 · fidoalliance.org/fido-alliance-champions-widespread-passkey-adoption-and-a-passwordless-future-on-world-passkey-day-2025`

*Teaches the judge: passkeys aren't a crypto-niche bet. The mainstream auth primitive that 1B+ people already use is the same one Seedless uses. We're meeting users where they already are.*

---

## SLIDE 9 — Ask (audience-specific)

### 9A — UMBRA STREAM cut
**Big text:**
```
join the beta.
seedlesslabs.xyz
```
**Visual:** big QR code to seedlesslabs.xyz. Nothing else.

### 9B — COLOSSEUM cut
**Big text:**
```
seedlesslabs.xyz · @seedless_wallet · @francis_codex
```
**Visual:** seedless logo, social handles, no QR. (Founders video carries the rest.)

### 9C — VC / FUND cut
**Big text:**
```
raising to ship the on-ramp.
seedlesslabs.xyz
```
**Visual:** logo + contact (email + telegram).

---

## What got cut from v2 (and why)

| Cut | Reason |
|---|---|
| `$300K Pre-Seed SAFE` on cover | Millian: not necessary; 8bit: SAFE+token = double dipping (we're token-based per `project_fundraise_structure_may02.md`) |
| `$SEED holders` stat | Millian: $SEED unexplained for cold readers, drop unless we add a context slide |
| `wallets still ship 2017 UX` copy | Millian: copy off, no source. Replaced with CHI 2025 (peer-reviewed) |
| `Helius CEO co-sign` (ambiguous) | Millian: unclear. Now reads "Mert (Helius)" |
| `Daily Github Commits` | Millian: vanity metric |
| Africa framing | Worldwide stats more defensible (we keep the angle implicit via a16z emerging-markets data on slide 6C / slide 8) |
| Cookie-cutter section titles | Yosip/Mert: avoid. Story flows |
| Background music, GIFs, transitions | Yosip's "don't add fluff" rule |
| Competitor matrix | Mert: "do not." Differentiation woven into slide 5 |
| Brand colors, custom fonts, gradients | Mert: "do not brand your deck." Black/white + one accent only |

## What got added

| Add | Reason |
|---|---|
| CHI 2025 ACM stat (60.8% custodial, 43% recognition) | Peer-reviewed, brutal, defensible in one click |
| FBI IC3 2024 ($9.3B fraud) | Primary source; reframes scale |
| DeepStrike H1 2025 (69% from credentials) | Reframes "smart contract hack" narrative |
| FIDO Alliance (1B+ passkeys, 4× more successful) | Shows passkeys are mainstream, not crypto-niche |
| a16z State of Crypto 2025 (40-70M users, emerging markets) | Tam + urgency without the "1 trillion dollar TAM" cliche Mert warns against |
| Mert / Kru / Foundation cosigns slide | Slide 7 is now the single proof slide |

## Sources used (every link verified May 2 2026)

1. CHI 2025 paper — https://dl.acm.org/doi/full/10.1145/3706598.3713209
2. FBI IC3 2024 Annual Report — https://www.ic3.gov/AnnualReport/Reports/2024_IC3Report.pdf
3. DeepStrike — https://deepstrike.io/blog/crypto-hacking-incidents-statistics-2025-losses-trends
4. FIDO Alliance — https://fidoalliance.org/fido-alliance-champions-widespread-passkey-adoption-and-a-passwordless-future-on-world-passkey-day-2025/
5. a16z State of Crypto 2025 — https://a16zcrypto.com/posts/article/state-of-crypto-report-2025/
6. Scam Sniffer 2024 (held in reserve) — https://drops.scamsniffer.io/scam-sniffer-2024-web3-phishing-attacks-wallet-drainers-drain-494-million/

## Build order (next 2.5 hours)

1. **Now → 1:30pm WAT** (~50 min): Open Google Slides. Set black bg / white text / brand-blue accent. Drop placeholders for all 9 slides with text from this spec.
2. **1:30 → 2:30pm WAT** (~60 min): Real assets — phone mockups, screenshots (slide 6A is the cropped Umbra Debug capture), tweet composites, source footers.
3. **2:30 → 3:30pm WAT** (~60 min): Dry-run with audio. Time to ≤3 minutes (Yosip rule). Tighten any slide that takes >20 seconds to land.
4. **3:30 → 4pm WAT** (~30 min): Export, screen-share test, water, mic check.
5. **4pm WAT** — STREAM.

## Tonight (post-stream)

- Swap slide 6A → 6B for Colosseum cut
- Record founders video (60-90s, in person if possible — Yosip's "20% boost" rule)
- Save final v3 PDF + Google Slides link to `assets/deck-v3-export/` and update this doc with the link
