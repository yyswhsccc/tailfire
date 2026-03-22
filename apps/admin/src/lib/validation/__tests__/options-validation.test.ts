/**
 * Options Validation Schema Tests
 *
 * Tests for options form Zod schema and default value hydration.
 */

import { describe, it, expect } from 'vitest'
import { optionsFormSchema, toOptionsDefaults, toOptionsApiPayload } from '../options-validation'

describe('optionsFormSchema', () => {
  // ============================================================================
  // Valid Data Tests
  // ============================================================================

  it('parses valid data correctly', () => {
    const validData = {
      itineraryDayId: 'day-123',
      componentType: 'options' as const,
      name: 'Snorkeling Excursion',
      description: 'A fun snorkeling trip',
      status: 'confirmed' as const,
      optionsDetails: {
        optionCategory: 'excursion' as const,
        isSelected: true,
        availabilityStartDate: '2025-01-15',
        availabilityEndDate: '2025-01-20',
        durationMinutes: 180,
        meetingPoint: 'Hotel Lobby',
        providerName: 'Island Tours',
        inclusions: ['Equipment', 'Guide'],
      },
      totalPriceCents: 15000,
      currency: 'USD',
      pricingType: 'per_person' as const,
    }

    const result = optionsFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.optionsDetails.optionCategory).toBe('excursion')
      expect(result.data.optionsDetails.isSelected).toBe(true)
    }
  })

  // ============================================================================
  // Required Fields Tests
  // ============================================================================

  it('rejects missing required fields', () => {
    const result = optionsFormSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      const fieldPaths = result.error.issues.map((i) => i.path.join('.'))
      expect(fieldPaths).toContain('itineraryDayId')
      expect(fieldPaths).toContain('name')
    }
  })

  it('rejects empty option name', () => {
    const result = optionsFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: '',
      optionsDetails: {},
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find(
        (i) => i.path.join('.') === 'name'
      )
      expect(nameError).toBeDefined()
      expect(nameError?.message).toBe('Option name is required')
    }
  })

  // ============================================================================
  // Number Coercion Tests
  // ============================================================================

  it('coerces string numbers for price fields', () => {
    const result = optionsFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Option',
      optionsDetails: {},
      totalPriceCents: '15000',
      taxesAndFeesCents: '1500',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalPriceCents).toBe(15000)
      expect(result.data.taxesAndFeesCents).toBe(1500)
    }
  })

  it('rejects negative prices', () => {
    const result = optionsFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Option',
      optionsDetails: {},
      totalPriceCents: -100,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const priceError = result.error.issues.find(
        (i) => i.path.includes('totalPriceCents')
      )
      expect(priceError).toBeDefined()
    }
  })

  it('coerces participant numbers', () => {
    const result = optionsFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Option',
      optionsDetails: {
        minParticipants: '2',
        maxParticipants: '10',
        spotsAvailable: '5',
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.optionsDetails.minParticipants).toBe(2)
      expect(result.data.optionsDetails.maxParticipants).toBe(10)
      expect(result.data.optionsDetails.spotsAvailable).toBe(5)
    }
  })

  // ============================================================================
  // Option Category Tests
  // ============================================================================

  it('accepts valid option categories', () => {
    const categories = ['upgrade', 'add_on', 'tour', 'excursion', 'insurance', 'meal_plan', 'other']

    for (const category of categories) {
      const result = optionsFormSchema.safeParse({
        itineraryDayId: 'day-123',
        name: 'Test Option',
        optionsDetails: {
          optionCategory: category,
        },
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid option category', () => {
    const result = optionsFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Option',
      optionsDetails: {
        optionCategory: 'invalid_category',
      },
    })

    expect(result.success).toBe(false)
  })

  // ============================================================================
  // Array Fields Tests
  // ============================================================================

  it('handles array fields correctly', () => {
    const result = optionsFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Option',
      optionsDetails: {
        inclusions: ['Lunch', 'Equipment', 'Guide'],
        exclusions: ['Gratuities'],
        requirements: ['Age 12+'],
        whatToBring: ['Sunscreen', 'Camera'],
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.optionsDetails.inclusions).toHaveLength(3)
      expect(result.data.optionsDetails.exclusions).toHaveLength(1)
      expect(result.data.optionsDetails.requirements).toHaveLength(1)
      expect(result.data.optionsDetails.whatToBring).toHaveLength(2)
    }
  })

  // ============================================================================
  // Commission Fields Tests
  // ============================================================================

  it('validates commission percentage range', () => {
    const resultTooHigh = optionsFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Option',
      optionsDetails: {},
      commissionSplitPercentage: 150,
    })

    expect(resultTooHigh.success).toBe(false)

    const resultValid = optionsFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Option',
      optionsDetails: {},
      commissionSplitPercentage: 50,
    })

    expect(resultValid.success).toBe(true)
  })
})

