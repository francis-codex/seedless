import type {
  IZkProverForReceiverClaimableUtxo,
  IZkProverForSelfClaimableUtxo,
  ZkProverForReceiverClaimableUtxoFromPublicBalance
} from '@umbra-privacy/sdk/interfaces'
import Zk from '@umbra-privacy/rn-zk-prover'
import { createZkProver } from './prover'
import { getZKey } from '../services/zk-asset-service'

type ZkType = typeof Zk

export function createCreateUtxoWithReceiverUnlockerZkProver(
  zkLib: ZkType = Zk
): IZkProverForReceiverClaimableUtxo {
  return {
    prove: async (inputs: unknown) => {
      const zkeyPath = await getZKey('createDepositWithConfidentialAmount')
      const prover = createZkProver(zkeyPath, zkLib)
      return prover.prove(inputs)
    }
  }
}

export function createCreateUtxoWithEphemeralUnlockerZkProver(
  zkLib: ZkType = Zk
): IZkProverForSelfClaimableUtxo {
  return {
    prove: async (inputs: unknown) => {
      const zkeyPath = await getZKey('createDepositWithConfidentialAmount')
      const prover = createZkProver(zkeyPath, zkLib)
      return prover.prove(inputs)
    }
  }
}

export function createCreateUtxoFromPublicBalanceWithReceiverUnlockerZkProver(
  zkLib: ZkType = Zk
): ZkProverForReceiverClaimableUtxoFromPublicBalance {
  return {
    prove: async (inputs: unknown) => {
      const zkeyPath = await getZKey('createDepositWithPublicAmount')
      const prover = createZkProver(zkeyPath, zkLib)
      return prover.prove(inputs)
    }
  }
}
