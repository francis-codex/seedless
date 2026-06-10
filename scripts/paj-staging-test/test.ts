import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as paj from 'paj_ramp';

const __dirname = dirname(fileURLToPath(import.meta.url));

const USDC_MAINNET_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const COINGECKO_USDC_NGN =
  'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=ngn';

const DRY_MODE = !process.argv.includes('--full');
const RESULTS_DIR = join(__dirname, 'results');

type StepLog = { step: string; ok: boolean; data?: unknown; error?: string };

interface ResultLog {
  timestamp: string;
  mode: 'dry' | 'full';
  fiatAmountNgn: number;
  steps: StepLog[];
  feeMath?: {
    coinGeckoUsdcNgn: number | null;
    pajOfframpRate: number;
    rateSpreadPercent: number;
    pajUserTax?: number;
    pajMerchantTax?: number;
    holyGrailTargetPercent: number;
    roomForBusinessFeePercent: number;
  };
}

const log: ResultLog = {
  timestamp: new Date().toISOString(),
  mode: DRY_MODE ? 'dry' : 'full',
  fiatAmountNgn: Number(process.env.TEST_FIAT_AMOUNT_NGN ?? 15250),
  steps: [],
};

function step(name: string, ok: boolean, data?: unknown, error?: string) {
  log.steps.push({ step: name, ok, data, error });
  const prefix = ok ? '✓' : '✗';
  console.log(`${prefix} ${name}`);
  if (data !== undefined) console.log('  →', JSON.stringify(data, null, 2));
  if (error) console.log('  → ERROR:', error);
}

function redact(obj: any) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  if ('token' in out) out.token = '<redacted>';
  if ('sessionToken' in out) out.sessionToken = '<redacted>';
  return out;
}

