[# Seedless × paj.cash — how we want to plug in

**What Seedless is:** a passkey wallet on Solana. No seed phrase, no gas. Users hold dollars (USDC) and can pay anyone.

**The wedge (why paj matters):** anyone with a Nigerian bank account or mobile-money number can be *paid* by a Seedless user, without touching crypto, installing Seedless, or knowing what USDC is. paj is the rail that makes that real.

## The user experience — "OPAY inside your Phantom wallet"

- The whole app feels dollar-native. Balance shows as `$5.32`. No naira anywhere by default.
- When a user pays a Nigerian recipient, *only that moment* turns naira: they pick a bank or phone number, type `₦5,000`, see a naira fee, and tap pay. The receipt is in naira ("you sent ₦5,000 to Francis at PalmPay"). Then the app snaps right back to the dollar feel.
- The USDC → naira conversion happens silently server-side. The user never sees a rate, never sees USDC leave, they just see their dollar balance drop.

## How we integrate (security posture)

- We call paj's REST API through our own backend (Cloudflare Workers), never from the app directly. Your API key lives only server-side.
- **KYC (BVN/NIN) goes client-direct to paj — it never touches our servers.** We store only a `kyc_complete: true` flag. No personal data on our side.
- Auth is a JWT signed by the user's wallet key. No passwords, no shared secrets.
- paj is the source of truth for settlement and refunds; we never manage refund state ourselves.

## What we need from you

1. **Rate spread (the big one):** what % does paj take via `userTax` + `merchantTax` on the NGN/USDC rate vs market mid? We want to set our own fee so the *combined* total stays **≤1%**.
2. **Escrow + refunds:** on a FAILED order, does paj auto-refund USDC to the sender's wallet? What's the settlement window, and the user-visible flow?
3. **Rate quote freshness:** between the `getTokenValue` quote and `createOfframpOrder`, do you honor the quoted rate or refresh at order time?
4. **sessionToken lifetime + refresh:** what's the expiry window, and the recommended way to keep a user logged in without re-doing OTP?
5. **Webhooks:** retry pattern on 5xx, timeout, and idempotency on status changes?
6. **KYC UX:** can we submit BVN/NIN through the API with our own in-app UI, or does paj redirect to a hosted page? We want it fully in-app.
7. **Launch-day capacity:** if we send ~500 offramps in an hour at launch, is the USDC liquidity + bank-rail throughput there?

## Next step

Once you've looked this over and dropped the rate numbers, we do one small supervised live prod run together to confirm the fee math end-to-end, then we build.
](https://docs.google.com/document/d/1bfOyktL25r8SxZoY2UwJAS3ys4hymAX8uvujkw0mHBM/edit?usp=sharing)