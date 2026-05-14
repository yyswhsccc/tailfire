'use client'

/**
 * useGuardedRouter — wraps next/navigation's useRouter() so that push,
 * replace, back, and forward prompt the user when a registered form is dirty.
 *
 * Use this anywhere an imperative navigation might bypass a <GuardedLink>:
 * dropdown menu items, programmatic redirects after a button click, etc.
 *
 * Forms that want to skip the guard (e.g. their own Cancel button — Cancel
 * IS the discard affordance) should keep using the bare useRouter().
 */

import { useRouter as useRawRouter } from 'next/navigation'
import { useMemo } from 'react'
import { useDirtyGuard } from './dirty-guard-provider'

type RawRouter = ReturnType<typeof useRawRouter>

export function useGuardedRouter(): RawRouter {
  const router = useRawRouter()
  const { confirmIfDirty } = useDirtyGuard()

  return useMemo<RawRouter>(
    () => ({
      ...router,
      push: (...args: Parameters<RawRouter['push']>) => {
        if (!confirmIfDirty()) return
        router.push(...args)
      },
      replace: (...args: Parameters<RawRouter['replace']>) => {
        if (!confirmIfDirty()) return
        router.replace(...args)
      },
      back: () => {
        if (!confirmIfDirty()) return
        router.back()
      },
      forward: () => {
        if (!confirmIfDirty()) return
        router.forward()
      },
      // prefetch and refresh don't navigate visibly; leave them un-guarded.
      prefetch: router.prefetch,
      refresh: router.refresh,
    }),
    [router, confirmIfDirty],
  )
}
