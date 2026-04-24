# Umbra ZK proving keys

Bundled with the app via `require('assets/zk/*.zkey')` in `src/umbra/zk/services/zk-asset-service.ts`. Source: <https://zk.api.umbraprivacy.com/manifest.json>.

The two files below are gitignored (binary, ~50 MB total). Fetch them on a fresh clone:

```sh
mkdir -p assets/zk
curl -o assets/zk/userregistration.zkey \
  https://zk.api.umbraprivacy.com/v3/zkey-wasm/userregistration.zkey
curl -o assets/zk/createdepositwithpublicamount.zkey \
  https://zk.api.umbraprivacy.com/v3/zkey-wasm/createdepositwithpublicamount.zkey
```

Other circuits (`createDepositWithConfidentialAmount`, `claimDepositInto*`) are fetched on-demand from the CDN and cached under the app's document directory.

If the manifest version on the CDN changes, the local cache is invalidated automatically — see `validateManifestVersion()` in `src/umbra/zk/services/zk-asset-service.ts`.
