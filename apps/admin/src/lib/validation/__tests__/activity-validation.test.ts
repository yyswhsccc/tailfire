/**
 * Activity Validation Schema Tests
 *
 * Tests for activity form Zod schema and default value hydration.
 */

import { describe, it, expect } from 'vitest'
import { activityFormSchema, toActivityDefaults, toActivityApiPayload } from '../activity-validation'

describe('activityFormSchema', () => {
  // ============================================================================
  // Valid Data Tests
  // ============================================================================

  it('parses valid data correctly', () => {
    const validData = {
      activityType: 'tour' as const,
      name: 'Snorkeling Trip',
      description: 'A fun snorkeling adventure',
      location: 'Beach',
      address: '123 Ocean Ave',
      confirmationNumber: 'ABC123',
      status: 'confirmed' as const,
      pricingType: 'per_person' as const,
      currency: 'USD',
      notes: 'Bring sunscreen',
      startDatetime: '2025-01-15T09:00',
      endDatetime: '2025-01-15T12:00',
    }

    const result = activityFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Snorkeling Trip')
    }
  })

  // ============================================================================
  // Required Fields Tests
  // ============================================================================

  it('rejects empty name', () => {
    const result = activityFormSchema.safeParse({
      name: '',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find(
        (i) => i.path.join('.') === 'name'
      )
      expect(nameError).toBeDefined()
      expect(nameError?.message).toBe('Activity name is required')
    }
  })

  // ============================================================================
  // Activity Type Tests
  // ============================================================================

  it('accepts valid activity types', () => {
    const activityTypes = ['lodging', 'flight', 'tour', 'transportation', 'dining', 'options', 'custom_cruise', 'port_info']

    for (const activityType of activityTypes) {
      const result = activityFormSchema.safeParse({
        activityType,
        name: 'Test Activity',
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid activity type', () => {
    const result = activityFormSchema.safeParse({
      activityType: 'invalid_type',
      name: 'Test Activity',
    })

    expect(result.success).toBe(false)
  })

  // ============================================================================
  // Currency Validation Tests
  // ============================================================================

  it('accepts valid 3-character currency', () => {
    const result = activityFormSchema.safeParse({
      name: 'Test Activity',
      currency: 'EUR',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currency).toBe('EUR')
    }
  })

  it('rejects invalid currency length', () => {
    const result = activityFormSchema.safeParse({
      name: 'Test Activity',
      currency: 'US', // Too short
    })

    expect(result.success).toBe(false)

    const resultLong = activityFormSchema.safeParse({
      name: 'Test Activity',
      currency: 'USDD', // Too long
    })

    expect(resultLong.success).toBe(false)
  })

  // ============================================================================
  // Datetime Validation Tests
  // ============================================================================

  it('handles valid datetime strings', () => {
    const result = activityFormSchema.safeParse({
      name: 'Test Activity',
      startDatetime: '2025-01-15T09:00',
      endDatetime: '2025-01-15T17:00',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startDatetime).toBe('2025-01-15T09:00')
      expect(result.data.endDatetime).toBe('2025-01-15T17:00')
    }
  })

  it('handles null datetime values', () => {
    const result = activityFormSchema.safeParse({
      name: 'Test Activity',
      startDatetime: null,
      endDatetime: null,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startDatetime).toBeNull()
      expect(result.data.endDatetime).toBeNull()
    }
  })

  it('handles empty datetime strings as null', () => {
    const result = activityFormSchema.safeParse({
      name: 'Test Activity',
      startDatetime: '',
      endDatetime: '',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.startDatetime).toBeNull()
      expect(result.data.endDatetime).toBeNull()
    }
  })

  // ============================================================================
  // Cross-Field Validation: End Time After Start Time
  // ============================================================================

  it('rejects end time before start time', () => {
    const result = activityFormSchema.safeParse({
      name: 'Test Activity',
      startDatetime: '2025-01-15T14:00',
      endDatetime: '2025-01-15T09:00', // Before start
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const timeError = result.error.issues.find(
        (i) => i.path.join('.') === 'endDatetime'
      )
      expect(timeError).toBeDefined()
      expect(timeError?.message).toBe('End time must be after start time')
    }
  })

  it('allows end time on different day', () => {
    const result = activityFormSchema.safeParse({
      name: 'Overnight Activity',
      startDatetime: '2025-01-15T22:00',
      endDatetime: '2025-01-16T02:00', // Next day
    })

    expect(result.success).toBe(true)
  })

  it('skips cross-validation when start is missing', () => {
    const result = activityFormSchema.safeParse({
      name: 'Test Activity',
      startDatetime: null,
      endDatetime: '2025-01-15T17:00',
    })

    expect(result.success).toBe(true)
  })

  it('skips cross-validation when end is missing', () => {
    const result = activityFormSchema.safeParse({
      name: 'Test Activity',
      startDatetime: '2025-01-15T09:00',
      endDatetime: null,
    })

    expect(result.success).toBe(true)
  })

  // ============================================================================
  // Status Tests
  // ============================================================================

  it('accepts valid status values', () => {
    const statuses = ['proposed', 'confirmed', 'cancelled']

    for (const status of statuses) {
      const result = activityFormSchema.safeParse({
        name: 'Test Activity',
        status,
      })
      expect(result.success).toBe(true)
    }
  })

  // ============================================================================
  // Pricing Type Tests
  // ============================================================================

  it('accepts valid pricing types', () => {
    const pricingTypes = ['per_person', 'per_room', 'flat_rate', 'per_night']

    for (const pricingType of pricingTypes) {
      const result = activityFormSchema.safeParse({
        name: 'Test Activity',
        pricingType,
      })
      expect(result.success).toBe(true)
    }
  })
})

describe('toActivityDefaults', () => {
  // ============================================================================
  // Default Hydration Tests
  // ============================================================================

  it('creates valid defaults with no server data', () => {
    const defaults = toActivityDefaults(null)

    expect(defaults.activityType).toBe('tour')
    expect(defaults.name).toBe('')
    expect(defaults.description).toBe('')
    expect(defaults.proposalStatus).toBe('draft')
    expect(defaults.pricingType).toBe('per_person')
    expect(defaults.currency).toBe('USD')
  })

  it('respects dayDate parameter for start datetime', () => {
    const dayDate = '2025-06-15'
    const defaults = toActivityDefaults(null, dayDate)

    // Should set to 9:00 AM on the day date (accounting for local timezone)
    expect(defaults.startDatetime).toMatch(/^\d{4}-\d{2}-\d{2}T09:00$/)
    expect(defaults.startDatetime).toContain('T09:00')
  })

  it('respects initialActivityType parameter', () => {
    const defaults = toActivityDefaults(null, null, 'transportation')

    expect(defaults.activityType).toBe('transportation')
  })

  it('respects initialName parameter', () => {
    const defaults = toActivityDefaults(null, null, undefined, 'Custom Name')

    expect(defaults.name).toBe('Custom Name')
  })

  it('hydrates from server data correctly', () => {
    const serverData = {
      activityType: 'dining' as const,
      name: 'Loaded Activity',
      description: 'From server',
      proposalStatus: 'approved' as const,
      location: 'Downtown',
      address: '456 Main St',
      pricingType: 'flat_rate' as const,
      currency: 'EUR',
      startDatetime: '2025-01-15T10:00',
      endDatetime: '2025-01-15T14:00',
    }

    const defaults = toActivityDefaults(serverData as any)

    expect(defaults.activityType).toBe('dining')
    expect(defaults.name).toBe('Loaded Activity')
    expect(defaults.description).toBe('From server')
    expect(defaults.proposalStatus).toBe('approved')
    expect(defaults.location).toBe('Downtown')
    expect(defaults.pricingType).toBe('flat_rate')
    expect(defaults.currency).toBe('EUR')
  })

  it('handles undefined server payload', () => {
    const defaults = toActivityDefaults(undefined)

    expect(defaults.name).toBe('')
    expect(defaults.activityType).toBe('tour')
  })

  it('handles ISO datetime strings from server', () => {
    const serverData = {
      name: 'Test',
      startDatetime: '2025-01-15T10:30',
    }

    const defaults = toActivityDefaults(serverData as any)

    // Should preserve valid datetime-local format
    expect(defaults.startDatetime).toBe('2025-01-15T10:30')
  })
})

describe('toActivityApiPayload', () => {
  it('maps form data to API payload correctly', () => {
    const formData = {
      activityType: 'tour' as const,
      name: 'Test Activity',
      description: 'A test activity',
      location: 'Beach',
      address: '123 Ocean Ave',
      confirmationNumber: 'ABC123',
      proposalStatus: 'draft' as const,
      pricingType: 'per_person' as const,
      currency: 'USD',
      notes: 'Test notes',
      startDatetime: '2025-01-15T09:00',
      endDatetime: '2025-01-15T12:00',
    }

    const payload = toActivityApiPayload(formData, 'day-123')

    expect(payload.activityType).toBe('tour')
    expect(payload.name).toBe('Test Activity')
    expect(payload.location).toBe('Beach')
    expect(payload.startDatetime).toContain('2025-01-15')
  })

  it('converts datetime to ISO string', () => {
    const formData = {
      activityType: 'tour' as const,
      name: 'Test',
      description: '',
      location: '',
      address: '',
      confirmationNumber: '',
      proposalStatus: 'draft' as const,
      pricingType: 'per_person' as const,
      currency: 'USD',
      notes: '',
      startDatetime: '2025-01-15T09:00',
      endDatetime: '2025-01-15T12:00',
    }

    const payload = toActivityApiPayload(formData, 'day-123')

    // Should be ISO string format
    expect(payload.startDatetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(payload.endDatetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('handles null datetime values', () => {
    const formData = {
      activityType: 'tour' as const,
      name: 'Test',
      description: '',
      location: '',
      address: '',
      confirmationNumber: '',
      proposalStatus: 'draft' as const,
      pricingType: 'per_person' as const,
      currency: 'USD',
      notes: '',
      startDatetime: null,
      endDatetime: null,
    }

    const payload = toActivityApiPayload(formData, 'day-123')

    expect(payload.startDatetime).toBeUndefined()
    expect(payload.endDatetime).toBeUndefined()
  })

  it('handles empty optional fields as undefined', () => {
    const formData = {
      activityType: 'tour' as const,
      name: 'Test',
      description: '',
      location: '',
      address: '',
      confirmationNumber: '',
      proposalStatus: 'draft' as const,
      pricingType: 'per_person' as const,
      currency: 'USD',
      notes: '',
      startDatetime: null,
      endDatetime: null,
    }

    const payload = toActivityApiPayload(formData, 'day-123')

    expect(payload.description).toBeUndefined()
    expect(payload.location).toBeUndefined()
    expect(payload.address).toBeUndefined()
  })

  // ============================================================================
  // omitDayId Option Tests (Regression for pendingDay mode)
  // ============================================================================

  it('includes itineraryDayId by default', () => {
    const formData = {
      activityType: 'tour' as const,
      name: 'Test Activity',
      description: '',
      location: '',
      address: '',
      confirmationNumber: '',
      proposalStatus: 'draft' as const,
      pricingType: 'per_person' as const,
      currency: 'USD',
      notes: '',
      startDatetime: null,
      endDatetime: null,
    }

    const payload = toActivityApiPayload(formData, 'day-123')

    // Default: itineraryDayId should be included
    expect('itineraryDayId' in payload).toBe(true)
    expect((payload as any).itineraryDayId).toBe('day-123')
  })

  it('excludes itineraryDayId when omitDayId is true (pendingDay mode)', () => {
    const formData = {
      activityType: 'tour' as const,
      name: 'Test Activity',
      description: '',
      location: '',
      address: '',
      confirmationNumber: '',
      proposalStatus: 'draft' as const,
      pricingType: 'per_person' as const,
      currency: 'USD',
      notes: '',
      startDatetime: null,
      endDatetime: null,
    }

    const payload = toActivityApiPayload(formData, 'day-123', { omitDayId: true })

    // CRITICAL: itineraryDayId must NOT be in payload for pendingDay mode
    expect('itineraryDayId' in payload).toBe(false)
    // Other fields should still be present
    expect(payload.name).toBe('Test Activity')
    expect(payload.activityType).toBe('tour')
  })

  it('includes itineraryDayId when omitDayId is explicitly false', () => {
    const formData = {
      activityType: 'tour' as const,
      name: 'Test Activity',
      description: '',
      location: '',
      address: '',
      confirmationNumber: '',
      proposalStatus: 'draft' as const,
      pricingType: 'per_person' as const,
      currency: 'USD',
      notes: '',
      startDatetime: null,
      endDatetime: null,
    }

    const payload = toActivityApiPayload(formData, 'day-123', { omitDayId: false })

    // Explicit false: should include itineraryDayId
    expect('itineraryDayId' in payload).toBe(true)
    expect((payload as any).itineraryDayId).toBe('day-123')
  })
})
