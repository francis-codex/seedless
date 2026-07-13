// v5 renamed the ATA-into-note prover interface to IZkProverForATAIntoStealthPoolNote
// (@umbra-privacy/sdk/deposit). The two older ETA-unlocker wrappers were dead
// (referenced only in the README, not in any code path) and used v4 interface
// names that no longer exist, so they were dropped in the v5 migration.
import type { IZkProverForATAIntoStealthPoolNote } from '@umbra-privacy/sdk/deposit'
import Zk from '@umbra-privacy/rn-zk-prover'
import { createZkProver } from './prover'
import { getZKey } from '../services/zk-asset-service'

type ZkType = typeof Zk

export function createCreateUtxoFromPublicBalanceWithReceiverUnlockerZkProver(
  zkLib: ZkType = Zk
): IZkProverForATAIntoStealthPoolNote {
  return {
    prove: async (inputs: unknown) => {
      const zkeyPath = await getZKey('createDepositWithPublicAmount')
      const prover = createZkProver(zkeyPath, zkLib)
      return prover.prove(inputs)
    }
  } as IZkProverForATAIntoStealthPoolNote
}
