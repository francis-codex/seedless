const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Register .zkey as a binary asset so require('assets/zk/*.zkey') resolves.
// Used by @umbra-privacy/rn-zk-prover via src/umbra/zk/services/zk-asset-service.ts.
config.resolver.assetExts.push('zkey');

module.exports = config;
