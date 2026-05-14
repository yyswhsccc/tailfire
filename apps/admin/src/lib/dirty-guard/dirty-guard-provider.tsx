'use client'

/**
 * DirtyGuard — in-app navigation guard for forms with unsaved changes.
 *
 * Replaces the global history-monkeypatching approach that Codex flagged as
 * unsafe (PR #312). Instead of trapping every history.pushState call, this is
 * an opt-in pattern:
 *
 *   1. The page/form registers a "is anything dirty right now?" function via
 *      useRegisterDirtyGuard(() => isDirty).
 *   2. Components that want to be guarded (e.g. <GuardedLink>, useGuardedRouter)
 *      call useDirtyGuard() and check before navigating.
 *
 * Anything that doesn't use those primitives navigates silently — that's the
 * deliberate trade-off for not having to override Next.js internals.
 *
 * Registry semantics: only the most-recently-registered checker is consulted.
 * In practice only one activity form is mounted at a time, so this is fine.
 * If multiple forms ever co-mount, we'd want a stack or composite OR; for now
 * the single-current model matches the actual usage.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type DirtyChecker = () => boolean

interface DirtyGuardContextValue {
  /** Register a function that returns true when the current page has unsaved changes. */
  register: (checker: DirtyChecker) => void
  /** Unregister a previously-registered checker. */
  unregister: (checker: DirtyChecker) => void
  /**
   * Check whether any registered form is currently dirty, and if so, prompt
   * the user to confirm. Returns true if it's safe to proceed (not dirty, or
   * user confirmed). False if user cancelled.
   */
  confirmIfDirty: (message?: string) => boolean
}

const DirtyGuardContext = createContext<DirtyGuardContextValue | null>(null)

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave anyway?'

export function DirtyGuardProvider({ children }: { children: ReactNode }) {
  // Most-recently-registered checker wins. Stored in a ref so we don't
  // re-render the entire tree on every register/unregister.
  const checkerRef = useRef<DirtyChecker | null>(null)
  // A counter on state so consumers that want to react to dirty changes can
  // (currently unused; kept for future "show a header indicator" use).
  const [, setRegistryTick] = useState(0)

  const register = useCallback((checker: DirtyChecker) => {
    checkerRef.current = checker
    setRegistryTick((t) => t + 1)
  }, [])

  const unregister = useCallback((checker: DirtyChecker) => {
    if (checkerRef.current === checker) {
      checkerRef.current = null
      setRegistryTick((t) => t + 1)
    }
  }, [])

  const confirmIfDirty = useCallback((message: string = DEFAULT_MESSAGE): boolean => {
    const checker = checkerRef.current
    if (!checker) return true
    let isDirty = false
    try {
      isDirty = checker()
    } catch {
      // If the checker throws, treat as not dirty — better to let nav
      // happen than to block the user behind a buggy checker.
      return true
    }
    if (!isDirty) return true
    // eslint-disable-next-line no-alert
    return window.confirm(message)
  }, [])

  const value: DirtyGuardContextValue = {
    register,
    unregister,
    confirmIfDirty,
  }

  return <DirtyGuardContext.Provider value={value}>{children}</DirtyGuardContext.Provider>
}

/**
 * Register the current page's dirty state with the guard. Pass a getter so the
 * latest isDirty is consulted at click time, not at registration time.
 *
 * Example:
 *   const { formState: { isDirty } } = form
 *   useRegisterDirtyGuard(() => isDirty)
 */
export function useRegisterDirtyGuard(getIsDirty: () => boolean): void {
  const ctx = useContext(DirtyGuardContext)
  // Stable reference to the latest checker without re-registering on every
  // isDirty change.
  const checkerRef = useRef(getIsDirty)
  checkerRef.current = getIsDirty

  useEffect(() => {
    if (!ctx) return
    const wrapper: DirtyChecker = () => checkerRef.current()
    ctx.register(wrapper)
    return () => ctx.unregister(wrapper)
  }, [ctx])
}

/**
 * Read the guard. Used by GuardedLink and useGuardedRouter.
 * Returns a no-op when called outside the provider (so it's safe to use
 * primitives in places that might not be wrapped, e.g. the root login page).
 */
export function useDirtyGuard(): DirtyGuardContextValue {
  const ctx = useContext(DirtyGuardContext)
  if (ctx) return ctx
  return {
    register: () => undefined,
    unregister: () => undefined,
    confirmIfDirty: () => true,
  }
}
