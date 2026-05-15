/**
 * Spec for useActivityFormLifecycle — Step 2 of the refactor roadmap (#358).
 *
 * These scenarios are the test record of today's regressions (#351, #352, #347)
 * that motivated this refactor. Each one was a real bug; the hook plus future
 * migrations of dining/lodging/tour/etc. will share these guarantees.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import React from 'react'
import {
  useActivityFormLifecycle,
  type ActivitySaveResponse,
} from './use-activity-form-lifecycle'

// Minimal shape mirroring what flight-form will actually use.
type TestForm = {
  itineraryDayId: string
  currency: string
  supplier: string
  termsAndConditions: string
  cancellationPolicy: string
  totalPriceCents: number
}

type TestApi = {
  id: string
  itineraryDayId: string
  currency: string
  supplier: string | null
  termsAndConditions: string | null
  cancellationPolicy: string | null
  totalPriceCents: number
  activityPricingId?: string | null
}

function wrapperFactory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
  return { Wrapper, queryClient }
}

const baseHydrate = (api: TestApi): Partial<TestForm> => ({
  itineraryDayId: api.itineraryDayId,
  currency: api.currency,
  supplier: api.supplier ?? '',
  termsAndConditions: api.termsAndConditions ?? '',
  cancellationPolicy: api.cancellationPolicy ?? '',
  totalPriceCents: api.totalPriceCents ?? 0,
})

const basePayload = (form: TestForm) => ({
  itineraryDayId: form.itineraryDayId,
  currency: form.currency,
  supplier: form.supplier || undefined,
  termsAndConditions: form.termsAndConditions || undefined,
  cancellationPolicy: form.cancellationPolicy || undefined,
  totalPriceCents: form.totalPriceCents,
})

const defaultFormValues: TestForm = {
  itineraryDayId: 'day-1',
  currency: 'CAD',
  supplier: '',
  termsAndConditions: '',
  cancellationPolicy: '',
  totalPriceCents: 0,
}

type CreateFn = (payload: any) => Promise<ActivitySaveResponse>
type UpdateFn = (id: string, payload: any) => Promise<ActivitySaveResponse>

describe('useActivityFormLifecycle', () => {
  let create: ReturnType<typeof vi.fn<CreateFn>>
  let update: ReturnType<typeof vi.fn<UpdateFn>>

  beforeEach(() => {
    create = vi.fn<CreateFn>(async () => ({
      id: 'new-activity-id',
      activityPricingId: 'new-pricing-id',
    }))
    update = vi.fn<UpdateFn>(async (id) => ({
      id,
      activityPricingId: 'updated-pricing-id',
    }))
  })

  // --- #351 scenario ---------------------------------------------------------
  // Booking-detail fields (supplier / T&C / cancellation policy) must hydrate
  // from the API response. PR #355 fixed buildInitialPricingState; this spec
  // protects the lifecycle hook's hydrate path.
  it('hydrates booking-detail fields from API data', async () => {
    const { Wrapper } = wrapperFactory()
    const api: TestApi = {
      id: 'a-1',
      itineraryDayId: 'day-1',
      currency: 'CAD',
      supplier: 'Air Canada',
      termsAndConditions: 'Saved T&C value',
      cancellationPolicy: 'Saved cancellation policy',
      totalPriceCents: 100000,
    }

    const { result } = renderHook(
      () => {
        const form = useForm<TestForm>({ defaultValues: defaultFormValues })
        const lifecycle = useActivityFormLifecycle({
          activityType: 'flight',
          tripId: 'trip-1',
          initialActivityId: 'a-1',
          form,
          apiData: api,
          hydrate: baseHydrate,
          toPayload: basePayload,
          create,
          update,
        })
        return { form, lifecycle }
      },
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.form.getValues('supplier')).toBe('Air Canada')
      expect(result.current.form.getValues('termsAndConditions')).toBe('Saved T&C value')
      expect(result.current.form.getValues('cancellationPolicy')).toBe(
        'Saved cancellation policy',
      )
    })
  })

  // --- #352 scenario ---------------------------------------------------------
  // The form must trust the activity's own currency, not get overridden by a
  // trip-level default. The hook is currency-agnostic; the caller's hydrate
  // mapper enforces precedence. This spec proves the hook does not interfere.
  it('preserves activity currency through hydration', async () => {
    const { Wrapper } = wrapperFactory()
    const api: TestApi = {
      id: 'a-2',
      itineraryDayId: 'day-1',
      currency: 'EUR', // saved as EUR on a CAD trip
      supplier: null,
      termsAndConditions: null,
      cancellationPolicy: null,
      totalPriceCents: 0,
    }

    const { result } = renderHook(
      () => {
        const form = useForm<TestForm>({
          defaultValues: { ...defaultFormValues, currency: 'CAD' }, // trip default
        })
        const lifecycle = useActivityFormLifecycle({
          activityType: 'flight',
          tripId: 'trip-1',
          form,
          apiData: api,
          hydrate: baseHydrate,
          toPayload: basePayload,
          create,
          update,
        })
        return { form, lifecycle }
      },
      { wrapper: Wrapper },
    )

    await waitFor(() => {
      expect(result.current.form.getValues('currency')).toBe('EUR')
    })
  })

  // --- save flow: update path ------------------------------------------------
  it('save() calls update() when activityId exists and resets dirty state', async () => {
    const { Wrapper } = wrapperFactory()
    const { result } = renderHook(
      () => {
        const form = useForm<TestForm>({ defaultValues: defaultFormValues })
        const lifecycle = useActivityFormLifecycle({
          activityType: 'flight',
          tripId: 'trip-1',
          initialActivityId: 'existing-activity',
          form,
          apiData: null,
          hydrate: baseHydrate,
          toPayload: basePayload,
          create,
          update,
        })
        return { form, lifecycle }
      },
      { wrapper: Wrapper },
    )

    // Make the form dirty
    act(() => {
      result.current.form.setValue('supplier', 'Air Canada', { shouldDirty: true })
    })
    expect(result.current.form.formState.isDirty).toBe(true)

    await act(async () => {
      await result.current.lifecycle.save()
    })

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      'existing-activity',
      expect.objectContaining({ supplier: 'Air Canada' }),
    )
    expect(create).not.toHaveBeenCalled()
    expect(result.current.form.formState.isDirty).toBe(false)
    expect(result.current.lifecycle.showSuccess).toBe(true)
  })

  // --- save flow: create path ------------------------------------------------
  it('save() calls create() when no activityId and adopts the new id', async () => {
    const { Wrapper } = wrapperFactory()
    const { result } = renderHook(
      () => {
        const form = useForm<TestForm>({ defaultValues: defaultFormValues })
        const lifecycle = useActivityFormLifecycle({
          activityType: 'flight',
          tripId: 'trip-1',
          form,
          apiData: null,
          hydrate: baseHydrate,
          toPayload: basePayload,
          create,
          update,
        })
        return { form, lifecycle }
      },
      { wrapper: Wrapper },
    )

    expect(result.current.lifecycle.activityId).toBeNull()

    await act(async () => {
      await result.current.lifecycle.save()
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    expect(result.current.lifecycle.activityId).toBe('new-activity-id')
    expect(result.current.lifecycle.activityPricingId).toBe('new-pricing-id')
  })

  // --- error path ------------------------------------------------------------
  it('save() calls onSaveError when the mutation rejects', async () => {
    const { Wrapper } = wrapperFactory()
    const boom = new Error('API exploded')
    update.mockRejectedValueOnce(boom)
    const onSaveError = vi.fn()

    const { result } = renderHook(
      () => {
        const form = useForm<TestForm>({ defaultValues: defaultFormValues })
        const lifecycle = useActivityFormLifecycle({
          activityType: 'flight',
          tripId: 'trip-1',
          initialActivityId: 'a-3',
          form,
          apiData: null,
          hydrate: baseHydrate,
          toPayload: basePayload,
          create,
          update,
          onSaveError,
        })
        return { form, lifecycle }
      },
      { wrapper: Wrapper },
    )

    await act(async () => {
      await result.current.lifecycle.save()
    })

    expect(onSaveError).toHaveBeenCalledWith(boom)
    expect(result.current.lifecycle.showSuccess).toBe(false)
  })

  // --- booking-state helper --------------------------------------------------
  it('setBookingState invalidates the activity cache surface', async () => {
    const { Wrapper, queryClient } = wrapperFactory()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () => {
        const form = useForm<TestForm>({ defaultValues: defaultFormValues })
        const lifecycle = useActivityFormLifecycle({
          activityType: 'flight',
          tripId: 'trip-1',
          initialActivityId: 'a-4',
          form,
          apiData: null,
          hydrate: baseHydrate,
          toPayload: basePayload,
          create,
          update,
        })
        return { form, lifecycle }
      },
      { wrapper: Wrapper },
    )

    act(() => {
      result.current.lifecycle.setBookingState(true, '2026-05-14')
    })

    expect(result.current.lifecycle.isBooked).toBe(true)
    expect(result.current.lifecycle.bookingDate).toBe('2026-05-14')

    // Invalidates the four query-key shapes the codebase uses today
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as any).queryKey)
    expect(keys).toEqual(
      expect.arrayContaining([
        ['activities'],
        ['bookings'],
        ['itinerary-days'],
        ['itineraryDays'],
      ]),
    )
  })

  // --- save flow: Zod resolver values used in payload (Codex review) --------
  // The hook routes save through form.handleSubmit so the values handed to
  // toPayload() are the resolver-transformed output (z.coerce, defaults,
  // superRefine). Without this, z.coerce.number() for price fields would pass
  // strings to the API.
  it('save() passes resolver-coerced values to toPayload', async () => {
    const { Wrapper } = wrapperFactory()
    const schema = z.object({
      itineraryDayId: z.string(),
      totalPriceCents: z.coerce.number().int().default(0),
      currency: z.string().default('CAD'),
      supplier: z.string().default(''),
      termsAndConditions: z.string().default(''),
      cancellationPolicy: z.string().default(''),
    })
    type SchemaForm = z.infer<typeof schema>
    const toPayloadSpy = vi.fn((v: SchemaForm) => v)

    const { result } = renderHook(
      () => {
        const form = useForm<SchemaForm>({
          resolver: zodResolver(schema),
          defaultValues: defaultFormValues as SchemaForm,
        })
        const lifecycle = useActivityFormLifecycle<SchemaForm, SchemaForm, SchemaForm>({
          activityType: 'flight',
          tripId: 'trip-1',
          initialActivityId: 'a-5',
          form,
          apiData: null,
          hydrate: baseHydrate as any,
          toPayload: toPayloadSpy,
          create: create as any,
          update: update as any,
        })
        return { form, lifecycle }
      },
      { wrapper: Wrapper },
    )

    // Set the field with a string — z.coerce should turn it into a number.
    act(() => {
      result.current.form.setValue('totalPriceCents', '12345' as any, {
        shouldDirty: true,
      })
    })

    await act(async () => {
      await result.current.lifecycle.save()
    })

    expect(toPayloadSpy).toHaveBeenCalledTimes(1)
    const passed = toPayloadSpy.mock.calls[0]![0]
    expect(typeof passed.totalPriceCents).toBe('number')
    expect(passed.totalPriceCents).toBe(12345)
  })

  // --- hydration: respects explicit hydrationKey -----------------------------
  // React Query refetches yield new object identities for the same logical
  // data. With hydrationKey, the hook skips re-hydrating on identity-only
  // changes — protects the user's dirty edits.
  it('does NOT re-hydrate when hydrationKey is stable but apiData identity changes', async () => {
    const { Wrapper } = wrapperFactory()
    let api: TestApi = {
      id: 'a-6',
      itineraryDayId: 'day-1',
      currency: 'CAD',
      supplier: 'Original',
      termsAndConditions: 'Original T&C',
      cancellationPolicy: null,
      totalPriceCents: 0,
    }

    const { result, rerender } = renderHook(
      ({ apiData, hydrationKey }: { apiData: TestApi; hydrationKey: string }) => {
        const form = useForm<TestForm>({ defaultValues: defaultFormValues })
        const lifecycle = useActivityFormLifecycle({
          activityType: 'flight',
          tripId: 'trip-1',
          initialActivityId: 'a-6',
          form,
          apiData,
          hydrationKey,
          hydrate: baseHydrate,
          toPayload: basePayload,
          create,
          update,
        })
        return { form, lifecycle }
      },
      {
        wrapper: Wrapper,
        initialProps: { apiData: api, hydrationKey: 'v1' },
      },
    )

    await waitFor(() => {
      expect(result.current.form.getValues('supplier')).toBe('Original')
    })

    // User edits the form (dirty state).
    act(() => {
      result.current.form.setValue('supplier', 'User typed this', { shouldDirty: true })
    })

    // Simulate React Query refetch — same logical data, new object identity.
    api = { ...api, supplier: 'Original' /* server-side value, unchanged */ }
    rerender({ apiData: api, hydrationKey: 'v1' })

    // Wait a tick for any deferred reset that might have fired.
    await new Promise((r) => setTimeout(r, 10))

    // User's dirty edit must survive — hydrationKey is unchanged.
    expect(result.current.form.getValues('supplier')).toBe('User typed this')
  })

  // --- controlled-ID mode (PR A — prerequisite for #365 flight migration) ---
  // When the caller passes `activityId` as a prop, the hook treats it as
  // controlled — caller owns the state. Used by forms that need URL-driven
  // navigation between activities of the same type (e.g. flight-form's
  // sidebar navigation).
  describe('controlled activityId mode', () => {
    it('reads activityId from the controlled prop, not internal state', async () => {
      const { Wrapper } = wrapperFactory()
      const onChange = vi.fn()

      const { result, rerender } = renderHook(
        ({ activityId }: { activityId: string | null }) => {
          const form = useForm<TestForm>({ defaultValues: defaultFormValues })
          const lifecycle = useActivityFormLifecycle({
            activityType: 'flight',
            tripId: 'trip-1',
            form,
            apiData: null,
            hydrate: baseHydrate,
            toPayload: basePayload,
            create,
            update,
            activityId, // controlled
            onActivityIdChange: onChange,
          })
          return lifecycle
        },
        { wrapper: Wrapper, initialProps: { activityId: 'flight-A' } },
      )

      expect(result.current.activityId).toBe('flight-A')

      // Simulate caller updating the controlled prop (e.g. URL changed)
      rerender({ activityId: 'flight-B' })
      expect(result.current.activityId).toBe('flight-B')
    })

    it('calls onActivityIdChange when save() create produces a new id', async () => {
      const { Wrapper } = wrapperFactory()
      const onChange = vi.fn()

      const { result } = renderHook(
        () => {
          const form = useForm<TestForm>({ defaultValues: defaultFormValues })
          const lifecycle = useActivityFormLifecycle({
            activityType: 'flight',
            tripId: 'trip-1',
            form,
            apiData: null,
            hydrate: baseHydrate,
            toPayload: basePayload,
            create,
            update,
            activityId: null, // controlled, starts as new
            onActivityIdChange: onChange,
          })
          return { form, lifecycle }
        },
        { wrapper: Wrapper },
      )

      await act(async () => {
        await result.current.lifecycle.save()
      })

      // save() runs create (no activityId) and reports the new id back to caller
      expect(create).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('new-activity-id')
    })

    it('uses controlled activityId for save() update path', async () => {
      const { Wrapper } = wrapperFactory()
      const onChange = vi.fn()

      const { result } = renderHook(
        () => {
          const form = useForm<TestForm>({ defaultValues: defaultFormValues })
          const lifecycle = useActivityFormLifecycle({
            activityType: 'flight',
            tripId: 'trip-1',
            form,
            apiData: null,
            hydrate: baseHydrate,
            toPayload: basePayload,
            create,
            update,
            activityId: 'controlled-existing-id', // controlled, edit mode
            onActivityIdChange: onChange,
          })
          return { form, lifecycle }
        },
        { wrapper: Wrapper },
      )

      await act(async () => {
        await result.current.lifecycle.save()
      })

      expect(update).toHaveBeenCalledWith(
        'controlled-existing-id',
        expect.any(Object),
      )
      expect(create).not.toHaveBeenCalled()
    })
  })

  describe('controlled activityPricingId mode', () => {
    it('calls onActivityPricingIdChange when save() response includes a new pricing id', async () => {
      const { Wrapper } = wrapperFactory()
      const onActivityIdChange = vi.fn()
      const onActivityPricingIdChange = vi.fn()

      const { result } = renderHook(
        () => {
          const form = useForm<TestForm>({ defaultValues: defaultFormValues })
          const lifecycle = useActivityFormLifecycle({
            activityType: 'flight',
            tripId: 'trip-1',
            form,
            apiData: null,
            hydrate: baseHydrate,
            toPayload: basePayload,
            create,
            update,
            activityId: null,
            onActivityIdChange,
            activityPricingId: null,
            onActivityPricingIdChange,
          })
          return { form, lifecycle }
        },
        { wrapper: Wrapper },
      )

      await act(async () => {
        await result.current.lifecycle.save()
      })

      expect(onActivityPricingIdChange).toHaveBeenCalledWith('new-pricing-id')
    })
  })
})
