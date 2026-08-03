// Unit-test harness for the TypeScript surface.
//
// Scope is deliberate: this covers the pure logic SECURITY.md lists as in
// scope for us — session-key lifecycle, wallet lock, UTXO accounting, stealth
// derivation. It does NOT replace the funded mainnet run, which is the only
// thing that can validate swap, private send and the offramp against real
// money. `src/__tests__/mainnet.test.ts` is that live smoke test and stays
// excluded from the default run, since it needs RPC and a funded wallet.

const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  ...expoPreset,
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/__tests__/mainnet.test.ts',
    '<rootDir>/src/screens/_archive/',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  clearMocks: true,
  restoreMocks: true,

  // rpc-websockets, pulled in by @solana/web3.js, publishes an exports map
  // with only "browser" and "node" conditions and no "default". The React
  // Native test environment asks for "react-native", matches nothing, and
  // the require fails outright. Ask for the node build.
  testEnvironmentOptions: {
    ...(expoPreset.testEnvironmentOptions || {}),
    customExportConditions: ['node', 'require', 'default'],
  },

  // The preset only transforms `.js/.jsx/.ts/.tsx`. Several Solana packages
  // ship `.mjs` entrypoints (@solana/codecs-numbers reaches one through
  // web3.js), which then hit the runtime untransformed and fail with
  // "Cannot use import statement outside a module". Extend, do not replace —
  // the asset transformers in the preset still need to be there.
  transform: {
    ...expoPreset.transform,
    '\\.[mc]js$': [
      'babel-jest',
      { caller: { name: 'metro', bundler: 'metro', platform: 'ios' } },
    ],
  },

  // Same story for the ignore list: jest-expo stops at the Expo and React
  // Native scopes, so the Solana and crypto packages have to be named or
  // they are never handed to babel at all.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/.*|native-base|react-native-svg|@solana/.*|@noble/.*|@scure/.*|superstruct|uuid|jayson|rpc-websockets|borsh|bs58|base-x))',
  ],

  collectCoverageFrom: [
    'src/utils/**/*.ts',
    'src/umbra/**/*.ts',
    'src/tokens/**/*.ts',
    '!src/**/*.d.ts',
  ],
};
