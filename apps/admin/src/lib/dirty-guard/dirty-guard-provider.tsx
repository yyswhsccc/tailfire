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
 *
 * Prompt UI: the provider renders a shadcn AlertDialog rather than calling
 * `window.confirm`, so the prompt matches the rest of the admin's look and
 * feel and isn't a stock OS modal. Callers `await confirmIfDirty()` and act
 * on the returned boolean.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type DirtyChecker = () => boolean

interface DirtyGuardContextValue {
  /** Register a function that returns true when the current page has unsaved changes. */
  register: (checker: DirtyChecker) => void
  /** Unregister a previously-registered checker. */
  unregister: (checker: DirtyChecker) => void
  /**
   * Synchronous check used by navigation primitives to decide whether they
   * need to preventDefault and prompt at all. No UI side-effect.
   */
  isDirtyNow: () => boolean
  /**
   * Check whether any registered form is currently dirty, and if so, show
   * the native shadcn AlertDialog. Resolves true if it's safe to proceed
   * (not dirty, or user clicked "Leave"). Resolves false if the user
   * cancelled or dismissed.
   */
  confirmIfDirty: (message?: string) => Promise<boolean>
}

const DirtyGuardContext = createContext<DirtyGuardContextValue | null>(null)

const DEFAULT_MESSAGE = 'You have unsaved changes. Leave anyway?'

export function DirtyGuardProvider({ children }: { children: ReactNode }) {
  // Most-recently-registered checker wins. Stored in a ref so we don't
  // re-render the entire tree on every register/unregister.
  const checkerRef = useRef<DirtyChecker | null>(null)
  // Pending decision resolver — set when the dialog opens, consumed when
  // the user clicks Leave/Stay or dismisses.
  const resolverRef = useRef<((ok: boolean) => void) | null>(null)

  const [dialog, setDialog] = useState<{ open: boolean; message: string }>({
    open: false,
    message: DEFAULT_MESSAGE,
  })

  const register = useCallback((checker: DirtyChecker) => {
    checkerRef.current = checker
  }, [])

  const unregister = useCallback((checker: DirtyChecker) => {
    if (checkerRef.current === checker) {
      checkerRef.current = null
    }
  }, [])

  const isDirtyNow = useCallback((): boolean => {
    const checker = checkerRef.current
    if (!checker) return false
    try {
      return checker()
    } catch {
      // If the checker throws, treat as not dirty — better to let nav
      // happen than to block the user behind a buggy checker.
      return false
    }
  }, [])

  const confirmIfDirty = useCallback(
    (message: string = DEFAULT_MESSAGE): Promise<boolean> => {
      if (!isDirtyNow()) return Promise.resolve(true)
      // If a previous decision is somehow still pending, resolve it as
      // cancelled before starting a new one — prevents leaks.
      if (resolverRef.current) {
        resolverRef.current(false)
        resolverRef.current = null
      }
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve
        setDialog({ open: true, message })
      })
    },
    [isDirtyNow],
  )

  const resolve = useCallback((ok: boolean) => {
    const r = resolverRef.current
    resolverRef.current = null
    setDialog((d) => ({ ...d, open: false }))
    r?.(ok)
  }, [])

  // Memoize the context value so consumers that depend on `ctx` in their
  // useEffect deps don't see a fresh object every provider render. Without
  // useMemo, useRegisterDirtyGuard's effect would re-fire forever and the
  // form page would die with React error #185 (infinite update loop) —
  // exactly what #334 was reporting.
  const value = useMemo<DirtyGuardContextValue>(
    () => ({ register, unregister, isDirtyNow, confirmIfDirty }),
    [register, unregister, isDirtyNow, confirmIfDirty],
  )

  return (
    <DirtyGuardContext.Provider value={value}>
      {children}
      <AlertDialog
        open={dialog.open}
        onOpenChange={(next) => {
          // Closing via overlay click or Esc resolves as cancel.
          if (!next) resolve(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>{dialog.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolve(false)}>Stay on page</AlertDialogCancel>
            <AlertDialogAction onClick={() => resolve(true)}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DirtyGuardContext.Provider>
  )
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
    isDirtyNow: () => false,
    confirmIfDirty: () => Promise.resolve(true),
  }
}
