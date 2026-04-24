import type {
  ClaimBatchSize,
  ClaimReceiverClaimableUtxoIntoEncryptedBalanceCircuitInputs,
  IZkProverForClaimSelfClaimableUtxoIntoPublicBalance,
  IZkProverForClaimReceiverClaimableUtxoIntoEncryptedBalance
} from '@umbra-privacy/sdk/interfaces'
import Zk from '@umbra-privacy/rn-zk-prover'
import { createZkProver } from './prover'
import { getZKey } from '../services/zk-asset-service'

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
      if (nLeaves < 1 || nLeaves > 16) {
        throw new Error('Invalid number of leaves')
      }
      const zkeyPath = await getZKey(
        'claimDepositIntoConfidentialAmount',
        `n${nLeaves}`
      )
      const prover = createZkProver(zkeyPath, zkLib)
      return prover.prove(inputs)
    }
  }
}
