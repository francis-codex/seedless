import Zk, { ProofLib } from '@umbra-privacy/rn-zk-prover'
import { convertToMoproInputs } from '../utils/mopro-inputs'
import { convertZkProofToBytes } from '../utils/proof-converter'
import { Groth16ProofBytes } from '../types'

type ZkType = typeof Zk

export interface ZkProver {
  prove: (inputs: unknown) => Promise<Groth16ProofBytes>
}

export function createZkProver(zkeyPath: string, zkLib: ZkType = Zk): ZkProver {
  return {
    prove: async (inputs: unknown) => {
      const path = zkeyPath.replace('file://', '')
      const moproInputs = convertToMoproInputs(
        inputs as Record<string, unknown>
      )

      const proofResult = await zkLib.mopro_umbra_2.generateCircomProof(
        path,
        JSON.stringify(moproInputs),
        ProofLib.Arkworks
      )

      const b = proofResult.proof.b
      const bArray = [
        [b.x[0], b.x[1]],
        [b.y[0], b.y[1]],
        [b.z[0], b.z[1]]
      ] as [[string, string], [string, string], [string, string]]

      return convertZkProofToBytes({
        a: Object.values(proofResult.proof.a),
        b: bArray,
        c: Object.values(proofResult.proof.c)
      })
    }
  }
}
