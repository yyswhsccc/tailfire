'use client'

/**
 * useUnsavedChangesWarning — prompts the user before they navigate away with
 * dirty form state. Replaces autosave on the activity-editor forms (#306).
 *
 * Scope: browser-level only.
 *   - refresh, tab close, external link, hard URL change → native browser
 *     beforeunload dialog. Browser controls the message (most modern browsers
 *     ignore custom strings and show a stock prompt).
 *
 * In-app navigation (Next.js App Router <Link> clicks, router.push/replace,
 * back/forward buttons) is NOT intercepted here. An earlier draft tried to
 * monkeypatch window.history.pushState / replaceState and intercept popstate
 * with history.go(1) recovery; Codex flagged this as unsafe because App
 * Router uses replaceState for internal state sync (not just navigation),
 * which produced false-positive confirms, and popstate recovery could
 * loop or desync URL state. A proper in-app guard is tracked as a follow-up.
 *
 * For now: each form's Cancel button is the explicit "discard changes"
 * affordance, and clicking a sidebar/breadcrumb link while dirty silently
 * navigates away. The "Unsaved changes" badge in the form header signals
 * the state so the user can choose to click Save first.
 */

import { useEffect } from 'react'

export function useUnsavedChangesWarning(enabled: boolean): void {
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
