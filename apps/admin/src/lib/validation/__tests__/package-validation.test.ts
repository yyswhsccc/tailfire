/**
 * Package Validation Schema Tests
 *
 * Tests for package form Zod schema and default value hydration.
 * Includes regression tests for pricing persistence (taxes/commission).
 */

import { describe, it, expect } from 'vitest'
import { packageFormSchema, toPackageDefaults, toPackageApiPayload } from '../package-validation'
import type { PackageResponseDto } from '@tailfire/shared-types/api'

describe('toPackageDefaults', () => {
  // ============================================================================
  // Pricing Persistence Regression Tests
  // ============================================================================

  describe('pricing persistence from server response', () => {
    it('should read taxes from pricing.taxesAndFeesCents', () => {
      const serverData = {
        id: 'test-package-id',
        name: 'Test Package',
        status: 'confirmed',
        currency: 'CAD',
        totalPriceCents: 10000,
        pricing: {
          totalPriceCents: 10000,
          taxesAndFeesCents: 5000, // $50 in taxes
          currency: 'CAD',
          pricingType: 'flat_rate',
        },
        packageDetails: null,
        activities: [],
        travelers: [],
        totalPaidCents: 0,
        totalUnpaidCents: 10000,
        tripId: 'test-trip-id',
      } as unknown as PackageResponseDto

      const defaults = toPackageDefaults(serverData as PackageResponseDto)

      expect(defaults.taxesCents).toBe(5000) // Should read from pricing, not default to 0
    })

    it('should read commission from pricing.commissionTotalCents', () => {
      const serverData = {
        id: 'test-package-id',
        name: 'Test Package',
        status: 'confirmed',
        currency: 'CAD',
        totalPriceCents: 10000,
        pricing: {
          totalPriceCents: 10000,
          taxesAndFeesCents: 1000,
          commissionTotalCents: 2500, // $25 commission
          currency: 'CAD',
          pricingType: 'flat_rate',
        },
        packageDetails: null,
        activities: [],
        travelers: [],
        totalPaidCents: 0,
        totalUnpaidCents: 10000,
        tripId: 'test-trip-id',
      } as unknown as PackageResponseDto

      const defaults = toPackageDefaults(serverData as PackageResponseDto)

      expect(defaults.commissionCents).toBe(2500) // Should read from pricing, not default to null
    })

    it('should read commission percentage from pricing.commissionSplitPercentage', () => {
      const serverData = {
        id: 'test-package-id',
        name: 'Test Package',
        status: 'confirmed',
        currency: 'CAD',
        totalPriceCents: 10000,
        pricing: {
          totalPriceCents: 10000,
          taxesAndFeesCents: 1000,
          commissionTotalCents: 2500,
          commissionSplitPercentage: 75.5, // 75.5% split
          currency: 'CAD',
          pricingType: 'flat_rate',
        },
        packageDetails: null,
        activities: [],
        travelers: [],
        totalPaidCents: 0,
        totalUnpaidCents: 10000,
        tripId: 'test-trip-id',
      } as unknown as PackageResponseDto

      const defaults = toPackageDefaults(serverData as PackageResponseDto)

      expect(defaults.commissionPercentage).toBe(75.5) // Should read from pricing
    })

    it('should fallback to serverData.totalPriceCents when pricing is null', () => {
      const serverData = {
        id: 'test-package-id',
        name: 'Test Package',
        status: 'confirmed',
        currency: 'USD',
        totalPriceCents: 15000,
        pricing: null, // No pricing data
        packageDetails: null,
        activities: [],
        travelers: [],
        totalPaidCents: 0,
        totalUnpaidCents: 15000,
        tripId: 'test-trip-id',
      } as unknown as PackageResponseDto

      const defaults = toPackageDefaults(serverData as PackageResponseDto)

      expect(defaults.totalPriceCents).toBe(15000) // Fallback to serverData.totalPriceCents
      expect(defaults.taxesCents).toBe(0) // Fallback to 0 when pricing is null
      expect(defaults.currency).toBe('USD') // Fallback to serverData.currency
    })

    it('should prefer pricing.currency over serverData.currency', () => {
      const serverData = {
        id: 'test-package-id',
        name: 'Test Package',
        status: 'confirmed',
        currency: 'USD', // Root level currency
        totalPriceCents: 10000,
        pricing: {
          totalPriceCents: 10000,
          taxesAndFeesCents: 0,
          currency: 'EUR', // Pricing-level currency should win
          pricingType: 'flat_rate',
        },
        packageDetails: null,
        activities: [],
        travelers: [],
        totalPaidCents: 0,
        totalUnpaidCents: 10000,
        tripId: 'test-trip-id',
      } as unknown as PackageResponseDto

      const defaults = toPackageDefaults(serverData as PackageResponseDto)

      expect(defaults.currency).toBe('EUR') // Should prefer pricing.currency
    })
  })

  // ============================================================================
  // Empty/New Package Tests
  // ============================================================================

  describe('empty/new package defaults', () => {
    it('should return default values when serverData is null', () => {
      const defaults = toPackageDefaults(null)

      expect(defaults.name).toBe('')
      expect(defaults.proposalStatus).toBe('draft')
      expect(defaults.totalPriceCents).toBe(0)
      expect(defaults.taxesCents).toBe(0)
      expect(defaults.currency).toBe('CAD')
      expect(defaults.commissionCents).toBeNull()
      expect(defaults.commissionPercentage).toBeNull()
    })

    it('should return default values when serverData is undefined', () => {
      const defaults = toPackageDefaults(undefined)

      expect(defaults.name).toBe('')
      expect(defaults.totalPriceCents).toBe(0)
      expect(defaults.taxesCents).toBe(0)
    })
  })
})

