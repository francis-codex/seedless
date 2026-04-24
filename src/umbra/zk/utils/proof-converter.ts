import {
  Groth16ProofA,
  Groth16ProofB,
  Groth16ProofC,
  U256,
  U256BeBytes
} from '@umbra-privacy/sdk/types'
import { Groth16ProofBytes, MoproGroth16Proof } from '../types'

export function u256ToBeBytes(value: U256): U256BeBytes {
  const buffer = new ArrayBuffer(32)
  const view = new DataView(buffer)
  const val = value as bigint
  // Write as four 64-bit big-endian values (highest word first)
  view.setBigUint64(0, (val >> 192n) & 0xffffffffffffffffn, false)
  view.setBigUint64(8, (val >> 128n) & 0xffffffffffffffffn, false)
  view.setBigUint64(16, (val >> 64n) & 0xffffffffffffffffn, false)
  view.setBigUint64(24, val & 0xffffffffffffffffn, false)
  return new Uint8Array(buffer) as U256BeBytes
}

export function convertZkProofToBytes(
  proof: MoproGroth16Proof
): Readonly<Groth16ProofBytes> {
  const { a, b, c } = proof

  if (!Array.isArray(a) || a.length !== 3) {
    throw new Error('Groth16 proof `pi_a` must be an array of length 3')
  }
  if (
    !Array.isArray(b) ||
    b.length !== 3 ||
    !Array.isArray(b[0]) ||
    !Array.isArray(b[1])
  ) {
    throw new Error(
      'Groth16 proof `pi_b` must be a 3x2 array: [[Bax, Bay], [Bbx, Bby]]'
    )
  }
  if (!Array.isArray(c) || c.length !== 3) {
    throw new Error('Groth16 proof `pi_c` must be an array of length 3')
  }

  try {
    const aBytes = a
      .slice(0, 2)
      .map((x: string) => u256ToBeBytes(BigInt(x) as U256))

    const bBytes = (b.slice(0, 2) as [[string, string], [string, string]]).map(
      (x: [string, string]) => {
        const bax = u256ToBeBytes(BigInt(x[0]!) as U256)
        const bay = u256ToBeBytes(BigInt(x[1]!) as U256)
        return [bax, bay] as const
      }
    )

    const cBytes = c
      .slice(0, 2)
      .map((x: string) => u256ToBeBytes(BigInt(x) as U256))

    // A: [Ax || Ay]
    const aFlattened = new Uint8Array([
      ...Array.from(aBytes[0]!),
      ...Array.from(aBytes[1]!)
    ])

    // B: [Bay || Bax || Bby || Bbx] (note the ordering)
    const bFlattened = new Uint8Array([
      ...Array.from(bBytes[0]![1]!),
      ...Array.from(bBytes[0]![0]!),
      ...Array.from(bBytes[1]![1]!),
      ...Array.from(bBytes[1]![0]!)
    ])

    // C: [Cx || Cy]
    const cFlattened = new Uint8Array([
      ...Array.from(cBytes[0]!),
      ...Array.from(cBytes[1]!)
    ])

    return {
      proofA: aFlattened as Groth16ProofA,
      proofB: bFlattened as Groth16ProofB,
      proofC: cFlattened as Groth16ProofC
    }
  } catch (error) {
    throw new Error(
      `Failed to convert Groth16 proof coordinates to bytes: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
