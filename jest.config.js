// Unit-test harness for the TypeScript surface.
//
// Scope is deliberate: this covers the pure logic SECURITY.md lists as in
// scope for us — session-key lifecycle, wallet lock, UTXO accounting, stealth
// derivation. It does NOT replace the funded mainnet run, which is the only
// thing that can validate swap, private send and the offramp against real
// money. `src/__tests__/mainnet.test.ts` is that live smoke test and stays
// excluded from the default run, since it needs RPC and a funded wallet.

module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/__tests__/mainnet.test.ts',
    '<rootDir>/src/screens/_archive/',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/utils/**/*.ts',
    'src/umbra/**/*.ts',
    'src/tokens/**/*.ts',
    '!src/**/*.d.ts',
  ],
};
