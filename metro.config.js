const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Register .zkey as a binary asset so require('assets/zk/*.zkey') resolves.
// Used by @umbra-privacy/rn-zk-prover via src/umbra/zk/services/zk-asset-service.ts.
config.resolver.assetExts.push('zkey');

// @umbra-privacy/sdk's root barrel imports snarkjs, its web/node proving
// backend. We prove natively through @umbra-privacy/rn-zk-prover instead, and
// snarkjs needs node builtins that do not exist here. The stub throws if it is
// ever actually reached — see src/polyfills/snarkjs-stub.js.
const snarkjsStub = require.resolve('./src/polyfills/snarkjs-stub.js');
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'snarkjs') {
    return { type: 'sourceFile', filePath: snarkjsStub };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
