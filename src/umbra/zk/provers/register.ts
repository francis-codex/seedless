import type {
  IZkProverForUserRegistration,
  UserRegistrationCircuitInputs
} from '@umbra-privacy/sdk/interfaces'
import Zk from '@umbra-privacy/rn-zk-prover'
import { createZkProver } from './prover'
import { getZKey } from '../services/zk-asset-service'

type ZkType = typeof Zk

export async function createUserRegistrationProver(
  zkLib: ZkType = Zk
): Promise<IZkProverForUserRegistration> {
  const zkeyPath = await getZKey('userRegistration')
  return {
    prove: async (inputs: UserRegistrationCircuitInputs) => {
      const prover = createZkProver(zkeyPath, zkLib)
      return prover.prove(inputs)
    }
  }
}
