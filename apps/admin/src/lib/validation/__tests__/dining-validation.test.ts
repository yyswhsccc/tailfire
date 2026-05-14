/**
 * Dining Validation Schema Tests
 *
 * Tests for dining form Zod schema and default value hydration.
 */

import { describe, it, expect } from 'vitest'
import { diningFormSchema, toDiningDefaults, toDiningApiPayload } from '../dining-validation'

describe('diningFormSchema', () => {
  // ============================================================================
  // Valid Data Tests
  // ============================================================================

  it('parses valid data correctly', () => {
    const validData = {
      itineraryDayId: 'day-123',
      componentType: 'dining' as const,
      name: 'Test Restaurant',
      description: 'A fine dining experience',
      status: 'confirmed' as const,
      diningDetails: {
        restaurantName: 'Le Fancy Restaurant',
        cuisineType: 'French',
        mealType: 'dinner' as const,
        reservationDate: '2025-01-15',
        reservationTime: '19:30',
        partySize: 4,
      },
      totalPriceCents: 25000,
      currency: 'USD',
      pricingType: 'per_person' as const,
    }

    const result = diningFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.diningDetails.restaurantName).toBe('Le Fancy Restaurant')
      expect(result.data.diningDetails.mealType).toBe('dinner')
    }
  })

  // ============================================================================
  // Required Fields Tests
  // ============================================================================

  it('rejects missing required fields', () => {
    const result = diningFormSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      const fieldPaths = result.error.issues.map((i) => i.path.join('.'))
      expect(fieldPaths).toContain('itineraryDayId')
    }
  })

  it('rejects empty restaurant name', () => {
    const result = diningFormSchema.safeParse({
      itineraryDayId: 'day-123',
      diningDetails: {
        restaurantName: '',
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find(
        (i) => i.path.join('.') === 'diningDetails.restaurantName'
      )
      expect(nameError).toBeDefined()
      expect(nameError?.message).toBe('Restaurant name is required')
    }
  })

  // ============================================================================
  // Number Coercion Tests
  // ============================================================================

  it('coerces string numbers for price fields', () => {
    const result = diningFormSchema.safeParse({
      itineraryDayId: 'day-123',
      diningDetails: {
        restaurantName: 'Test Restaurant',
      },
      totalPriceCents: '25000',
      taxesAndFeesCents: '2500',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalPriceCents).toBe(25000)
      expect(result.data.taxesAndFeesCents).toBe(2500)
    }
  })

  it('rejects negative prices', () => {
    const result = diningFormSchema.safeParse({
      itineraryDayId: 'day-123',
      diningDetails: {
        restaurantName: 'Test Restaurant',
      },
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

  it('coerces party size from string', () => {
    const result = diningFormSchema.safeParse({
      itineraryDayId: 'day-123',
      diningDetails: {
        restaurantName: 'Test Restaurant',
        partySize: '6',
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.diningDetails.partySize).toBe(6)
    }
  })

  // ============================================================================
  // Meal Type Tests
  // ============================================================================

  it('accepts valid meal types', () => {
    const mealTypes = ['breakfast', 'brunch', 'lunch', 'afternoon_tea', 'dinner', 'late_night']

    for (const mealType of mealTypes) {
      const result = diningFormSchema.safeParse({
        itineraryDayId: 'day-123',
        diningDetails: {
          restaurantName: 'Test Restaurant',
          mealType,
        },
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid meal type', () => {
    const result = diningFormSchema.safeParse({
      itineraryDayId: 'day-123',
      diningDetails: {
        restaurantName: 'Test Restaurant',
        mealType: 'invalid_meal',
      },
    })

    expect(result.success).toBe(false)
  })

  // ============================================================================
  // Array Fields Tests
  // ============================================================================

  it('handles dietary requirements array', () => {
    const result = diningFormSchema.safeParse({
      itineraryDayId: 'day-123',
      diningDetails: {
        restaurantName: 'Test Restaurant',
        dietaryRequirements: ['Vegetarian', 'Gluten-Free', 'Nut Allergy'],
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.diningDetails.dietaryRequirements).toHaveLength(3)
      expect(result.data.diningDetails.dietaryRequirements).toContain('Vegetarian')
    }
  })

  // ============================================================================
  // Commission Fields Tests
  // ============================================================================

  it('validates commission percentage range', () => {
    const resultTooHigh = diningFormSchema.safeParse({
      itineraryDayId: 'day-123',
      diningDetails: {
        restaurantName: 'Test Restaurant',
      },
      commissionSplitPercentage: 150,
    })

    expect(resultTooHigh.success).toBe(false)

    const resultValid = diningFormSchema.safeParse({
      itineraryDayId: 'day-123',
      diningDetails: {
        restaurantName: 'Test Restaurant',
      },
      commissionSplitPercentage: 50,
    })

    expect(resultValid.success).toBe(true)
  })
})

describe('toDiningDefaults', () => {
  // ============================================================================
  // Default Hydration Tests
  // ============================================================================

  it('creates valid defaults with no server data', () => {
    const defaults = toDiningDefaults(null)

    expect(defaults.itineraryDayId).toBe('')
    expect(defaults.componentType).toBe('dining')
    expect(defaults.name).toBe('')
    expect(defaults.diningDetails.restaurantName).toBe('')
    expect(defaults.diningDetails.mealType).toBe('dinner')
    expect(defaults.currency).toBe('CAD')
  })

  it('respects dayDate parameter for reservation date', () => {
    const dayDate = '2025-06-15'
    const defaults = toDiningDefaults(null, dayDate)

    expect(defaults.diningDetails.reservationDate).toBe('2025-06-15')
  })

  it('respects trip currency parameter', () => {
    const defaults = toDiningDefaults(null, null, 'EUR')

    expect(defaults.currency).toBe('EUR')
  })

  it('respects party size parameter', () => {
    const defaults = toDiningDefaults(null, null, undefined, 6)

    expect(defaults.diningDetails.partySize).toBe(6)
  })

  it('hydrates from server data correctly', () => {
    const serverData = {
      itineraryDayId: 'day-456',
      name: 'Loaded Restaurant',
      description: 'From server',
      status: 'confirmed' as const,
      diningDetails: {
        restaurantName: 'Server Restaurant',
        cuisineType: 'Italian',
        mealType: 'lunch' as const,
        partySize: 8,
        dietaryRequirements: ['Vegan'],
      },
      totalPriceCents: 30000,
      currency: 'EUR',
    }

    const defaults = toDiningDefaults(serverData as any)

    expect(defaults.itineraryDayId).toBe('day-456')
    expect(defaults.name).toBe('Loaded Restaurant')
    expect(defaults.diningDetails.restaurantName).toBe('Server Restaurant')
    expect(defaults.diningDetails.cuisineType).toBe('Italian')
    expect(defaults.diningDetails.mealType).toBe('lunch')
    expect(defaults.diningDetails.partySize).toBe(8)
    expect(defaults.diningDetails.dietaryRequirements).toEqual(['Vegan'])
    expect(defaults.totalPriceCents).toBe(30000)
    expect(defaults.currency).toBe('EUR')
  })

  it('handles undefined server payload', () => {
    const defaults = toDiningDefaults(undefined)

    expect(defaults.itineraryDayId).toBe('')
    expect(defaults.diningDetails.restaurantName).toBe('')
  })

  // ============================================================================
  // Commission Expected Date Hydration Tests
  // ============================================================================

  it('parses commissionExpectedDate string to ISO format', () => {
    const serverData = {
      itineraryDayId: 'day-commission',
      diningDetails: {
        restaurantName: 'Commission Test',
      },
      commissionExpectedDate: '2025-04-15',
    }

    const defaults = toDiningDefaults(serverData as any)

    expect(defaults.commissionExpectedDate).toBe('2025-04-15')
  })

  it('handles null commissionExpectedDate', () => {
    const serverData = {
      itineraryDayId: 'day-null',
      diningDetails: {
        restaurantName: 'Null Commission',
      },
      commissionExpectedDate: null,
    }

    const defaults = toDiningDefaults(serverData as any)

    expect(defaults.commissionExpectedDate).toBeNull()
  })
})

describe('toDiningApiPayload', () => {
  it('maps form data to API payload correctly', () => {
    const formData = {
      itineraryDayId: 'day-123',
      componentType: 'dining' as const,
      name: 'Test Restaurant',
      description: 'A test dining',
      proposalStatus: 'draft' as const,
      diningDetails: {
        restaurantName: 'Le Restaurant',
        cuisineType: 'French',
        mealType: 'dinner' as const,
        reservationDate: '2025-01-15',
        reservationTime: '19:30',
        timezone: 'America/New_York',
        partySize: 4,
        address: '123 Main St',
        phone: '555-1234',
        website: 'https://restaurant.com',
        coordinates: null,
        priceRange: '$$$',
        dressCode: 'Smart Casual',
        dietaryRequirements: ['Vegetarian'],
        specialRequests: 'Window seat please',
        menuUrl: 'https://restaurant.com/menu',
      },
      totalPriceCents: 25000,
      taxesAndFeesCents: 2500,
      currency: 'USD',
      pricingType: 'per_person' as const,
      confirmationNumber: 'ABC123',
      referralUrl: '',
      commissionTotalCents: 1000,
      commissionSplitPercentage: 50,
      commissionExpectedDate: '2025-02-15',
      termsAndConditions: '',
      cancellationPolicy: '',
      supplier: '',
    }

    const payload = toDiningApiPayload(formData)

    expect(payload.itineraryDayId).toBe('day-123')
    expect(payload.componentType).toBe('dining')
    expect(payload.name).toBe('Le Restaurant') // Auto-named from restaurantName
    expect(payload.diningDetails!.restaurantName).toBe('Le Restaurant')
    expect(payload.diningDetails!.dietaryRequirements).toEqual(['Vegetarian'])
    expect(payload.totalPriceCents).toBe(25000)
    expect(payload.commissionExpectedDate).toBe('2025-02-15')
  })

  it('handles null commission date', () => {
    const formData = {
      itineraryDayId: 'day-123',
      componentType: 'dining' as const,
      name: 'Test',
      description: '',
      proposalStatus: 'draft' as const,
      diningDetails: {
        restaurantName: 'Test Restaurant',
        cuisineType: '',
        mealType: 'dinner' as const,
        reservationDate: null,
        reservationTime: '19:00',
        timezone: '',
        partySize: 2,
        address: '',
        phone: '',
        website: '',
        coordinates: null,
        priceRange: '',
        dressCode: '',
        dietaryRequirements: [],
        specialRequests: '',
        menuUrl: '',
      },
      totalPriceCents: 0,
      taxesAndFeesCents: 0,
      currency: 'CAD',
      pricingType: 'per_person' as const,
      confirmationNumber: '',
      referralUrl: '',
      commissionTotalCents: 0,
      commissionSplitPercentage: 0,
      commissionExpectedDate: null,
      termsAndConditions: '',
      cancellationPolicy: '',
      supplier: '',
    }

    const payload = toDiningApiPayload(formData)

    expect(payload.commissionExpectedDate).toBeNull()
  })
})
