// Wallet lock — biometric gate when the app returns to foreground after
// being backgrounded long enough. Settings-controlled, off by default.
//
// State model:
// - `lock_enabled` — user opted in
// - `lock_timeout_ms` — how long the app can be backgrounded before locking
// - `lock_armed_at` — timestamp set when the app goes to background
//
// All values live in SecureStore so they survive cold start without leaking.

import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const LOCK_ENABLED_KEY = 'wallet_lock_enabled';
const LOCK_TIMEOUT_KEY = 'wallet_lock_timeout_ms';
const LOCK_ARMED_KEY = 'wallet_lock_armed_at';

export const DEFAULT_LOCK_TIMEOUT_MS = 60_000;

export async function isLockEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(LOCK_ENABLED_KEY);
  return v === '1';
}

export async function setLockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(LOCK_ENABLED_KEY, enabled ? '1' : '0');
  if (!enabled) await SecureStore.deleteItemAsync(LOCK_ARMED_KEY);
}

export async function getLockTimeoutMs(): Promise<number> {
  const v = await SecureStore.getItemAsync(LOCK_TIMEOUT_KEY);
  const parsed = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOCK_TIMEOUT_MS;
}

export async function setLockTimeoutMs(ms: number): Promise<void> {
  await SecureStore.setItemAsync(LOCK_TIMEOUT_KEY, String(ms));
}

export async function armLock(): Promise<void> {
  await SecureStore.setItemAsync(LOCK_ARMED_KEY, String(Date.now()));
}

// Returns true if the lock should challenge the user now — enabled, armed,
// and the timeout has elapsed since arming. Clears the armed timestamp.
export async function consumeLockArm(): Promise<boolean> {
  const enabled = await isLockEnabled();
  if (!enabled) {
    await SecureStore.deleteItemAsync(LOCK_ARMED_KEY);
    return false;
  }
  const armedAt = await SecureStore.getItemAsync(LOCK_ARMED_KEY);
  if (!armedAt) return false;
  const timeout = await getLockTimeoutMs();
  const elapsed = Date.now() - parseInt(armedAt, 10);
  await SecureStore.deleteItemAsync(LOCK_ARMED_KEY);
  return elapsed >= timeout;
}

export interface BiometricCheck {
  available: boolean;
  enrolled: boolean;
  reason?: string;
}

export async function checkBiometricSupport(): Promise<BiometricCheck> {
  const available = await LocalAuthentication.hasHardwareAsync();
  if (!available) {
    return { available: false, enrolled: false, reason: 'No biometric hardware on this device' };
  }
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    return { available: true, enrolled: false, reason: 'No biometrics enrolled — add Face ID / fingerprint in device settings first' };
  }
  return { available: true, enrolled: true };
}

// Returns true on success. Caller decides what to do on cancel/failure
// (typically: keep the lock screen up).
export async function promptBiometric(prompt: string = 'Unlock Seedless'): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  return result.success;
}
