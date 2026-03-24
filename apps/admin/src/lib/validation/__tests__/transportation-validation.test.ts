/**
 * Transportation Validation Schema Tests
 *
 * Tests for transportation form Zod schema and default value hydration.
 */

import { describe, it, expect } from 'vitest'
import {
  transportationFormSchema,
  toTransportationDefaults,
  toTransportationApiPayload,
} from '../transportation-validation'

describe('transportationFormSchema', () => {
  // ============================================================================
  // Valid Data Tests
  // ============================================================================

  it('parses valid data correctly', () => {
    const validData = {
      itineraryDayId: 'day-123',
      componentType: 'transportation' as const,
      name: 'Airport Transfer',
      description: 'Transfer from airport to hotel',
      proposalStatus: 'approved' as const,
      transportationDetails: {
        subtype: 'transfer' as const,
        providerName: 'SuperShuttle',
        pickupDate: '2025-01-15',
        pickupTime: '14:00',
      },
      totalPriceCents: 5000,
      currency: 'USD',
    }

    const result = transportationFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.transportationDetails.subtype).toBe('transfer')
      expect(result.data.transportationDetails.providerName).toBe('SuperShuttle')
    }
  })

  // ============================================================================
  // Required Fields Tests
  // ============================================================================

  it('rejects missing required fields', () => {
    const result = transportationFormSchema.safeParse({})

    expect(result.success).toBe(false)
    if (!result.success) {
      const fieldPaths = result.error.issues.map((i) => i.path.join('.'))
      expect(fieldPaths).toContain('itineraryDayId')
    }
  })

  it('requires name field', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: '',
      transportationDetails: {},
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const nameError = result.error.issues.find((i) => i.path.includes('name'))
      expect(nameError).toBeDefined()
    }
  })

  // ============================================================================
  // Subtype Validation Tests
  // ============================================================================

  it('accepts valid transportation subtypes', () => {
    const subtypes = ['transfer', 'car_rental', 'private_car', 'taxi', 'shuttle', 'train', 'ferry', 'bus', 'limousine']

    for (const subtype of subtypes) {
      const result = transportationFormSchema.safeParse({
        itineraryDayId: 'day-123',
        name: 'Test Transportation',
        transportationDetails: {
          subtype,
        },
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid subtype', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {
        subtype: 'helicopter', // Invalid
      },
    })

    expect(result.success).toBe(false)
  })

  it('accepts null subtype', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {
        subtype: null,
      },
    })

    expect(result.success).toBe(true)
  })

  // ============================================================================
  // Number Coercion Tests
  // ============================================================================

  it('coerces string numbers for price fields', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {},
      totalPriceCents: '5000',
      taxesAndFeesCents: '500',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalPriceCents).toBe(5000)
      expect(result.data.taxesAndFeesCents).toBe(500)
    }
  })

  it('rejects negative prices', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {},
      totalPriceCents: -100,
    })

    expect(result.success).toBe(false)
  })

  it('coerces vehicle capacity from string', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {
        vehicleCapacity: '4',
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.transportationDetails.vehicleCapacity).toBe(4)
    }
  })

  // ============================================================================
  // Email Validation Tests
  // ============================================================================

  it('validates provider email format', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {
        providerEmail: 'invalid-email',
      },
    })

    expect(result.success).toBe(false)
  })

  it('accepts valid provider email', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {
        providerEmail: 'provider@example.com',
      },
    })

    expect(result.success).toBe(true)
  })

  it('accepts empty provider email', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {
        providerEmail: '',
      },
    })

    expect(result.success).toBe(true)
  })

  // ============================================================================
  // Features Array Tests
  // ============================================================================

  it('handles features array', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {
        features: ['WiFi', 'Air Conditioning', 'Child Seat'],
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.transportationDetails.features).toHaveLength(3)
      expect(result.data.transportationDetails.features).toContain('WiFi')
    }
  })

  // ============================================================================
  // Status Tests
  // ============================================================================

  it('accepts valid statuses', () => {
    const statuses = ['draft', 'proposing', 'approved', 'cancelled']

    for (const status of statuses) {
      const result = transportationFormSchema.safeParse({
        itineraryDayId: 'day-123',
        name: 'Test Transportation',
        transportationDetails: {},
        proposalStatus: status,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    const result = transportationFormSchema.safeParse({
      itineraryDayId: 'day-123',
      name: 'Test Transportation',
      transportationDetails: {},
      proposalStatus: 'invalid_status',
    })

    expect(result.success).toBe(false)
  })
})

describe('toTransportationDefaults', () => {
  // ============================================================================
  // Default Hydration Tests
  // ============================================================================

  it('creates valid defaults with no server data', () => {
    const defaults = toTransportationDefaults(null)

    expect(defaults.itineraryDayId).toBe('')
    expect(defaults.componentType).toBe('transportation')
    expect(defaults.name).toBe('New Transportation')
    expect(defaults.proposalStatus).toBe('draft')
    expect(defaults.transportationDetails.subtype).toBeNull()
    expect(defaults.currency).toBe('CAD')
  })

  it('respects dayDate parameter for pickup date', () => {
    const dayDate = '2025-06-15'
    const defaults = toTransportationDefaults(null, dayDate)

    expect(defaults.transportationDetails.pickupDate).toBe('2025-06-15')
  })

  it('respects trip currency parameter', () => {
    const defaults = toTransportationDefaults(null, null, 'EUR')

    expect(defaults.currency).toBe('EUR')
  })

  it('hydrates from server data correctly', () => {
    const serverData = {
      itineraryDayId: 'day-456',
      name: 'Airport Shuttle',
      description: 'From server',
      proposalStatus: 'approved' as const,
      transportationDetails: {
        subtype: 'shuttle' as const,
        providerName: 'SuperShuttle',
        pickupDate: '2025-01-20',
        pickupTime: '10:00',
        features: ['WiFi', 'Luggage Space'],
      },
      totalPriceCents: 3500,
      currency: 'USD',
    }

    const defaults = toTransportationDefaults(serverData as any)

    expect(defaults.itineraryDayId).toBe('day-456')
    expect(defaults.name).toBe('Airport Shuttle')
    expect(defaults.proposalStatus).toBe('approved')
    expect(defaults.transportationDetails.subtype).toBe('shuttle')
    expect(defaults.transportationDetails.providerName).toBe('SuperShuttle')
    expect(defaults.transportationDetails.features).toEqual(['WiFi', 'Luggage Space'])
    expect(defaults.totalPriceCents).toBe(3500)
    expect(defaults.currency).toBe('USD')
  })

  it('handles undefined server payload', () => {
    const defaults = toTransportationDefaults(undefined)

    expect(defaults.itineraryDayId).toBe('')
    expect(defaults.name).toBe('New Transportation')
  })
})

describe('toTransportationApiPayload', () => {
  it('maps form data to API payload correctly', () => {
    const formData = {
      itineraryDayId: 'day-123',
      componentType: 'transportation' as const,
      name: 'Airport Transfer',
      description: 'Transfer to hotel',
      proposalStatus: 'approved' as const,
      notes: 'VIP service',
      confirmationNumber: 'TRN123',
      transportationDetails: {
        subtype: 'transfer' as const,
        providerName: 'Luxury Transfers',
        providerPhone: '555-1234',
        providerEmail: 'provider@example.com',
        vehicleType: 'sedan',
        vehicleModel: 'Mercedes S-Class',
        vehicleCapacity: 4,
        licensePlate: 'ABC123',
        pickupDate: '2025-01-15',
        pickupTime: '14:00',
        pickupTimezone: 'America/New_York',
        pickupAddress: '123 Airport Rd',
        pickupNotes: 'Terminal 4',
        pickupName: null,
        pickupLat: null,
        pickupLng: null,
        pickupPlaceId: null,
        dropoffDate: '2025-01-15',
        dropoffTime: '15:30',
        dropoffTimezone: 'America/New_York',
        dropoffAddress: '456 Hotel St',
        dropoffNotes: 'Main entrance',
        dropoffName: null,
        dropoffLat: null,
        dropoffLng: null,
        dropoffPlaceId: null,
        driverName: 'John Driver',
        driverPhone: '555-5678',
        rentalPickupLocation: '',
        rentalDropoffLocation: '',
        rentalInsuranceType: '',
        rentalMileageLimit: '',
        rentalCompany: '',
        rentalBookingRef: '',
        rentalCarClass: '',
        rentalFuelPolicy: '',
        departureStation: '',
        arrivalStation: '',
        features: ['WiFi', 'Air Conditioning'],
        specialRequests: 'Child seat needed',
        flightNumber: 'AA123',
        isRoundTrip: true,
      },
      totalPriceCents: 15000,
      taxesAndFeesCents: 1500,
      currency: 'USD',
      pricingType: 'flat_rate' as const,
      commissionTotalCents: null,
      commissionSplitPercentage: null,
      commissionExpectedDate: null,
      termsAndConditions: 'Transfer terms',
      cancellationPolicy: 'Free cancellation 48h before',
      supplier: 'Luxury Transfers',
    }

    const payload = toTransportationApiPayload(formData)

    expect(payload.itineraryDayId).toBe('day-123')
    expect(payload.componentType).toBe('transportation')
    expect(payload.name).toBe('Airport Transfer')
    expect(payload.transportationDetails!.subtype).toBe('transfer')
    expect(payload.transportationDetails!.providerName).toBe('Luxury Transfers')
    expect(payload.transportationDetails!.features).toEqual(['WiFi', 'Air Conditioning'])
    expect(payload.transportationDetails!.isRoundTrip).toBe(true)
    expect(payload.totalPriceCents).toBe(15000)
  })

  it('handles empty optional fields correctly', () => {
    const formData = {
      itineraryDayId: 'day-123',
      componentType: 'transportation' as const,
      name: 'Basic Transfer',
      description: '',
      proposalStatus: 'draft' as const,
      notes: '',
      confirmationNumber: '',
      transportationDetails: {
        subtype: null,
        providerName: '',
        providerPhone: '',
        providerEmail: '',
        vehicleType: '',
        vehicleModel: '',
        vehicleCapacity: null,
        licensePlate: '',
        pickupDate: null,
        pickupTime: '',
        pickupTimezone: '',
        pickupAddress: '',
        pickupNotes: '',
        pickupName: null,
        pickupLat: null,
        pickupLng: null,
        pickupPlaceId: null,
        dropoffDate: null,
        dropoffTime: '',
        dropoffTimezone: '',
        dropoffAddress: '',
        dropoffNotes: '',
        dropoffName: null,
        dropoffLat: null,
        dropoffLng: null,
        dropoffPlaceId: null,
        driverName: '',
        driverPhone: '',
        rentalPickupLocation: '',
        rentalDropoffLocation: '',
        rentalInsuranceType: '',
        rentalMileageLimit: '',
        rentalCompany: '',
        rentalBookingRef: '',
        rentalCarClass: '',
        rentalFuelPolicy: '',
        departureStation: '',
        arrivalStation: '',
        features: [],
        specialRequests: '',
        flightNumber: '',
        isRoundTrip: false,
      },
      totalPriceCents: null,
      taxesAndFeesCents: null,
      currency: 'CAD',
      pricingType: 'flat_rate' as const,
      commissionTotalCents: null,
      commissionSplitPercentage: null,
      commissionExpectedDate: null,
      termsAndConditions: '',
      cancellationPolicy: '',
      supplier: '',
    }

    const payload = toTransportationApiPayload(formData)

    expect(payload.description).toBeNull()
    expect(payload.notes).toBeNull()
    expect(payload.transportationDetails!.providerName).toBeNull()
    expect(payload.transportationDetails!.pickupDate).toBeNull()
    expect(payload.totalPriceCents).toBeNull()
  })
})
