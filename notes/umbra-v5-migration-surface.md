# umbra v5 migration — surface assessment

assessed `@umbra-privacy/sdk@5.0.0-rc.6` against the current v4.0.0 integration before pulling. capturing this so the weekend migration session starts with a real map, not from cold.

## what moved

### subpath exports collapsed
v4 exposed multiple subpaths the codebase imports from. v5 collapses everything behind the single package entry.

- `@umbra-privacy/sdk/interfaces` → gone, types live on `@umbra-privacy/sdk`
- `@umbra-privacy/sdk/types` → gone
- `@umbra-privacy/sdk/utils` → gone

every `from '@umbra-privacy/sdk/<subpath>'` in `src/umbra/*` and `src/hooks/usePrivateMode.ts` needs to flatten to the root import.

### renamed function exports
v4 names that no longer exist on v5 root:

- `getUserRegistrationFunction` (used in `burner-bridge.ts`, `registration.ts`)
- `getPublicBalanceToEncryptedBalanceDirectDepositorFunction` (`deposit.ts`)
- `getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction` (`withdraw.ts`)
- `getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction` (`claim.ts`)
- `getEncryptedBalanceQuerierFunction` (`private-balance.ts`)
- `getClaimableUtxoScannerFunction` (`utxo.ts`)
- `getPublicBalanceToReceiverClaimableUtxoCreatorFunction` (`utxo.ts`)
- `getUserAccountQuerierFunction` (`utxo.ts`)
- `GetUmbraClientArgs`, `GetUmbraClientDeps` types (`client.ts`)

new names need to be sourced from cal or the v5 README. typescript suggests `getUmbraClient` is the new entrypoint.

### new transitive deps
v5 pulls `@solana/kit@^6.0.1` (used internally — not consumed directly by app code) and a new sibling package `@umbra-privacy/arcium-codama@2.0.1`.

### umbra-codama
sibling package jumps `^2.0.2` → `3.0.0-rc.6`. peer warning surfaces around `@solana-program/token-2022@^0.9.0`. need to verify our token-2022 path still composes.

## affected files

17 files in `src/` touch umbra surface. typecheck after the v5 install reported ~37 errors concentrated in:

- `src/umbra/burner-bridge.ts`
- `src/umbra/claim.ts`
- `src/umbra/client.ts`
- `src/umbra/deposit.ts`
- `src/umbra/private-balance.ts`
- `src/umbra/private-send-from-main.ts`
- `src/umbra/registration.ts`
- `src/umbra/relayer.ts`
- `src/umbra/utxo.ts`
- `src/umbra/withdraw.ts`
- `src/umbra/zk/provers/{claims-utxos,create-utxos,register}.ts`
- `src/hooks/usePrivateMode.ts`

minor: `claims-utxos.ts` will need a tighter `ClaimBatchSize` union (v5 narrows it to `'n1' | 'n2' | 'n3' | 'n4'`).

## migration plan

1. pull cal's v5 migration notes / changelog
2. flatten all subpath imports to root in one pass
3. update each renamed function call site
4. resolve `arcium-codama` integration
5. devnet soak min 24hr per F3 of [[junestrike_lockin_plan_jun12]]
6. mainnet flip only after cal greenlight on a smoke run

## why this is deferred

attempted install on the night of jun 15 went clean (10 packages added, 2 removed, no peer conflict beyond the token-2022 warning). typecheck surface revealed the rename + subpath load above. doing the migration under the same-night APK clock risks breaking the live mainnet beta. cleaner to land this in a dedicated weekend session with cal in the loop and a real devnet soak window.

rolled back to v4.0.0 / codama 2.0.2 for tonight's tester APK rebuild.