describe('toOptionsDefaults', () => {
  // ============================================================================
  // Default Hydration Tests
  // ============================================================================

  it('creates valid defaults with no server data', () => {
    const defaults = toOptionsDefaults(null)

    expect(defaults.itineraryDayId).toBe('')
    expect(defaults.componentType).toBe('options')
    expect(defaults.name).toBe('')
    expect(defaults.optionsDetails.isSelected).toBe(false)
    expect(defaults.optionsDetails.inclusions).toEqual([])
    expect(defaults.currency).toBe('USD')
  })

  it('respects dayDate parameter for availability start', () => {
    const dayDate = '2025-06-15'
    const defaults = toOptionsDefaults(null, dayDate)

    expect(defaults.optionsDetails.availabilityStartDate).toBe('2025-06-15')
  })

  it('respects trip currency parameter', () => {
    const defaults = toOptionsDefaults(null, null, 'EUR')

    expect(defaults.currency).toBe('EUR')
  })

  it('hydrates from server data correctly', () => {
    const serverData = {
      itineraryDayId: 'day-456',
      name: 'Loaded Option',
      description: 'From server',
      status: 'confirmed' as const,
      optionsDetails: {
        optionCategory: 'tour' as const,
        isSelected: true,
        providerName: 'Tour Company',
        inclusions: ['Breakfast', 'Lunch'],
      },
      totalPriceCents: 25000,
      currency: 'EUR',
    }

    const defaults = toOptionsDefaults(serverData as any)

    expect(defaults.itineraryDayId).toBe('day-456')
    expect(defaults.name).toBe('Loaded Option')
    expect(defaults.optionsDetails.optionCategory).toBe('tour')
    expect(defaults.optionsDetails.isSelected).toBe(true)
    expect(defaults.optionsDetails.providerName).toBe('Tour Company')
    expect(defaults.optionsDetails.inclusions).toEqual(['Breakfast', 'Lunch'])
    expect(defaults.totalPriceCents).toBe(25000)
    expect(defaults.currency).toBe('EUR')
  })

  it('handles undefined server payload', () => {
    const defaults = toOptionsDefaults(undefined)

    expect(defaults.itineraryDayId).toBe('')
    expect(defaults.name).toBe('')
  })

  // ============================================================================
  // Commission Expected Date Hydration Tests
  // ============================================================================

  it('parses commissionExpectedDate string to ISO format', () => {
    const serverData = {
      itineraryDayId: 'day-commission',
      name: 'Commission Test',
      optionsDetails: {},
      commissionExpectedDate: '2025-04-15',
    }

    const defaults = toOptionsDefaults(serverData as any)

    expect(defaults.commissionExpectedDate).toBe('2025-04-15')
  })

  it('handles null commissionExpectedDate', () => {
    const serverData = {
      itineraryDayId: 'day-null',
      name: 'Null Commission',
      optionsDetails: {},
      commissionExpectedDate: null,
    }

    const defaults = toOptionsDefaults(serverData as any)

    expect(defaults.commissionExpectedDate).toBeNull()
  })

  it('handles invalid commissionExpectedDate string', () => {
    const serverData = {
      itineraryDayId: 'day-invalid',
      name: 'Invalid Commission',
      optionsDetails: {},
      commissionExpectedDate: 'not-a-date',
    }

    const defaults = toOptionsDefaults(serverData as any)

    // Should return null for invalid date
    expect(defaults.commissionExpectedDate).toBeNull()
  })
})

