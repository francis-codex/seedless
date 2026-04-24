import type { MoproInputs } from '../types'

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v) =>
      Array.isArray(v) ? toStringArray(v) : [String(v.toString())]
    )
  }
  return [String((value as { toString(): string }).toString())]
}

export function convertToMoproInputs(
  inputs: Record<string, unknown>
): MoproInputs {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [key, toStringArray(value)])
  )
}
