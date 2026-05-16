/**
 * useActivityFormLifecycle — Step 2 of the refactor roadmap (#358).
 *
 * Owns the orchestration shared across all activity edit forms
 * (flight/dining/lodging/tour/options/custom-cruise/port-info/package):
 *
 *   - activityId / activityPricingId state
 *   - hydration: when API data arrives, `reset()` the form from a mapper
 *   - save: handleSubmit → toPayload → create-or-update → assign ids → clear dirty
 *   - bookingDate / isBooked state
 *   - success overlay state
 *   - cache invalidation surface (`invalidateActivitySurface`)
 *   - unsaved-changes warning
 *
 * Caller still owns:
 *   - the `useForm()` schema + setup
 *   - field-specific UI and per-field validation logic
 *   - the `hydrate` and `toPayload` mappers (passed as callbacks)
 *
 * Pilot: flight-form only. Other forms migrate in follow-up PRs as the
 * pattern proves itself.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { useUnsavedChangesWarning } from './use-unsaved-changes-warning'

export type ActivitySaveResponse = {
  id: string
  activityPricingId?: string | null
}

export type ActivityType =
  | 'flight'
  | 'lodging'
  | 'dining'
  | 'tour'
  | 'transportation'
  | 'options'
  | 'custom_cruise'
  | 'port_info'
  | 'package'

export interface UseActivityFormLifecycleOptions<
  TFormData extends FieldValues,
  TApiData,
  TPayload,
> {
  activityType: ActivityType
  tripId: string

  /**
   * Initial activity id when editing; null on new. Used only in
   * UNCONTROLLED mode (when `activityId` prop is omitted). Ignored when
   * the caller passes `activityId` as a controlled prop.
   */
  initialActivityId?: string | null
  initialActivityPricingId?: string | null
  initialIsBooked?: boolean
  initialBookingDate?: string | null

  /**
   * CONTROLLED activity id. When provided, the hook treats activityId as
   * caller-owned state — useful for forms where the URL drives the
   * current activity (sidebar navigation between activities of the same
   * type). The hook calls `onActivityIdChange` when an internal action
   * (e.g. successful create) needs to update the id; caller MUST wire
   * that callback to its own setState.
   *
   * If omitted, the hook owns activityId internally (uncontrolled mode).
   * Mixing modes per-render is not supported.
   *
   * Pattern from flight-form (#365): URL-sync useEffect → caller setState
   * → controlled prop change → hook re-renders with new id.
   */
  activityId?: string | null
  onActivityIdChange?: (id: string | null) => void

  /** CONTROLLED activity pricing id. Same controlled-or-uncontrolled rules as activityId. */
  activityPricingId?: string | null
  onActivityPricingIdChange?: (id: string | null) => void

  /** Caller's RHF form instance */
  form: UseFormReturn<TFormData>

  /** Latest API data from the caller's loader (e.g. useFlight, useLodging) */
  apiData: TApiData | null | undefined

  /**
   * Optional explicit hydration key. When provided, the hook re-hydrates
   * only on key change — not on object-identity change. Useful when
   * React Query refetches return a new object reference for the same
   * logical data (would otherwise clobber the user's dirty edits).
   *
   * Default: when omitted, hook falls back to apiData identity comparison.
   * Recommended: pass `apiData?.updatedAt` or `apiData?.id`.
   */
  hydrationKey?: string | number | null

  /** Build the form values to reset() from API data. Called on every apiData change. */
  hydrate: (apiData: TApiData) => Partial<TFormData>

  /** Build the API payload from current form values. */
  toPayload: (formData: TFormData) => TPayload

  /** Caller's mutation create function */
  create: (payload: TPayload) => Promise<ActivitySaveResponse>

  /** Caller's mutation update function */
  update: (id: string, payload: TPayload) => Promise<ActivitySaveResponse>

  /** Optional hook for caller-side cleanup on save success */
  onSaveSuccess?: (response: ActivitySaveResponse) => void

  /** Optional hook for caller-side cleanup on save failure */
  onSaveError?: (err: unknown) => void
}

export interface UseActivityFormLifecycleReturn {
  activityId: string | null
  activityPricingId: string | null
  isBooked: boolean
  bookingDate: string | null
  showSuccess: boolean
  isSaving: boolean

  setShowSuccess: (v: boolean) => void
  setBookingState: (booked: boolean, date?: string | null) => void

  /** Triggers RHF validation + create-or-update + dirty reset + success overlay. */
  save: () => Promise<void>

  /**
   * Invalidates the query keys that depend on activity/booking surface data.
   * Call after booking state changes or other cross-form mutations.
   */
  invalidateActivitySurface: () => void
}

export function useActivityFormLifecycle<
  TFormData extends FieldValues,
  TApiData,
  TPayload,
