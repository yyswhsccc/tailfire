/**
 * Trip Validation Schema Tests
 *
 * Tests for trip form Zod schema, default value hydration, and API payload mapping.
 */

import { describe, it, expect } from 'vitest'
import {
  tripFormSchema,
  toTripDefaults,
  toTripApiPayload,
  TRIP_FORM_FIELDS,
  type TripFormValues,
} from '../trip-validation'
import type { TripResponseDto } from '@tailfire/shared-types/api'

describe('tripFormSchema', () => {
  // ============================================================================
  // Valid Data Tests
  // ============================================================================

  it('parses valid data correctly', () => {
    const validData = {
      name: 'Summer Vacation',
      tripType: 'leisure',
      status: 'planning',
      tags: ['family', 'beach'],
      startDate: '2025-07-01',
      endDate: '2025-07-14',
      addDatesLater: false,
      timezone: 'America/New_York',
    }

    const result = tripFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Summer Vacation')
      expect(result.data.tripType).toBe('leisure')
      expect(result.data.tags).toEqual(['family', 'beach'])
    }
  })

  it('parses minimal valid data (with addDatesLater)', () => {
    const validData = {
      name: 'Trip Planning',
      addDatesLater: true,
    }

    const result = tripFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  // ============================================================================
  // Required Fields Tests
  // ============================================================================

  it('rejects empty name', () => {
    const result = tripFormSchema.safeParse({
      name: '',
      addDatesLater: true,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find(
        (i) => i.path.join('.') === 'name'
      )
      expect(nameError).toBeDefined()
      expect(nameError?.message).toBe('Trip name is required')
    }
  })

  it('rejects name longer than 255 characters', () => {
    const result = tripFormSchema.safeParse({
      name: 'a'.repeat(256),
      addDatesLater: true,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find(
        (i) => i.path.join('.') === 'name'
      )
      expect(nameError).toBeDefined()
    }
  })

  // ============================================================================
  // Trip Type Tests
  // ============================================================================

  it('accepts valid trip types', () => {
    const tripTypes = ['leisure', 'business', 'group', 'honeymoon', 'corporate', 'custom']

    for (const tripType of tripTypes) {
      const result = tripFormSchema.safeParse({
        name: 'Test Trip',
        tripType,
        addDatesLater: true,
      })
      expect(result.success).toBe(true)
    }
  })

  it('accepts empty string for tripType (optional)', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      tripType: '',
      addDatesLater: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tripType).toBe('')
    }
  })

  it('rejects invalid trip type', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      tripType: 'invalid_type',
      addDatesLater: true,
    })

    expect(result.success).toBe(false)
  })

  // ============================================================================
  // Status Tests
  // ============================================================================

  it('accepts valid status values', () => {
    const statuses = ['inbound', 'planning', 'active', 'travelling', 'travelled', 'cancelled']

    for (const status of statuses) {
      const result = tripFormSchema.safeParse({
        name: 'Test Trip',
        status,
        addDatesLater: true,
      })
      expect(result.success).toBe(true)
    }
  })

  it('defaults to planning status', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      addDatesLater: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('planning')
    }
  })

  // ============================================================================
  // Tags Tests
  // ============================================================================

  it('handles tags array', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      tags: ['tag1', 'tag2', 'tag3'],
      addDatesLater: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tags).toEqual(['tag1', 'tag2', 'tag3'])
    }
  })

  it('defaults to empty array for tags', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      addDatesLater: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tags).toEqual([])
    }
  })

  // ============================================================================
  // Cross-Field Validation: Dates Required When addDatesLater is false
  // ============================================================================

  it('requires startDate when addDatesLater is false', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      addDatesLater: false,
      startDate: '',
      endDate: '2025-07-14',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const startDateError = result.error.issues.find(
        (i) => i.path.join('.') === 'startDate'
      )
      expect(startDateError).toBeDefined()
      expect(startDateError?.message).toBe('Start date is required')
    }
  })

  it('requires endDate when addDatesLater is false', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      addDatesLater: false,
      startDate: '2025-07-01',
      endDate: '',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const endDateError = result.error.issues.find(
        (i) => i.path.join('.') === 'endDate'
      )
      expect(endDateError).toBeDefined()
      expect(endDateError?.message).toBe('End date is required')
    }
  })

  it('requires both dates when addDatesLater is false', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      addDatesLater: false,
      startDate: '',
      endDate: '',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.issues.map((i) => i.path.join('.'))
      expect(errors).toContain('startDate')
      expect(errors).toContain('endDate')
    }
  })

  it('skips date validation when addDatesLater is true', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      addDatesLater: true,
      startDate: '',
      endDate: '',
    })

    expect(result.success).toBe(true)
  })

  // ============================================================================
  // Cross-Field Validation: End Date Must Be On Or After Start Date
  // ============================================================================

  it('rejects end date before start date', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      addDatesLater: false,
      startDate: '2025-07-14',
      endDate: '2025-07-01',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const endDateError = result.error.issues.find(
        (i) => i.path.join('.') === 'endDate'
      )
      expect(endDateError).toBeDefined()
      expect(endDateError?.message).toBe('End date must be on or after start date')
    }
  })

  it('allows end date equal to start date', () => {
    const result = tripFormSchema.safeParse({
      name: 'Day Trip',
      addDatesLater: false,
      startDate: '2025-07-14',
      endDate: '2025-07-14',
    })

    expect(result.success).toBe(true)
  })

  it('allows end date after start date', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      addDatesLater: false,
      startDate: '2025-07-01',
      endDate: '2025-07-14',
    })

    expect(result.success).toBe(true)
  })

  it('skips date comparison when dates are empty', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      addDatesLater: true,
      startDate: '',
      endDate: '',
    })

    expect(result.success).toBe(true)
  })

  // ============================================================================
  // Timezone Tests
  // ============================================================================

  it('accepts valid timezone string', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      timezone: 'America/Los_Angeles',
      addDatesLater: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.timezone).toBe('America/Los_Angeles')
    }
  })

  it('accepts empty string for timezone (optional)', () => {
    const result = tripFormSchema.safeParse({
      name: 'Test Trip',
      timezone: '',
      addDatesLater: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.timezone).toBe('')
    }
  })
})

