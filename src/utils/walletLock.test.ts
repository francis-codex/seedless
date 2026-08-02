// Wallet lock behaviour.
//
// The case that matters most here is the cancel + force-quit bypass a tester
// found on Jun 22: if consuming the arm cleared it, a user could cancel the
// biometric prompt, kill the app, and relaunch straight into an unlocked
// wallet. The fix was to leave the armed key set until an actual unlock, so
// these tests pin that behaviour down.

import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_LOCK_TIMEOUT_MS,
  armLock,
  checkBiometricSupport,
  clearLockArm,
  consumeLockArm,
  getLockTimeoutMs,
  isLockEnabled,
  promptBiometric,
  setLockEnabled,
  setLockTimeoutMs,
} from './walletLock';

const LOCK_ARMED_KEY = 'wallet_lock_armed_at';

describe('lock enable/disable', () => {
  it('is off by default', async () => {
    await expect(isLockEnabled()).resolves.toBe(false);
  });

  it('round-trips the enabled flag', async () => {
    await setLockEnabled(true);
    await expect(isLockEnabled()).resolves.toBe(true);

    await setLockEnabled(false);
    await expect(isLockEnabled()).resolves.toBe(false);
  });

  it('disarms when the lock is turned off, so a stale arm cannot fire later', async () => {
    await setLockEnabled(true);
    await armLock();
    expect(await SecureStore.getItemAsync(LOCK_ARMED_KEY)).not.toBeNull();

    await setLockEnabled(false);
    expect(await SecureStore.getItemAsync(LOCK_ARMED_KEY)).toBeNull();
  });
});

describe('lock timeout', () => {
  it('falls back to the default when nothing is stored', async () => {
    await expect(getLockTimeoutMs()).resolves.toBe(DEFAULT_LOCK_TIMEOUT_MS);
  });

  it('treats 0 as a valid "Immediately" setting rather than falsy', async () => {
    await setLockTimeoutMs(0);
    await expect(getLockTimeoutMs()).resolves.toBe(0);
  });

  it('rejects a negative stored value', async () => {
    await setLockTimeoutMs(-5_000);
    await expect(getLockTimeoutMs()).resolves.toBe(DEFAULT_LOCK_TIMEOUT_MS);
  });

  it('rejects a corrupt stored value', async () => {
    await SecureStore.setItemAsync('wallet_lock_timeout_ms', 'not-a-number');
    await expect(getLockTimeoutMs()).resolves.toBe(DEFAULT_LOCK_TIMEOUT_MS);
  });
});

describe('consumeLockArm', () => {
  it('does not challenge when the lock is disabled, even if armed', async () => {
    await armLock();
    await expect(consumeLockArm()).resolves.toBe(false);
  });

  it('clears a stale arm left behind by a disabled lock', async () => {
    await armLock();
    await consumeLockArm();
    expect(await SecureStore.getItemAsync(LOCK_ARMED_KEY)).toBeNull();
  });

  it('does not challenge when enabled but never armed', async () => {
    await setLockEnabled(true);
    await expect(consumeLockArm()).resolves.toBe(false);
  });

  it('does not challenge before the timeout has elapsed', async () => {
    await setLockEnabled(true);
    await setLockTimeoutMs(60_000);
    await armLock();

    await expect(consumeLockArm()).resolves.toBe(false);
  });

  it('challenges once the timeout has elapsed', async () => {
    await setLockEnabled(true);
    await setLockTimeoutMs(60_000);

    const armedAt = Date.now() - 61_000;
    await SecureStore.setItemAsync(LOCK_ARMED_KEY, String(armedAt));

    await expect(consumeLockArm()).resolves.toBe(true);
  });

  it('challenges immediately when the timeout is 0', async () => {
    await setLockEnabled(true);
    await setLockTimeoutMs(0);
    await armLock();

    await expect(consumeLockArm()).resolves.toBe(true);
  });

  // The Jun 22 bypass. consumeLockArm must be non-destructive, so that
  // cancelling the prompt and force-quitting leaves the wallet locked.
  it('leaves the arm in place so a cancelled prompt still locks on relaunch', async () => {
    await setLockEnabled(true);
    await setLockTimeoutMs(0);
    await armLock();

    await expect(consumeLockArm()).resolves.toBe(true);
    expect(await SecureStore.getItemAsync(LOCK_ARMED_KEY)).not.toBeNull();

    // Simulated relaunch after the user cancelled and killed the app.
    await expect(consumeLockArm()).resolves.toBe(true);
  });

  it('stops challenging only after an explicit unlock clears the arm', async () => {
    await setLockEnabled(true);
    await setLockTimeoutMs(0);
    await armLock();

    await expect(consumeLockArm()).resolves.toBe(true);
    await clearLockArm();
    await expect(consumeLockArm()).resolves.toBe(false);
  });

  it('clearLockArm is idempotent', async () => {
    await clearLockArm();
    await expect(clearLockArm()).resolves.toBeUndefined();
  });
});

describe('biometric support', () => {
  const LocalAuthentication = require('expo-local-authentication');

  it('reports missing hardware', async () => {
    LocalAuthentication.hasHardwareAsync.mockResolvedValueOnce(false);

    const result = await checkBiometricSupport();
    expect(result).toMatchObject({ available: false, enrolled: false });
    expect(result.reason).toBeDefined();
  });

  it('reports hardware present but nothing enrolled', async () => {
    LocalAuthentication.isEnrolledAsync.mockResolvedValueOnce(false);

    const result = await checkBiometricSupport();
    expect(result).toMatchObject({ available: true, enrolled: false });
    expect(result.reason).toBeDefined();
  });

  it('reports ready when hardware is present and enrolled', async () => {
    await expect(checkBiometricSupport()).resolves.toEqual({
      available: true,
      enrolled: true,
    });
  });

  it('surfaces a cancelled prompt as a failure rather than swallowing it', async () => {
    LocalAuthentication.authenticateAsync.mockResolvedValueOnce({ success: false });
    await expect(promptBiometric()).resolves.toBe(false);
  });

  it('passes the caller prompt through to the OS', async () => {
    await promptBiometric('Confirm send');
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Confirm send' }),
    );
  });
});
