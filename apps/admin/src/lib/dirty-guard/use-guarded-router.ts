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
 *
 * The guard now resolves asynchronously because the confirmation UI is a
 * shadcn AlertDialog rather than a blocking `window.confirm`. Callers that
 * relied on the previous synchronous boolean return continue to work — we
 * just fire-and-forget the navigation once the user confirms. The router's
 * own return type stays void either way.
 */

import { useRouter as useRawRouter } from 'next/navigation'
import { useMemo } from 'react'
import { useDirtyGuard } from './dirty-guard-provider'

type RawRouter = ReturnType<typeof useRawRouter>

export function useGuardedRouter(): RawRouter {
  const router = useRawRouter()
  const { isDirtyNow, confirmIfDirty } = useDirtyGuard()

  return useMemo<RawRouter>(
    () => ({
      ...router,
      push: (...args: Parameters<RawRouter['push']>) => {
        if (!isDirtyNow()) {
          router.push(...args)
          return
        }
        void confirmIfDirty().then((ok) => {
          if (ok) router.push(...args)
        })
      },
      replace: (...args: Parameters<RawRouter['replace']>) => {
        if (!isDirtyNow()) {
          router.replace(...args)
          return
        }
        void confirmIfDirty().then((ok) => {
          if (ok) router.replace(...args)
        })
      },
      back: () => {
        if (!isDirtyNow()) {
          router.back()
          return
        }
        void confirmIfDirty().then((ok) => {
          if (ok) router.back()
        })
      },
      forward: () => {
        if (!isDirtyNow()) {
          router.forward()
          return
        }
        void confirmIfDirty().then((ok) => {
          if (ok) router.forward()
        })
      },
      // prefetch and refresh don't navigate visibly; leave them un-guarded.
      prefetch: router.prefetch,
      refresh: router.refresh,
    }),
    [router, isDirtyNow, confirmIfDirty],
  )
}
