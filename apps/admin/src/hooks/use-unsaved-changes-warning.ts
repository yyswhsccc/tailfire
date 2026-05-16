'use client'

/**
 * useUnsavedChangesWarning — registers the current form's dirty state with
 * the DirtyGuardProvider so <GuardedLink> and useGuardedRouter can prompt
 * before navigating away.
 *
 * The hook used to also install a `window.beforeunload` listener for hard
 * navigations (refresh, tab close, external URL). That layer was removed:
 * `beforeunload` is the only browser-controlled dialog that cannot be
 * skinned with the rest of the admin's UI, and post-#439 e2e showed it
 * firing spuriously after a successful save when the form's `isDirty`
 * hadn't yet flipped back to false. The user policy is: no browser-default
 * dialogs anywhere. Hard navigations now silently lose unsaved changes —
 * the in-app guard still catches in-app navigation, which is the common path.
 *
 * Forms call this once with their RHF isDirty value:
 *
 *   const { formState: { isDirty } } = form
 *   useUnsavedChangesWarning(isDirty)
 */

import { useRegisterDirtyGuard } from '@/lib/dirty-guard'

export function useUnsavedChangesWarning(enabled: boolean): void {
  useRegisterDirtyGuard(() => enabled)
}
