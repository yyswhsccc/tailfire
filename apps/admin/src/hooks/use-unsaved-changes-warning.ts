'use client'

/**
 * useUnsavedChangesWarning — warns the user before they navigate away with
 * dirty form state. Two layers, both opt-in via this single hook call:
 *
 *   1. Browser beforeunload (refresh, tab close, hard URL change, external
 *      link) — native dialog. Browser controls the message (modern browsers
 *      ignore custom strings and show stock copy).
 *
 *   2. In-app navigation — registers with the DirtyGuardProvider so
 *      <GuardedLink> and useGuardedRouter prompt before navigating. This is
 *      the #313 follow-up to #306; #306 deliberately scoped out in-app nav
 *      after Codex flagged the original history-monkeypatch approach as
 *      unsafe coupling to App Router internals.
 *
 * The in-app guard only catches navigation that goes through GuardedLink /
 * useGuardedRouter. Bare <Link>s and raw useRouter() calls navigate silently
 * — Codex's recommendation: that's the deliberate trade-off for safety.
 *
 * Forms call this once with their RHF isDirty value:
 *
 *   const { formState: { isDirty } } = form
 *   useUnsavedChangesWarning(isDirty)
 */

import { useEffect } from 'react'
import { useRegisterDirtyGuard } from '@/lib/dirty-guard'

export function useUnsavedChangesWarning(enabled: boolean): void {
  // In-app guard: register a getter so the LATEST `enabled` is consulted
  // at click time, not at registration time.
  useRegisterDirtyGuard(() => enabled)

  // Browser-level guard
  useEffect(() => {
    if (!enabled) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Modern browsers ignore custom messages here and show stock copy.
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [enabled])
}