describe('TRIP_FORM_FIELDS', () => {
  it('is a readonly tuple with all form fields', () => {
    expect(TRIP_FORM_FIELDS).toContain('name')
    expect(TRIP_FORM_FIELDS).toContain('tripType')
    expect(TRIP_FORM_FIELDS).toContain('status')
    expect(TRIP_FORM_FIELDS).toContain('tags')
    expect(TRIP_FORM_FIELDS).toContain('startDate')
    expect(TRIP_FORM_FIELDS).toContain('endDate')
    expect(TRIP_FORM_FIELDS).toContain('addDatesLater')
    expect(TRIP_FORM_FIELDS).toContain('timezone')
  })

  it('has 8 fields', () => {
    expect(TRIP_FORM_FIELDS.length).toBe(8)
  })
})

describe('toTripDefaults', () => {
  // ============================================================================
  // Default Hydration Tests
  // ============================================================================

  it('creates valid defaults with no server data', () => {
    const defaults = toTripDefaults()

    expect(defaults.name).toBe('')
    expect(defaults.tripType).toBe('leisure')
    expect(defaults.status).toBe('planning')
    expect(defaults.tags).toEqual([])
    expect(defaults.startDate).toBe('')
    expect(defaults.endDate).toBe('')
    expect(defaults.addDatesLater).toBe(false)
    expect(defaults.timezone).toBe('')
  })

  it('creates valid defaults with null server data', () => {
    const defaults = toTripDefaults(null)

    expect(defaults.name).toBe('')
    expect(defaults.tags).toEqual([])
    expect(defaults.addDatesLater).toBe(false)
  })

  it('always returns tags as empty array, never undefined', () => {
    const defaults = toTripDefaults()
    expect(defaults.tags).toEqual([])
    expect(Array.isArray(defaults.tags)).toBe(true)
  })

  it('hydrates from server data correctly', () => {
    const serverData = {
      id: 'trip-123',
      name: 'Loaded Trip',
      tripType: 'business',
      status: 'booked',
      tags: ['corporate', 'conference'],
      startDate: '2025-07-01',
      endDate: '2025-07-05',
      timezone: 'Europe/London',
    } as unknown as TripResponseDto

    const defaults = toTripDefaults(serverData)

    expect(defaults.name).toBe('Loaded Trip')
    expect(defaults.tripType).toBe('business')
    expect(defaults.status).toBe('booked')
    expect(defaults.tags).toEqual(['corporate', 'conference'])
    expect(defaults.startDate).toBe('2025-07-01')
    expect(defaults.endDate).toBe('2025-07-05')
    expect(defaults.timezone).toBe('Europe/London')
    expect(defaults.addDatesLater).toBe(false)
  })

  it('sets addDatesLater to true when server has no dates', () => {
    const serverData = {
      id: 'trip-123',
      name: 'Trip Without Dates',
      startDate: null,
      endDate: null,
    } as unknown as TripResponseDto

    const defaults = toTripDefaults(serverData)

    expect(defaults.addDatesLater).toBe(true)
    expect(defaults.startDate).toBe('')
    expect(defaults.endDate).toBe('')
  })

  it('handles missing tags in server data', () => {
    const serverData = {
      id: 'trip-123',
      name: 'Trip Without Tags',
      tags: undefined,
    } as unknown as TripResponseDto

    const defaults = toTripDefaults(serverData)

    expect(defaults.tags).toEqual([])
  })

  it('handles null tags in server data', () => {
    const serverData = {
      id: 'trip-123',
      name: 'Trip With Null Tags',
      tags: null,
    } as unknown as TripResponseDto

    const defaults = toTripDefaults(serverData)

    expect(defaults.tags).toEqual([])
  })
})

