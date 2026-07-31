// Shared test doubles for the native modules the wallet leans on.
//
// SecureStore and LocalAuthentication are native — under Node they resolve to
// stubs that throw or return undefined, which makes every storage assertion
// meaningless. These fakes model the behaviour we actually depend on: an
// in-memory keystore, and a biometric prompt whose result the test controls.
//
// The `mock` prefix on the keystore is required: jest hoists mock factories
// above the imports, so anything they close over must be recognisably a mock.

const mockKeychain = new Map();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  setItemAsync: jest.fn(async (k, v) => {
    mockKeychain.set(k, String(v));
  }),
  getItemAsync: jest.fn(async (k) => (mockKeychain.has(k) ? mockKeychain.get(k) : null)),
  deleteItemAsync: jest.fn(async (k) => {
    mockKeychain.delete(k);
  }),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

// Exposed so tests can inspect the fake keychain directly when asserting that
// a secret was actually removed rather than merely overwritten.
global.__keychain = mockKeychain;

beforeEach(() => {
  mockKeychain.clear();
});
