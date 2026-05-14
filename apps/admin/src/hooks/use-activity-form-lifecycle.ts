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

  /** Initial activity id when editing; null on new */
  initialActivityId?: string | null
  initialActivityPricingId?: string | null
  initialIsBooked?: boolean
  initialBookingDate?: string | null

  /** Caller's RHF form instance */
  form: UseFormReturn<TFormData>

  /** Latest API data from the caller's loader (e.g. useFlight, useLodging) */
  apiData: TApiData | null | undefined

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
  } = opts

  const [activityId, setActivityId] = useState<string | null>(initialActivityId)
  const [activityPricingId, setActivityPricingId] = useState<string | null>(
    initialActivityPricingId,
  )
  const [isBooked, setIsBooked] = useState<boolean>(initialIsBooked)
  const [bookingDate, setBookingDate] = useState<string | null>(initialBookingDate)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const queryClient = useQueryClient()
  const { isDirty } = form.formState
  useUnsavedChangesWarning(isDirty)

  // Track the last-hydrated apiData reference so we don't re-reset on every render
  // when the parent re-passes the same object.
  const lastHydratedRef = useRef<TApiData | null>(null)

  // Hydration effect — when fresh API data arrives, reset() the form.
  // Uses queueMicrotask to defer the reset outside React's render cycle,
  // matching the pattern in flight-form (prevents reset-during-render warnings).
  useEffect(() => {
    if (!apiData) return
    if (lastHydratedRef.current === apiData) return

    lastHydratedRef.current = apiData
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
  }, [apiData, hydrate, form])

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

  const save = useCallback(async () => {
    // Trigger RHF validation manually so we can stay in control of the
    // save outcome and avoid the form's default `<form onSubmit>` flow.
    const valid = await form.trigger()
    if (!valid) return

    setIsSaving(true)
    try {
      const data = form.getValues()
      const payload = toPayload(data)
      const response = activityId
        ? await update(activityId, payload)
        : await create(payload)

      if (!activityId && response.id) {
        setActivityId(response.id)
      }
      if (response.activityPricingId !== undefined && response.activityPricingId !== null) {
        setActivityPricingId(response.activityPricingId)
      }

      // Reset RHF dirty state without losing the current values
      form.reset(form.getValues(), { keepValues: true, keepDirty: false })

      setShowSuccess(true)
      onSaveSuccess?.(response)
    } catch (err) {
      onSaveError?.(err)
    } finally {
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