async function main() {
  console.log(`\n=== PAJ.CASH STAGING TEST ===`);
  console.log(`mode: ${DRY_MODE ? 'DRY (no USDC sent)' : 'FULL (will send USDC on mainnet)'}`);
  console.log(`fiat: ₦${log.fiatAmountNgn}`);
  console.log(`pass --full to complete the offramp\n`);

  const apiKey = process.env.BUSINESS_API_KEY;
  const email = process.env.PAJ_EMAIL;
  const accountNumber = process.env.TEST_ACCOUNT_NUMBER ?? '8087992259';
  const bankHint = (process.env.TEST_BANK_NAME_HINT ?? 'palmpay').toLowerCase();

  if (!apiKey || !email) {
    console.error('missing BUSINESS_API_KEY or PAJ_EMAIL in .env');
    console.error('copy .env.example → .env, fill in values, retry');
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });

  // initialize SDK to staging
  try {
    paj.initializeSDK(paj.Environment.Staging);
    step('initializeSDK(Staging)', true, { baseUrl: 'https://api-staging.paj.cash' });
  } catch (e: any) {
    step('initializeSDK', false, undefined, e.message);
    await rl.close();
    return saveLog();
  }

  // independent reference: CoinGecko USDC/NGN
  let coinGeckoRate: number | null = null;
  try {
    const res = await fetch(COINGECKO_USDC_NGN);
    const json = (await res.json()) as any;
    coinGeckoRate = json['usd-coin']?.ngn ?? null;
    step('coinGecko USDC/NGN reference', true, { ngn_per_usdc: coinGeckoRate });
  } catch (e: any) {
    step('coinGecko USDC/NGN reference', false, undefined, e.message);
  }

  // public rate (no auth)
  let allRate: any;
  try {
    allRate = await paj.getAllRate();
    step('paj.getAllRate (public)', true, allRate);
  } catch (e: any) {
    step('paj.getAllRate', false, undefined, e.message);
  }

  // rate by amount — the tax breakdown lives here
  let rateByAmount: any;
  try {
    rateByAmount = await paj.getRateByAmount(log.fiatAmountNgn);
    step(`paj.getRateByAmount(${log.fiatAmountNgn})`, true, rateByAmount);
  } catch (e: any) {
    step('paj.getRateByAmount', false, undefined, e.message);
  }

  // session — initiate (OTP fires)
  try {
    const initRes = await paj.initiate(email, apiKey);
    step('paj.initiate (OTP sent)', true, initRes);
  } catch (e: any) {
    step('paj.initiate', false, undefined, e.message);
    await rl.close();
    return saveLog();
  }

  const otp = (await rl.question('\n>>> enter OTP from email: ')).trim();
  const deviceInfo = { uuid: randomUUID(), device: 'cli-staging-test' };

  let sessionToken: string;
  try {
    const verifyRes: any = await paj.verify(email, otp, deviceInfo, apiKey);
    sessionToken = verifyRes.token;
    step('paj.verify (OTP)', true, redact(verifyRes));
  } catch (e: any) {
    step('paj.verify', false, undefined, e.message);
    await rl.close();
    return saveLog();
  }

  // token value (USDC equiv of test fiat)
  try {
    const tokenVal = await paj.getTokenValue(
      {
        fiatAmount: log.fiatAmountNgn,
        mint: USDC_MAINNET_MINT,
        currency: paj.Currency.NGN,
      } as any,
      sessionToken
    );
    step('paj.getTokenValue (fiat→token)', true, tokenVal);
  } catch (e: any) {
    step('paj.getTokenValue', false, undefined, e.message);
  }

  // banks
  let banks: any[] = [];
  try {
    banks = await paj.getBanks(sessionToken);
    step(`paj.getBanks (${banks.length} banks)`, true, {
      count: banks.length,
      sample: banks.slice(0, 5).map((b: any) => ({ id: b.id, code: b.code, name: b.name })),
    });
  } catch (e: any) {
    step('paj.getBanks', false, undefined, e.message);
  }

  const targetBank = banks.find((b: any) => b.name?.toLowerCase().includes(bankHint));
  if (!targetBank) {
    step(`find bank "${bankHint}"`, false, { available: banks.map((b: any) => b.name) });
    await rl.close();
    return saveLog();
  }
  step(`find bank "${bankHint}"`, true, targetBank);

  // resolve account name
  try {
    const resolved = await paj.resolveBankAccount(sessionToken, targetBank.id, accountNumber);
    step('paj.resolveBankAccount', true, resolved);
  } catch (e: any) {
    step('paj.resolveBankAccount', false, undefined, e.message);
  }

  // create offramp order — the moment of truth
  let order: any;
  try {
    order = await paj.createOfframpOrder(
      {
        bank: targetBank.id,
        accountNumber,
        currency: paj.Currency.NGN,
        fiatAmount: log.fiatAmountNgn,
        mint: USDC_MAINNET_MINT,
        chain: paj.Chain.SOLANA,
        description: 'seedless staging integration test',
        businessUSDCFee: 0,
      } as any,
      sessionToken
    );
    step('paj.createOfframpOrder', true, order);
  } catch (e: any) {
    const msg = (e?.message ?? '').toLowerCase();
    if (msg.includes('kyc') || msg.includes('verification')) {
      step('paj.createOfframpOrder', false, undefined, 'KYC required');
      console.log('\n>>> KYC required before offramp.');
      console.log('>>> per security rule: BVN/NIN is prompted in-memory and NEVER written to disk.');
      const idType = (await rl.question('BVN or NIN? ')).trim().toUpperCase();
      const idNumber = (await rl.question(`enter ${idType} (will not be saved): `)).trim();
      try {
        const kycFn = (paj as any).kyc ?? (paj as any).submitKyc;
        if (!kycFn) throw new Error('kyc function not exported from SDK; hit POST /pub/kyc directly');
        const kycRes = await kycFn(
          { idNumber, idType, country: 'NG' },
          sessionToken
        );
        step('paj.kyc submitted', true, { idRedacted: '<redacted>', type: idType, result: kycRes });
        console.log('\n>>> KYC submitted. re-run the script to retry the offramp order.');
      } catch (e2: any) {
        step('paj.kyc', false, undefined, e2.message);
      }
      await rl.close();
      return saveLog();
    }
    step('paj.createOfframpOrder', false, undefined, e.message);
    await rl.close();
    return saveLog();
  }

  // fee math
  if (coinGeckoRate && order) {
    const pajRate = Number(order.rate ?? 0);
    const spread = pajRate > 0 ? ((coinGeckoRate - pajRate) / coinGeckoRate) * 100 : 0;
    log.feeMath = {
      coinGeckoUsdcNgn: coinGeckoRate,
      pajOfframpRate: pajRate,
      rateSpreadPercent: spread,
      pajUserTax: rateByAmount?.userTax,
      pajMerchantTax: rateByAmount?.merchantTax,
      holyGrailTargetPercent: 1.0,
      roomForBusinessFeePercent: 1.0 - spread,
    };
    console.log('\n=== FEE MATH ===');
    console.log(`coingecko USDC/NGN ref:   ₦${coinGeckoRate}`);
    console.log(`paj offramp rate:         ₦${pajRate}`);
    console.log(`rate spread (paj take):   ${spread.toFixed(3)}%`);
    if (rateByAmount?.userTax != null) console.log(`paj userTax:              ${rateByAmount.userTax}`);
    if (rateByAmount?.merchantTax != null) console.log(`paj merchantTax:          ${rateByAmount.merchantTax}`);
    console.log(`holy grail target:        ≤1.000% combined`);
    console.log(`room for businessUSDCFee: ${(1 - spread).toFixed(3)}%`);
    if (spread > 1) {
      console.log(`\n⚠️  paj's rate spread alone exceeds 1%. holy grail line "off-ramping services eating 1-2%"`);
      console.log(`   is broken without negotiation. surface in tochi convo.`);
    }
  }

  if (DRY_MODE) {
    console.log('\n=== DRY MODE — order created, NO USDC sent ===');
    if (order?.address) {
      console.log(`deposit address: ${order.address}`);
      console.log(`expected USDC:   ${order.amount}`);
      console.log(`expected NGN:    ${order.fiatAmount}`);
      console.log(`paj fee:         ${order.fee}`);
      console.log(`\nto complete the offramp manually:`);
      console.log(`  1. open phantom (or any solana wallet)`);
      console.log(`  2. send ${order.amount} USDC mainnet to ${order.address}`);
      console.log(`  3. re-run with --full and the same orderId to poll status`);
    }
    await rl.close();
    return saveLog();
  }

  // FULL mode: prompt for manual USDC send, then poll
  if (order?.address && order?.id) {
    console.log('\n=== FULL MODE — send USDC manually now ===');
    console.log(`SEND: ${order.amount} USDC`);
    console.log(`TO:   ${order.address}`);
    console.log(`CHAIN: solana mainnet`);
    await rl.question('press enter once you have sent the USDC...');

    let final: any;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const tx = await paj.getTransaction(order.id, sessionToken);
        const t = (i + 1) * 3;
        console.log(`[t+${t}s] status: ${tx.status}`);
        if (tx.status === 'COMPLETED' || tx.status === 'FAILED' || tx.status === 'CANCELLED') {
          final = tx;
          break;
        }
      } catch (e: any) {
        step(`poll-${i}`, false, undefined, e.message);
      }
    }
    if (final) {
      step('final tx status', true, final);
    } else {
      step('final tx status', false, undefined, 'timed out after 60 polls (~3min)');
    }
  }

  await rl.close();
  saveLog();
}

function saveLog() {
  const fn = `results-${log.timestamp.replace(/[:.]/g, '-')}.json`;
  const fp = join(RESULTS_DIR, fn);
  writeFileSync(fp, JSON.stringify(log, null, 2));
  console.log(`\n=== results saved: ${fp} ===`);
}

main().catch((e) => {
  console.error('\n[FATAL]', e);
  saveLog();
  process.exit(1);
});
