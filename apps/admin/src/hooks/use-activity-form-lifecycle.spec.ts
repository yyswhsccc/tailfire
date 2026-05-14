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
})
