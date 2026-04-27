// Maps Umbra SDK staged errors to user-friendly messages and a retry hint.
// Plan reference: docs/umbra-integration-plan.md §9.2

export type RetryPolicy = 'never' | 'check-onchain' | 'refresh-utxos' | 'backoff' | 'unknown';

export interface UmbraErrorView {
  title: string;
  detail: string;
  stage?: string;
  errorClass?: string;
  retry: RetryPolicy;
  signature?: string;
  raw: unknown;
}

interface StagedErrorLike {
  name?: string;
  message?: string;
  stage?: string;
  context?: { signature?: string; logs?: readonly string[]; errorName?: string };
  cause?: unknown;
}

const TITLE_BY_CLASS: Record<string, string> = {
  RegistrationError: 'Registration failed',
  EncryptedDepositError: 'Deposit failed',
  EncryptedWithdrawalError: 'Withdraw failed',
  CreateUtxoError: 'Private send failed',
  ClaimUtxoError: 'Claim failed',
  ConversionError: 'Encryption upgrade failed',
  FetchUtxosError: 'Could not load private balances',
  QueryError: 'Lookup failed',
  MasterSeedSigningRejectedError: 'Signature rejected',
};

const RETRY_BY_STAGE: Record<string, RetryPolicy> = {
  'transaction-sign': 'never',
  'transaction-send': 'check-onchain',
  'transaction-validate': 'refresh-utxos',
  'rpc': 'backoff',
};

function looksLikeStaged(err: unknown): err is StagedErrorLike {
  return !!err && typeof err === 'object' && ('stage' in err || 'name' in err);
}

export function viewUmbraError(err: unknown): UmbraErrorView {
  if (!looksLikeStaged(err)) {
    return {
      title: 'Umbra error',
      detail: String((err as any)?.message ?? err),
      retry: 'unknown',
      raw: err,
    };
  }
  const errorClass = err.name ?? err.context?.errorName;
  const stage = err.stage;
  const title: string = (errorClass && TITLE_BY_CLASS[errorClass]) || 'Umbra error';
  const baseDetail = err.message ?? 'unknown error';
  const logs = err.context?.logs?.slice(-4).join('\n');
  const detail = logs ? `${baseDetail}\n\n${logs}` : baseDetail;
  const retry: RetryPolicy = (stage && RETRY_BY_STAGE[stage]) || 'backoff';
  return {
    title,
    detail,
    stage,
    errorClass,
    retry,
    signature: err.context?.signature,
    raw: err,
  };
}

export function describeRetry(view: UmbraErrorView): string {
  switch (view.retry) {
    case 'never':
      return 'User cancelled — will not retry automatically.';
    case 'check-onchain':
      return 'Transaction may have landed — checking explorer before retry.';
    case 'refresh-utxos':
      return 'Mixer state moved on — refreshing UTXOs and retrying.';
    case 'backoff':
      return 'Transient error — retrying with backoff.';
    case 'unknown':
    default:
      return 'No automatic retry policy.';
  }
}
