// Staged error taxonomy mirroring src/umbra/errors patterns. Every Ika
// failure surfaces as IkaError with a stable `code` so IkaScreen can map to
// human-readable copy without string-matching.

export type IkaErrorCode =
  | 'passkey_failed'
  | 'dkg_failed'
  | 'sign_failed'
  | 'broadcast_failed'
  | 'rpc_failed'
  | 'no_dwallet'
  | 'storage_corrupt'
  | 'unsupported_chain';

export class IkaError extends Error {
  readonly code: IkaErrorCode;
  readonly cause?: unknown;
  constructor(code: IkaErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'IkaError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export function asIkaError(code: IkaErrorCode, fallback: string, err: unknown): IkaError {
  if (err instanceof IkaError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return new IkaError(code, msg || fallback, err);
}
