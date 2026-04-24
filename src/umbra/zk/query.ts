import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getZKey,
  downloadZKey,
  clearZkAssetsCache
} from './services/zk-asset-service'
import { type ZKeyType, type ClaimVariant } from './types'
import { useEffect, useRef } from 'react'

export const zkQueryKeys = {
  all: ['zk-assets'] as const,
  zkey: (type: ZKeyType, variant?: ClaimVariant) =>
    [...zkQueryKeys.all, 'zkey', type, ...(variant ? [variant] : [])] as const
}

export function useZKey(type: ZKeyType, variant?: ClaimVariant, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: zkQueryKeys.zkey(type, variant),
    queryFn: () => getZKey(type, variant),
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: options?.enabled !== false,
    retry: 2
  })
}

export function useDownloadZKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ type, variant }: { type: ZKeyType; variant?: ClaimVariant }) => {
      return downloadZKey(type, variant)
    },
    onSuccess: (path, { type, variant }) => {
      queryClient.setQueryData(zkQueryKeys.zkey(type, variant), path)
    }
  })
}

export function useClearZkCache() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: clearZkAssetsCache,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: zkQueryKeys.all })
  })
}


const PRELOAD_KEYS: { type: ZKeyType; variant?: ClaimVariant }[] = [
  { type: 'userRegistration' },
  { type: 'createDepositWithConfidentialAmount' },
  { type: 'createDepositWithPublicAmount' },
  { type: 'claimDepositIntoConfidentialAmount', variant: 'n1' },
  { type: 'claimDepositIntoPublicAmount', variant: 'n1' }
]

export function usePreloadZKeysOnMount() {
  const queryClient = useQueryClient()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    for (const { type, variant } of PRELOAD_KEYS) {
      queryClient.prefetchQuery({
        queryKey: zkQueryKeys.zkey(type, variant),
        queryFn: () => getZKey(type, variant),
        staleTime: Infinity
      })
    }
  }, [queryClient])
}