>(
  opts: UseActivityFormLifecycleOptions<TFormData, TApiData, TPayload>,
): UseActivityFormLifecycleReturn {
  const {
    form,
    apiData,
    hydrationKey,
    hydrate,
    toPayload,
    create,
    update,
    onSaveSuccess,
    onSaveError,
    initialActivityId = null,
    initialActivityPricingId = null,
    initialIsBooked = false,
    initialBookingDate = null,
    activityId: controlledActivityId,
    onActivityIdChange,
    activityPricingId: controlledActivityPricingId,
    onActivityPricingIdChange,
  } = opts

  // Controlled-or-uncontrolled state for activityId / activityPricingId.
  // Caller decides at mount time by passing (or omitting) the controlled
  // prop. Switching modes mid-life is not supported.
  const activityIdIsControlled = controlledActivityId !== undefined
  const activityPricingIdIsControlled = controlledActivityPricingId !== undefined

  const [internalActivityId, setInternalActivityId] = useState<string | null>(
    initialActivityId,
  )
  const [internalActivityPricingId, setInternalActivityPricingId] = useState<string | null>(
    initialActivityPricingId,
  )

  const activityId = activityIdIsControlled
    ? (controlledActivityId ?? null)
    : internalActivityId
  const activityPricingId = activityPricingIdIsControlled
    ? (controlledActivityPricingId ?? null)
    : internalActivityPricingId

  const setActivityId = useCallback(
    (id: string | null) => {
      if (activityIdIsControlled) {
        onActivityIdChange?.(id)
      } else {
        setInternalActivityId(id)
      }
    },
    [activityIdIsControlled, onActivityIdChange],
  )

  const setActivityPricingId = useCallback(
    (id: string | null) => {
      if (activityPricingIdIsControlled) {
        onActivityPricingIdChange?.(id)
      } else {
        setInternalActivityPricingId(id)
      }
    },
    [activityPricingIdIsControlled, onActivityPricingIdChange],
  )

  const [isBooked, setIsBooked] = useState<boolean>(initialIsBooked)
  const [bookingDate, setBookingDate] = useState<string | null>(initialBookingDate)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const queryClient = useQueryClient()
  const { isDirty } = form.formState
  useUnsavedChangesWarning(isDirty)

  // Track the hydration "version" we last applied. Prefers an explicit
  // hydrationKey (resilient to React Query refetch identity changes); falls
  // back to apiData object identity for callers that don't pass one.
  type HydrationToken = string | number | TApiData | null
  const lastHydratedRef = useRef<HydrationToken>(null)

  // Hydration effect — when fresh API data arrives, reset() the form.
  // Uses queueMicrotask to defer the reset outside React's render cycle,
  // matching the pattern in flight-form (prevents reset-during-render warnings).
  useEffect(() => {
    if (!apiData) return
    const token: HydrationToken =
      hydrationKey !== undefined && hydrationKey !== null ? hydrationKey : apiData
    if (lastHydratedRef.current === token) return

    lastHydratedRef.current = token
    const values = hydrate(apiData)

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        form.reset(values as TFormData)
      }
    })
    return () => {
      cancelled = true
    }
  }, [apiData, hydrationKey, hydrate, form])

  const invalidateActivitySurface = useCallback(() => {
    // NOTE: kebab vs camel-case drift exists in the codebase today
    // (['activities'], ['itinerary-days'] vs ['itineraryDays']). Centralizing
    // here so a single later fix can normalize all callers.
    queryClient.invalidateQueries({ queryKey: ['activities'] })
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
    queryClient.invalidateQueries({ queryKey: ['itinerary-days'] })
    queryClient.invalidateQueries({ queryKey: ['itineraryDays'] })
  }, [queryClient])

  const setBookingState = useCallback(
    (booked: boolean, date?: string | null) => {
      setIsBooked(booked)
      setBookingDate(booked ? date ?? new Date().toISOString().split('T')[0]! : null)
      invalidateActivitySurface()
    },
    [invalidateActivitySurface],
  )

  // We route through form.handleSubmit so the values passed to toPayload
  // are the Zod resolver's transformed output (coerce, defaults,
  // superRefine), not the raw RHF state. Without this, `z.coerce.number()`
  // for price fields would pass strings to the API. Caught by Codex review
  // of PR #364 before #365 flight-form migration could inherit the bug.
  const save = useCallback(async (): Promise<void> => {
    setIsSaving(true)
    let didSubmit = false

    const submitHandler = form.handleSubmit(async (values) => {
      didSubmit = true
      try {
        const payload = toPayload(values as TFormData)
        const response = activityId
          ? await update(activityId, payload)
          : await create(payload)

        if (!activityId && response.id) {
          setActivityId(response.id)
        }
        if (
          response.activityPricingId !== undefined &&
          response.activityPricingId !== null
        ) {
          setActivityPricingId(response.activityPricingId)
        }

        // Mark the form clean by syncing defaultValues to the just-saved
        // values. `reset(values)` updates BOTH current values and defaultValues,
        // so `formState.isDirty` flips to false synchronously — required so
        // the `beforeunload` listener (registered via useUnsavedChangesWarning)
        // is removed BEFORE FormSuccessOverlay's onComplete fires a navigation.
        // Previously we passed `{ keepValues: true, keepDirty: false }`, which
        // left defaultValues stale and let beforeunload fire mid-success — see
        // post-#439 e2e where Save triggered a "Leave site?" prompt despite
        // a successful save.
        form.reset(values)

        setShowSuccess(true)
        onSaveSuccess?.(response)
      } catch (err) {
        onSaveError?.(err)
      }
    })

    try {
      await submitHandler()
    } finally {
      // If validation failed, handleSubmit's callback never ran. Caller
      // can read form.formState.errors to surface validation issues.
      if (!didSubmit) {
        // no-op — preserves prior behavior (silent on validation failure)
      }
      setIsSaving(false)
    }
  }, [activityId, form, toPayload, create, update, onSaveSuccess, onSaveError])

  return {
    activityId,
    activityPricingId,
    isBooked,
    bookingDate,
    showSuccess,
    isSaving,
    setShowSuccess,
    setBookingState,
    save,
    invalidateActivitySurface,
  }
}