describe('packageFormSchema', () => {
  // ============================================================================
  // Valid Data Tests
  // ============================================================================

  it('parses valid package data correctly', () => {
    const validData = {
      name: 'Beach Resort Package',
      status: 'confirmed' as const,
      pricingType: 'flat_rate' as const,
      totalPriceCents: 100000,
      taxesCents: 5000,
      currency: 'CAD',
    }

    const result = packageFormSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Beach Resort Package')
      expect(result.data.totalPriceCents).toBe(100000)
      expect(result.data.taxesCents).toBe(5000)
    }
  })

  // ============================================================================
  // Required Fields Tests
  // ============================================================================

  it('rejects empty name', () => {
    const result = packageFormSchema.safeParse({
      name: '',
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
  // Pricing Validation Tests
  // ============================================================================

  it('rejects negative total price', () => {
    const result = packageFormSchema.safeParse({
      name: 'Test Package',
      totalPriceCents: -100,
    })

    expect(result.success).toBe(false)
  })

  it('rejects negative taxes', () => {
    const result = packageFormSchema.safeParse({
      name: 'Test Package',
      taxesCents: -50,
    })

    expect(result.success).toBe(false)
  })

  it('rejects when taxes exceed total price', () => {
    const result = packageFormSchema.safeParse({
      name: 'Test Package',
      totalPriceCents: 100,
      taxesCents: 200, // Taxes greater than total
    })

    expect(result.success).toBe(false)
  })
})

describe('toPackageApiPayload', () => {
  it('includes taxes in API payload', () => {
    const formData = {
      name: 'Test Package',
      proposalStatus: 'draft' as const,
      pricingType: 'flat_rate' as const,
      totalPriceCents: 10000,
      taxesCents: 1500, // Should be included in payload
      currency: 'CAD',
      paymentStatus: 'unpaid' as const,
      description: null,
      confirmationNumber: null,
      groupBookingNumber: null,
      supplierId: null,
      supplierName: null,
      commissionCents: null,
      commissionPercentage: null,
      cancellationPolicy: null,
      cancellationDeadline: null,
      termsAndConditions: null,
      notes: null,
      linkedActivityIds: [],
    }

    const payload = toPackageApiPayload(formData, 'trip-123')

    expect(payload.taxesCents).toBe(1500)
    expect(payload.totalPriceCents).toBe(10000)
  })

  it('includes commission in API payload', () => {
    const formData = {
      name: 'Test Package',
      proposalStatus: 'draft' as const,
      pricingType: 'flat_rate' as const,
      totalPriceCents: 10000,
      taxesCents: 0,
      currency: 'CAD',
      paymentStatus: 'unpaid' as const,
      description: null,
      confirmationNumber: null,
      groupBookingNumber: null,
      supplierId: null,
      supplierName: null,
      commissionCents: 2000, // Should be included as commissionTotalCents
      commissionPercentage: 50.0, // Should be included as commissionSplitPercentage
      cancellationPolicy: null,
      cancellationDeadline: null,
      termsAndConditions: null,
      notes: null,
      linkedActivityIds: [],
    }

    const payload = toPackageApiPayload(formData, 'trip-123')

    expect(payload.commissionTotalCents).toBe(2000)
    expect(payload.commissionSplitPercentage).toBe(50.0)
  })
})
