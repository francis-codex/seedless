# ZK (Zero-Knowledge Proof) Module

Self-contained module for ZK proof generation, zkey asset management, and Groth16 proof conversion used in the Umbra privacy protocol.

## Folder Structure

```
zk/
├── index.ts                        # Barrel export (re-exports everything)
├── types.ts                        # Core types: ZKeyType, Groth16ProofBytes, MoproInputs, manifests
├── constants.ts                    # CDN URLs, directory names, hasVariants helper
├── query.ts                        # React Query hooks: useZKey, useDownloadZKey, useClearZkCache, usePreloadZKeysOnMount
│
├── provers/                        # ZK proof generation
│   ├── index.ts                    # Barrel export for all provers
│   ├── prover.ts                   # Base factory: createZkProver() — wraps @umbra-privacy/rn-zk-prover
│   ├── register.ts                 # createUserRegistrationProver()
│   ├── create-utxos.ts             # createCreateUtxoWithReceiverUnlockerZkProver()
│   │                               # createCreateUtxoWithEphemeralUnlockerZkProver()
│   │                               # createCreateUtxoFromPublicBalanceWithReceiverUnlockerZkProver()
│   └── claims-utxos.ts             # createClaimEphemeralZkProver()
│                                   # createClaimReceiverZkProver()
│
├── services/
│   └── zk-asset-service.ts         # ZKey lifecycle: fetch, download, cache, bundle management
│                                   # Exports: getZKey, downloadZKey, clearZkAssetsCache, isZKeyAvailable, fetchRemoteManifest
│
└── utils/
    ├── proof-converter.ts          # convertZkProofToBytes() — Mopro Groth16 → byte arrays
    └── mopro-inputs.ts             # convertToMoproInputs() — circuit inputs → Mopro string format
```

## External Dependencies

| Package | Purpose |
|---------|---------|
| `@umbra-privacy/rn-zk-prover` | Native ZK proof generation (Mopro/Arkworks) |
| `@umbra-privacy/sdk/types` | Groth16 proof types (`Groth16ProofA/B/C`, `U256`, `U256BeBytes`) |
| `@umbra-privacy/sdk/interfaces` | Prover interfaces (`IZkProverForUserRegistration`, `IZkProverForReceiverClaimableUtxo`, etc.) |
| `expo-file-system` | File I/O for zkey caching (`Directory`, `File`, `Paths`) |
| `expo-asset` | Bundled zkey asset loading |
| `@tanstack/react-query` | Data fetching / caching hooks |
| `react` | Hooks (`useState`, `useEffect`, `useRef`) |

## How It Works

### Prover Flow
1. **Prover factories** (e.g., `createUserRegistrationProver`) call `getZKey()` to resolve the zkey file path
2. **`getZKey()`** checks: local cache → bundled asset → remote CDN download
3. The factory creates a `ZkProver` via `createZkProver(zkeyPath)`, which:
   - Converts circuit inputs to Mopro format (`convertToMoproInputs`)
   - Calls `@umbra-privacy/rn-zk-prover` to generate the Circom proof (Arkworks backend)
   - Converts the Mopro proof output to byte arrays (`convertZkProofToBytes`)

### ZKey Asset Management (`zk-asset-service.ts`)
- **Bundled zkeys**: `userRegistration` and `createDepositWithPublicAmount` are shipped with the app in `assets/zk/`
- **Remote zkeys**: Downloaded from CDN (configurable via `EXPO_PUBLIC_ZK_ASSETS_BASE_URL`)
- **Versioning**: Remote manifest is checked against local manifest; cache is invalidated on version mismatch
- **Variants**: Claim circuits support batch sizes (`n1`, `n2`, `n3`, `n4`)

### ZKey Types
| ZKeyType | Description | Variant? |
|----------|-------------|----------|
| `userRegistration` | Register user in privacy protocol | No |
| `createDepositWithConfidentialAmount` | Create UTXO with hidden amount | No |
| `createDepositWithPublicAmount` | Create UTXO from public balance | No |
| `claimDepositIntoConfidentialAmount` | Claim UTXO into encrypted balance | Yes (n1-n4) |
| `claimDepositIntoPublicAmount` | Claim UTXO into public balance | Yes (n1-n4) |

## Integration

Import from the barrel:
```ts
import {
  createUserRegistrationProver,
  createClaimReceiverZkProver,
  useZKey,
  usePreloadZKeysOnMount
} from './zk'
```

### Environment Variables
- `EXPO_PUBLIC_ZK_ASSETS_BASE_URL` — CDN base URL for remote zkey downloads (defaults to CloudFront)
