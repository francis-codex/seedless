import {
  type Groth16ProofA,
  type Groth16ProofB,
  type Groth16ProofC
} from '@umbra-privacy/sdk/types'

export type ZKeyType =
  | 'userRegistration'
  | 'createDepositWithConfidentialAmount'
  | 'createDepositWithPublicAmount'
  | 'claimDepositIntoConfidentialAmount'
  | 'claimDepositIntoPublicAmount'

export type ClaimVariant = `n${1 | 2 | 3 | 4}`

export interface AssetEntry {
  url: string
  version: string
}

export interface ZkAssetManifest {
  version: string
  assets: {
    [key in ZKeyType]?: AssetEntry | Record<string, AssetEntry>
  }
}

export interface LocalZkManifest {
  manifestVersion: string
  downloadedAt: number
  assets: Record<string, { version: string; localPath: string }>
}

export type MoproInputs = Record<string, string[]>

export interface MoproGroth16Proof {
  a: readonly string[]
  b: readonly [[string, string], [string, string], [string, string]]
  c: readonly string[]
}

export interface Groth16ProofBytes {
  proofA: Groth16ProofA
  proofB: Groth16ProofB
  proofC: Groth16ProofC
}

export type {
  Groth16ProofA,
  Groth16ProofB,
  Groth16ProofC
} from '@umbra-privacy/sdk/types'