describe('toTripApiPayload', () => {
  // ============================================================================
  // API Payload Mapping Tests
  // ============================================================================

  it('maps form data to API payload correctly', () => {
    const formData: TripFormValues = {
      name: 'Test Trip',
      tripType: 'leisure',
      status: 'planning',
      tags: ['family', 'vacation'],
      startDate: '2025-07-01',
      endDate: '2025-07-14',
      addDatesLater: false,
      timezone: 'America/New_York',
    }

    const payload = toTripApiPayload(formData)

    expect(payload.name).toBe('Test Trip')
    expect(payload.tripType).toBe('leisure')
    expect(payload.status).toBe('planning')
    expect(payload.tags).toEqual(['family', 'vacation'])
    expect(payload.startDate).toBe('2025-07-01')
    expect(payload.endDate).toBe('2025-07-14')
    expect(payload.timezone).toBe('America/New_York')
  })

  it('strips addDatesLater from payload', () => {
    const formData: TripFormValues = {
      name: 'Test Trip',
      tripType: '',
      status: 'planning',
      tags: [],
      startDate: '',
      endDate: '',
      addDatesLater: true,
      timezone: '',
    }

    const payload = toTripApiPayload(formData)

    expect('addDatesLater' in payload).toBe(false)
  })

  it('converts empty string tripType to leisure', () => {
    const formData: TripFormValues = {
      name: 'Test Trip',
      tripType: '',
      status: 'planning',
      tags: [],
      startDate: '2025-07-01',
      endDate: '2025-07-14',
      addDatesLater: false,
      timezone: '',
    }

    const payload = toTripApiPayload(formData)

    expect(payload.tripType).toBe('leisure')
  })

  it('converts empty string timezone to undefined', () => {
    const formData: TripFormValues = {
      name: 'Test Trip',
      tripType: 'leisure',
      status: 'planning',
      tags: [],
      startDate: '2025-07-01',
      endDate: '2025-07-14',
      addDatesLater: false,
      timezone: '',
    }

    const payload = toTripApiPayload(formData)

    expect(payload.timezone).toBeUndefined()
  })

  it('clears dates when addDatesLater is true', () => {
    const formData: TripFormValues = {
      name: 'Test Trip',
      tripType: 'leisure',
      status: 'planning',
      tags: [],
      startDate: '2025-07-01', // Has a value but should be cleared
      endDate: '2025-07-14',
      addDatesLater: true,
      timezone: '',
    }

    const payload = toTripApiPayload(formData)

    expect(payload.startDate).toBeUndefined()
    expect(payload.endDate).toBeUndefined()
  })

  it('converts empty tags array to undefined', () => {
    const formData: TripFormValues = {
      name: 'Test Trip',
      tripType: '',
      status: 'planning',
      tags: [],
      startDate: '2025-07-01',
      endDate: '2025-07-14',
      addDatesLater: false,
      timezone: '',
    }

    const payload = toTripApiPayload(formData)

    expect(payload.tags).toBeUndefined()
  })

  it('preserves non-empty tags array', () => {
    const formData: TripFormValues = {
      name: 'Test Trip',
      tripType: '',
      status: 'planning',
      tags: ['tag1'],
      startDate: '2025-07-01',
      endDate: '2025-07-14',
      addDatesLater: false,
      timezone: '',
    }

    const payload = toTripApiPayload(formData)

    expect(payload.tags).toEqual(['tag1'])
  })

  it('converts empty string dates to undefined', () => {
    const formData: TripFormValues = {
      name: 'Test Trip',
      tripType: '',
      status: 'planning',
      tags: [],
      startDate: '',
      endDate: '',
      addDatesLater: false,
      timezone: '',
    }

    const payload = toTripApiPayload(formData)

    expect(payload.startDate).toBeUndefined()
    expect(payload.endDate).toBeUndefined()
  })
})