describe('toOptionsApiPayload', () => {
  it('maps form data to API payload correctly', () => {
    const formData = {
      itineraryDayId: 'day-123',
      componentType: 'options' as const,
      name: 'Test Option',
      description: 'A test option',
      proposalStatus: 'draft' as const,
      optionsDetails: {
        optionCategory: 'tour' as const,
        isSelected: true,
        availabilityStartDate: '2025-01-15',
        availabilityEndDate: null,
        bookingDeadline: null,
        minParticipants: 2,
        maxParticipants: 10,
        spotsAvailable: null,
        durationMinutes: 120,
        meetingPoint: 'Lobby',
        meetingTime: '09:00',
        providerName: 'Tour Co',
        providerPhone: '555-1234',
        providerEmail: 'info@tour.com',
        providerWebsite: 'https://tour.com',
        inclusions: ['Guide', 'Lunch'],
        exclusions: ['Tips'],
        requirements: [],
        whatToBring: ['Camera'],
        displayOrder: 1,
        highlightText: 'Best Seller',
        instructionsText: '',
      },
      pricingType: 'per_person' as const,
      currency: 'USD',
      totalPriceCents: 15000,
      taxesAndFeesCents: 1500,
      confirmationNumber: 'ABC123',
      commissionTotalCents: 1000,
      commissionSplitPercentage: 50,
      commissionExpectedDate: '2025-02-15',
      termsAndConditions: 'Standard terms',
      cancellationPolicy: '24 hour cancellation',
      supplier: 'Tour Operator Inc',
    }

    const payload = toOptionsApiPayload(formData)

    expect(payload.itineraryDayId).toBe('day-123')
    expect(payload.componentType).toBe('options')
    expect(payload.name).toBe('Test Option')
    expect(payload.optionsDetails!.optionCategory).toBe('tour')
    expect(payload.optionsDetails!.inclusions).toEqual(['Guide', 'Lunch'])
    expect(payload.totalPriceCents).toBe(15000)
    expect(payload.commissionExpectedDate).toBe('2025-02-15')
  })

  it('handles null commission date', () => {
    const formData = {
      itineraryDayId: 'day-123',
      componentType: 'options' as const,
      name: 'Test',
      description: '',
      proposalStatus: 'draft' as const,
      optionsDetails: {
        optionCategory: null,
        isSelected: false,
        availabilityStartDate: null,
        availabilityEndDate: null,
        bookingDeadline: null,
        minParticipants: null,
        maxParticipants: null,
        spotsAvailable: null,
        durationMinutes: null,
        meetingPoint: '',
        meetingTime: null,
        providerName: '',
        providerPhone: '',
        providerEmail: '',
        providerWebsite: '',
        inclusions: [],
        exclusions: [],
        requirements: [],
        whatToBring: [],
        displayOrder: null,
        highlightText: '',
        instructionsText: '',
      },
      pricingType: 'per_person' as const,
      currency: 'USD',
      totalPriceCents: null,
      taxesAndFeesCents: null,
      confirmationNumber: '',
      commissionTotalCents: null,
      commissionSplitPercentage: null,
      commissionExpectedDate: null,
      termsAndConditions: '',
      cancellationPolicy: '',
      supplier: '',
    }

    const payload = toOptionsApiPayload(formData)

    expect(payload.commissionExpectedDate).toBeNull()
  })
})
