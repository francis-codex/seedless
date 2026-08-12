# Dependency audit triage

`npm audit` reports a large number of findings for this project. Most of them
cannot reach a user. This document records which ones can, so the number is not
mistaken for the risk.

**Last reviewed:** 12 August 2026, against `package-lock.json` at `d81d212`.

## Summary

| | |
| --- | --- |
| Before the August dependency refresh | 59 findings — 2 critical, 23 high, 32 moderate, 2 low |
| After | **31 findings — 0 critical, 14 high, 17 moderate** |

The refresh was `npm update` only. No semver range in `package.json` was
widened, and no major version was taken.

## The distinction that matters

This is a React Native app. The dependency tree contains two populations that
`npm audit` does not separate:

1. **Build tooling** — Metro, the Expo CLI, Babel, PostCSS, image processing,
   archive handling. This code runs on a developer's machine during a build. It
   is never compiled into the APK or IPA and is not reachable by a user of the
   wallet.
2. **Runtime dependencies** — everything that ends up in the Hermes bundle.

Both remaining "critical"-adjacent findings and the majority of the highs are in
population 1. They are worth fixing on their own schedule, but they are not user
risk, and they should not gate a release.

## What actually ships

Three findings are in code that reaches the bundle.

### `bigint-buffer` — buffer overflow in `toBigIntLE()`

* Path: `@solana/spl-token` → `@solana/buffer-layout-utils` → `bigint-buffer@1.1.5`
* **No fixed version is published.** The advisory has no upstream remedy at time
  of writing, so this cannot be resolved by updating.
* This is the only finding in the tree with a plausible path from attacker-
  influenced input to our users, because it participates in decoding SPL token
  account data, which originates on-chain.
* Reachability has not been proven either way. Treat it as open.

### `ws` — uninitialised memory disclosure

* Path: `@solana/kit` → `@solana/rpc-subscriptions-channel-websocket` → `ws`
* Moved from 8.18/8.20 to **8.21** in the refresh.

### `@solana/spl-token`

* Direct dependency. Moved **0.4.14 → 0.4.15** in the refresh.

## Deliberate pins and deferrals

### `@noble/curves` pinned to `^1.9.7`

Added as a direct dependency on 12 August. It is not used directly anywhere
except `src/ika/client.ts`.

`npm update` floated the hoisted copy from 1.9.7 to 2.3.0. Version 2 is a
breaking API change: `sign()` returns raw bytes rather than an object carrying
`r`, `s` and `recovery`, and `ProjectivePoint` was removed. `src/ika/client.ts`
assembles Ethereum-style 65-byte signatures from exactly those fields and
derives addresses through `ProjectivePoint`, so it stopped compiling.

Pinning restores the resolution the code was written against.
`@ika.xyz/sdk`, `@mysten/sui`, `@scure/bip32` and `@umbra-privacy/sdk` keep
their own nested 2.3.0; `ethers` keeps 1.2.0.

**Open item:** migrate the Ika signing path to the v2 API. It is signature
assembly, so it needs its own change with a test that verifies `r`, `s` and the
recovery byte against known vectors — not a drive-by edit alongside a version
bump.

### Vendored ZK prover tarball

`vendor/umbra-privacy-rn-zk-prover-3.0.1.tgz` is 79.3 MB and is committed to the
repository. It is a hard build dependency — `package.json` installs it via
`file:./vendor/...` — so it cannot simply be removed. GitHub warns on every push
because it exceeds the 50 MB recommendation.

**Open item:** move it to Git LFS or publish it to a private registry.

### Major upgrades not taken

`react-native` 0.81 → 0.87, `expo` 54 → 57, `react` 19.1 → 19.2 and
`babel-preset-expo` 54 → 57 are all available and all deliberately deferred.
Taking them would clear more findings, most of them in build tooling, in
exchange for a cross-cutting upgrade of the native layer. That belongs in its
own cycle with device testing, not in a dependency-hygiene pass.

Note that `@lazorkit/wallet-mobile-adapter` and `@umbra-privacy/sdk` show a
"latest" that is *older* than what is installed — both are intentionally on
prerelease builds. Do not "update" them.

## How to re-run this

```sh
npm audit                 # counts
npm audit --json          # machine-readable, for triage by severity
npm ls <package>          # resolve which path pulls a package in
npx expo export --platform android   # proves the whole graph still bundles
```

`npm audit fix --force` is not appropriate for this project. It takes major
versions across the native layer.
