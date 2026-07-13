import type {
  ClaimBatchSize,
  ClaimReceiverClaimableUtxoIntoEncryptedBalanceCircuitInputs,
  IZkProverForClaimSelfClaimableUtxoIntoPublicBalance,
  IZkProverForClaimReceiverClaimableUtxoIntoEncryptedBalance
} from '@umbra-privacy/sdk/shared'
import Zk from '@umbra-privacy/rn-zk-prover'
import { createZkProver } from './prover'
import { getZKey } from '../services/zk-asset-service'
import type { ClaimVariant } from '../types'

type ZkType = typeof Zk

export function createClaimEphemeralZkProver(
  zkLib: ZkType = Zk
): IZkProverForClaimSelfClaimableUtxoIntoPublicBalance {
  return {
    maxUtxoCapacity: 1,
    prove: async (inputs: unknown) => {
      const zkeyPath = await getZKey('claimDepositIntoPublicAmount','n1')
      const prover = createZkProver(zkeyPath, zkLib)
      return prover.prove(inputs)
    }
  }
}

export function createClaimReceiverZkProver(
  zkLib: ZkType = Zk
): IZkProverForClaimReceiverClaimableUtxoIntoEncryptedBalance {
  return {
    prove: async (
      inputs: ClaimReceiverClaimableUtxoIntoEncryptedBalanceCircuitInputs,
      nLeaves: ClaimBatchSize = 1
    ) => {
      // v5 widened ClaimBatchSize to 1..5, but we only ship the n1..n4 circuit
      // assets. Fail safe on a 5-leaf batch rather than requesting a zkey that
      // doesn't exist. (Revisit once the n5 claim circuit asset is provisioned.)
      if (nLeaves < 1 || nLeaves > 4) {
        throw new Error(
          `Unsupported claim batch size ${nLeaves} — only n1..n4 circuits are provisioned (n5 pending).`,
        )
      }
      const zkeyPath = await getZKey(
        'claimDepositIntoConfidentialAmount',
        `n${nLeaves}` as ClaimVariant,
      )
      const prover = createZkProver(zkeyPath, zkLib)
      return prover.prove(inputs)
    }
  }
}
