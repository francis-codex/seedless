# Google Play — Listing, Data Safety, Content Rating & Financial Declaration

Field-by-field content to paste into Play Console for `com.seedless.wallet` (task #101).
Verified against the actual v0.4.5-beta build: no analytics/crash/telemetry SDK, no camera
(QR is generated, not scanned), no push SDK, no contacts. Only device-local SecureStore key
storage + clipboard; only network egress is to public Solana RPC / relayers carrying on-chain data.

---

## 1. Store listing

**App name** (30 char max): `Seedless: Solana Wallet` (23)

**Short description** (80 char max):
`A Solana wallet with no seed phrase. Passkey login, private by default.` (70)

**Full description** (4000 char max):

```
Seedless is a self-custodial Solana wallet built around one idea: you should not have to
write down a seed phrase to own your crypto.

Instead of a 12-word backup you protect with your life, Seedless secures your wallet with a
passkey — the same Face ID / fingerprint you already use to unlock your phone. Your keys are
generated and stored on your device. There is no account to sign up for, no email, no server
holding your funds.

WHAT YOU CAN DO
• Create a wallet in seconds with a passkey — no seed phrase to lose or leak
• Send and receive SOL and SPL tokens
• Swap tokens directly in the app
• Private sends — move funds without broadcasting the amount and recipient to the world
• Stealth addresses for receiving privately
• Burner wallets for one-off, disposable activity
• Track balances and transaction history

PRIVATE BY DEFAULT
Most wallets leak everything: every balance, every transfer, every counterparty is public
forever. Seedless brings private transfers to everyday Solana users, so your financial life
is not an open ledger.

SELF-CUSTODIAL
Seedless is non-custodial. You hold your keys, on your device. Seedless Labs cannot access,
freeze, or move your funds. There are no accounts and no personal data stored on our servers.

Seedless is in active beta. Use amounts you are comfortable with while we harden the app
toward a full release.

Built by Seedless Labs.
```

**App category:** Finance
**Tags:** crypto wallet, Solana, self-custody
**Contact email:** hello@seedlesslabs.xyz (set up catch-all — see todo) — interim: franciscodex.sol@gmail.com
**Website:** https://seedlesslabs.xyz
**Privacy policy URL:** (the reconciled/live policy from #98)

---

## 2. Data Safety form

> NOTE (Jul 9 decision): the first build ships the naira offramp, which requires KYC.
> So "no data collected" is NO LONGER accurate for this build. The wallet itself still
> collects nothing; the KYC step collects a government ID for the payout flow. Declare:

**Does your app collect or share any of the required user data types?** → **Yes** (KYC only).

The wallet core collects nothing:
- No account system — no name, email, or user ID for the wallet.
- Wallet keys are generated on-device in the OS secure enclave (expo-secure-store); key
  material never leaves the device.
- No analytics, crash-reporting, advertising, or telemetry SDKs. QR is generated (no camera).
- Wallet network egress is public Solana RPC / relayers (public on-chain data only).

The KYC step (only when a user chooses to pay a Nigerian bank) collects:
- **Financial info → "Other financial info": government ID (BVN/NIN)** and the destination
  **bank account number**. Also **email or phone** (one-time, to establish the payout session).
- **Collected: Yes. Shared: Yes** — transmitted to our licensed payment partner (paj.cash) to
  verify identity and settle the bank payout. **Stored by us: No** — processed and forwarded,
  never retained on Seedless servers (mark **"processed ephemerally"** where Play offers it).
- **Purpose:** Fraud prevention, security, and compliance; App functionality (payments).
- **Required or optional:** Optional — only users who use the bank-payout feature provide it.

Follow-on answers:
- **Is all collected data encrypted in transit?** → Yes (HTTPS/TLS end to end).
- **Data deletion:** wallet data lives on-device (removed on uninstall). KYC/payment records
  are held by paj.cash (the licensed processor); deletion requests route to them.

---

## 3. Content rating questionnaire (IARC)

- **App category:** Utility / Productivity / Tools (NOT a game).
- Violence, sexual content, profanity, drugs, hate: **No** to all.
- **Gambling / simulated gambling:** No.
- **Does the app let users buy real digital goods / does it reference cryptocurrency?** → Yes,
  it is a cryptocurrency wallet (answer this honestly where the questionnaire asks about
  financial products / cryptocurrency).
- **User-generated content / social features:** No.
- Expected rating: Everyone / PEGI 3 on content grounds. Note the **18+ target-audience** choice
  below governs distribution regardless of the content rating.

---

## 4. Target audience & content

- **Target age group:** 18 and over only. (Crypto/financial app — do NOT include under-18
  audiences; this also keeps the app out of Families policy scope.)
- **Appeals to children?** No.

---

## 5. Financial features declaration (required for crypto apps)

Google Play requires a declaration for apps that provide crypto-asset services.

- **Feature type:** Cryptocurrency wallet — **software, non-custodial**.
- **Custody:** The app does NOT hold, store, or control user funds or private keys on any
  server. Keys are generated and held on the user's device; Seedless Labs cannot access or
  move user funds. It is a self-custodial software wallet, not an exchange or custodian.
- **Not offered:** custodial storage, fiat on/off-ramp (the offramp is not in this build),
  lending, staking-as-a-service, or brokerage. (Update this if any is added before submission.)
- **Organization:** Seedless Labs Limited (Nigeria CAC registered). D-U-N-S 352293953.
- **Licensing:** As a non-custodial software wallet that never takes possession of user assets,
  Seedless does not act as a money transmitter / VASP for the swap and transfer features in
  this build. If Google requests region-specific licensing, respond that the app is a
  self-custodial software tool and provide the entity registration.

---

## 6. Pre-submit checklist (do in order — #100 → #101 → #102)

1. [#100] Register package `com.seedless.wallet` on the Android developer verification page
   (clears the Jul 5 Play email).
2. [#101] Paste sections 1–5 above into the corresponding Play Console forms; upload the
   staged assets from this folder (icon-512, feature-graphic, screenshot-01..05).
3. [#102] ONLY after a real swap verifies on a funded wallet: bump version, cut EAS **.aab**
   (`eas build -p android --profile production` or the release profile — NOT apk; Play requires
   .aab) with swaps enabled → upload to the release → submit → review clock starts.
```
