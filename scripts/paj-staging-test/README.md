# paj.cash staging integration test

verifies fee math + offramp flow against `api-staging.paj.cash` before drafting tochi outreach.

## prerequisites

- node 20+
- npm
- (full mode only) ~$10.50 USDC on solana mainnet in a wallet you control (phantom etc.)

## setup

```sh
cd scripts/paj-staging-test

# rotate the leaked API key in the paj dashboard first
# then create a fresh one — paste it into .env

cp .env.example .env
# edit .env:
#   BUSINESS_API_KEY=<new rotated key>
#   PAJ_EMAIL=franciscodex.sol@gmail.com
#   TEST_ACCOUNT_NUMBER=8087992259      (PalmPay verified working)
#   TEST_BANK_NAME_HINT=palmpay
#   TEST_FIAT_AMOUNT_NGN=15250           (~$10)

npm install
```

## run

```sh
# DRY: creates the offramp order, observes fee math, does NOT send any USDC
npm run dry

# FULL: same as dry, then prompts you to send USDC manually, then polls status
npm run full
```

## what the script does (in order)

1. `initializeSDK(Staging)` → points at `api-staging.paj.cash`
2. CoinGecko USDC/NGN reference rate (independent baseline)
3. `paj.getAllRate` (public, no auth)
4. `paj.getRateByAmount` (returns userTax + merchantTax breakdown)
5. `paj.initiate` → fires OTP to your registered email
6. you paste OTP at terminal prompt
7. `paj.verify` → returns sessionToken (redacted in logs)
8. `paj.getTokenValue` → USDC equivalent of test fiat
9. `paj.getBanks` → list, find target bank by name hint
10. `paj.resolveBankAccount` → confirms account name
11. `paj.createOfframpOrder` → returns deposit address + USDC + fee
12. if KYC required: prompts for BVN or NIN (in-memory only, NEVER logged or written), submits
13. computes fee math vs CoinGecko mid + holy grail ≤1% target
14. **DRY**: stops, prints how to complete manually
15. **FULL**: prompts you to send USDC via phantom, polls `getTransaction` every 3s up to ~3min

## security notes

- `BUSINESS_API_KEY` lives in `.env` only — gitignored, never committed
- BVN/NIN prompted at runtime, in-memory only, ZERO disk persistence
- session token redacted in result files
- results land in `results/results-<timestamp>.json` (gitignored)

## reading the output

console prints a fee math summary block at the end:

```
=== FEE MATH ===
coingecko USDC/NGN ref:   ₦1525
paj offramp rate:         ₦1510
rate spread (paj take):   0.984%
paj userTax:              N
paj merchantTax:          M
holy grail target:        ≤1.000% combined
room for businessUSDCFee: 0.016%
```

- **rate spread <1%** → we have room for businessUSDCFee, holy grail holds
- **rate spread ≥1%** → paj's cut alone exceeds our combined cap; surface in tochi convo (renegotiate partner rate, or rewrite line)

## troubleshooting

- **OTP not arriving:** check spam, confirm `PAJ_EMAIL` matches dashboard signup email
- **`kyc function not exported`:** SDK may not expose KYC helper; hit `POST /pub/kyc` directly with `idNumber`, `idType`, `country: 'NG'`, `Authorization: Bearer <sessionToken>`
- **`createOfframpOrder` fails with non-KYC error:** check that `targetBank.id` is valid and `accountNumber` resolved cleanly first
- **rate spread looks wrong:** CoinGecko might be lagging; cross-check with a NG OTC rate (Binance P2P median)

## next

once the test ships clean fee math:
- log the JSON result to `memory/paj_staging_results_jun{date}.md`
- bake real numbers into the tochi architecture sketch
- fire the sketch as the substantive re-open after 10-day silence
