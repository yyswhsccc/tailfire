/**
 * In-app navigation guard for forms with unsaved changes.
 *
 * Pattern (per Codex review of PR #312):
 *   - Forms register a getter via useRegisterDirtyGuard.
 *   - Navigation surfaces opt in by using <GuardedLink> or useGuardedRouter.
 *   - Anything not using these primitives navigates silently — accepted
 *     trade-off for not having to override Next.js internals.
 *
 * Combined with the browser-level beforeunload warning in
 * useUnsavedChangesGuard, this covers the common navigation-loss paths
 * without coupling to App Router implementation details.
 */

export { DirtyGuardProvider, useRegisterDirtyGuard, useDirtyGuard } from './dirty-guard-provider'
export { GuardedLink } from './guarded-link'
export { useGuardedRouter } from './use-guarded-router'
