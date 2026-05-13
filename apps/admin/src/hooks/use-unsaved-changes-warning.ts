'use client'

/**
 * useUnsavedChangesWarning — prompts the user before they navigate away with
 * dirty form state. Replaces autosave on the activity-editor forms (#306).
 *
 * Covers three nav surfaces:
 *   1. Browser beforeunload — refresh, tab close, typing a new URL, external
 *      link clicks. Native browser dialog (we can't customize the message).
 *   2. Next.js App Router internal nav — patches history.pushState /
 *      replaceState (which router.push, router.replace, and <Link> all call
 *      under the hood). Uses window.confirm() so the message is customizable.
 *   3. Back / forward — popstate intercept; re-pushes if the user cancels.
 *
 * Caveat: relies on overriding global history methods while the hook is active.
 * Only one mount of this hook should be active at a time (one form on screen).
 * If multiple components mount it concurrently, the most-recently-mounted one
 * wins — earlier instances are no-ops until they unmount.
 */

import { useEffect } from 'react'

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave anyway?'

export function useUnsavedChangesWarning(enabled: boolean, message: string = DEFAULT_MESSAGE): void {
  useEffect(() => {
    if (!enabled) return

    // Browser-level — refresh, tab close, external navigation
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Most browsers ignore custom messages here and show their own copy.
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    // Internal SPA nav — patch history methods (router.push/replace and <Link>
    // both ultimately call these). Cache originals so we can restore on cleanup
    // and so re-entrant calls (from a confirmed leave) still work.
    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    window.history.pushState = function patchedPushState(this: History, ...args: Parameters<typeof originalPushState>) {
      // eslint-disable-next-line no-alert
      if (!window.confirm(message)) return
      return originalPushState.apply(this, args)
    } as typeof window.history.pushState

    window.history.replaceState = function patchedReplaceState(this: History, ...args: Parameters<typeof originalReplaceState>) {
      // eslint-disable-next-line no-alert
      if (!window.confirm(message)) return
      return originalReplaceState.apply(this, args)
    } as typeof window.history.replaceState

    // Back / forward — popstate has already changed the URL, so to undo we
    // push the user forward again. This is intentionally re-entrant: the
    // history.go(1) below WON'T fire popstate again because we're not
    // changing the URL via the patched methods.
    const onPopState = () => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(message)) {
        window.history.go(1)
      }
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('popstate', onPopState)
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
    }
  }, [enabled, message])
}
