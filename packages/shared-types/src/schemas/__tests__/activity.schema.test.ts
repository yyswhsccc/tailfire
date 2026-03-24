import { createActivityDtoSchema, updateActivityDtoSchema } from '../activity.schema'
import { activityTypeSchema, activityStatusSchema } from '../enums.schema'

describe('activityTypeSchema', () => {
  it('should accept valid activity types', () => {
    expect(activityTypeSchema.safeParse('tour').success).toBe(true)
    expect(activityTypeSchema.safeParse('flight').success).toBe(true)
    expect(activityTypeSchema.safeParse('lodging').success).toBe(true)
    expect(activityTypeSchema.safeParse('transportation').success).toBe(true)
    expect(activityTypeSchema.safeParse('cruise').success).toBe(true)
    expect(activityTypeSchema.safeParse('dining').success).toBe(true)
    expect(activityTypeSchema.safeParse('options').success).toBe(true)
    expect(activityTypeSchema.safeParse('custom_cruise').success).toBe(true)
    expect(activityTypeSchema.safeParse('port_info').success).toBe(true)
  })

  it('should reject invalid activity types', () => {
    const result = activityTypeSchema.safeParse('invalid_type')
    expect(result.success).toBe(false)
  })
})

describe('activityStatusSchema (proposalStatus)', () => {
  it('should accept valid proposal statuses', () => {
    expect(activityStatusSchema.safeParse('draft').success).toBe(true)
    expect(activityStatusSchema.safeParse('proposing').success).toBe(true)
    expect(activityStatusSchema.safeParse('approved').success).toBe(true)
    expect(activityStatusSchema.safeParse('cancelled').success).toBe(true)
  })

  it('should reject old/invalid statuses', () => {
    expect(activityStatusSchema.safeParse('proposed').success).toBe(false)
    expect(activityStatusSchema.safeParse('confirmed').success).toBe(false)
    expect(activityStatusSchema.safeParse('optional').success).toBe(false)
    expect(activityStatusSchema.safeParse('pending').success).toBe(false)
  })
})

describe('createActivityDtoSchema', () => {
  it('should validate minimal valid payload', () => {
    const payload = {
      itineraryDayId: '123e4567-e89b-12d3-a456-426614174000',
      activityType: 'tour',
      name: 'City Walking Tour',
    }
    const result = createActivityDtoSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('should validate payload with optional/null fields', () => {
    const payload = {
      itineraryDayId: '123e4567-e89b-12d3-a456-426614174000',
      activityType: 'lodging',
      name: 'Hotel Stay',
      description: null,
      startDatetime: null,
      endDatetime: null,
      timezone: null,
      location: 'Downtown',
      address: null,
      coordinates: null,
      notes: null,
      confirmationNumber: null,
      pricingType: null,
      photos: null,
    }
    const result = createActivityDtoSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('should validate payload with all fields populated', () => {
    const payload = {
      itineraryDayId: '123e4567-e89b-12d3-a456-426614174000',
      parentActivityId: '223e4567-e89b-12d3-a456-426614174000',
      activityType: 'tour',
      name: 'Full Day Tour',
      description: 'A comprehensive city tour',
      sequenceOrder: 1,
      startDatetime: '2024-06-15T09:00:00Z',
      endDatetime: '2024-06-15T17:00:00Z',
      timezone: 'America/New_York',
      location: 'Central Park',
      address: '123 Park Ave',
      coordinates: { lat: 40.7829, lng: -73.9654 },
      notes: 'Bring comfortable shoes',
      confirmationNumber: 'CONF123',
      status: 'confirmed',
      pricingType: 'per_person',
      currency: 'USD',
      photos: [{ url: 'https://example.com/photo.jpg', caption: 'Tour start' }],
    }
    const result = createActivityDtoSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('should reject invalid activityType', () => {
    const payload = {
      itineraryDayId: '123e4567-e89b-12d3-a456-426614174000',
      activityType: 'not_a_type',
      name: 'Test',
    }
    const result = createActivityDtoSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('should reject missing required fields', () => {
    const result = createActivityDtoSchema.safeParse({ activityType: 'tour' })
    expect(result.success).toBe(false)
  })

  it('should reject empty name', () => {
    const payload = {
      itineraryDayId: '123e4567-e89b-12d3-a456-426614174000',
      activityType: 'tour',
      name: '',
    }
    const result = createActivityDtoSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('should reject invalid UUID for itineraryDayId', () => {
    const payload = {
      itineraryDayId: 'not-a-uuid',
      activityType: 'tour',
      name: 'Test',
    }
    const result = createActivityDtoSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('should reject invalid currency length', () => {
    const payload = {
      itineraryDayId: '123e4567-e89b-12d3-a456-426614174000',
      activityType: 'tour',
      name: 'Test',
      currency: 'US', // Should be 3 characters
    }
    const result = createActivityDtoSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('should accept valid currency', () => {
    const payload = {
      itineraryDayId: '123e4567-e89b-12d3-a456-426614174000',
      activityType: 'tour',
      name: 'Test',
      currency: 'EUR',
    }
    const result = createActivityDtoSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('should reject invalid coordinates', () => {
    const payload = {
      itineraryDayId: '123e4567-e89b-12d3-a456-426614174000',
      activityType: 'tour',
      name: 'Test',
      coordinates: { lat: 'invalid', lng: -73.9654 },
    }
    const result = createActivityDtoSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })
})

describe('updateActivityDtoSchema', () => {
  it('should accept empty object (all optional)', () => {
    const result = updateActivityDtoSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('should accept partial updates', () => {
    const result = updateActivityDtoSchema.safeParse({ name: 'Updated Name' })
    expect(result.success).toBe(true)
  })

  it('should accept update-only fields', () => {
    const result = updateActivityDtoSchema.safeParse({
      isBooked: true,
      bookingDate: '2024-06-15',
    })
    expect(result.success).toBe(true)
  })

  it('should accept null for nullable fields', () => {
    const result = updateActivityDtoSchema.safeParse({
      description: null,
      startDatetime: null,
      coordinates: null,
      bookingDate: null,
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid activityType in updates', () => {
    const result = updateActivityDtoSchema.safeParse({ activityType: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('should reject negative sequenceOrder', () => {
    const result = updateActivityDtoSchema.safeParse({ sequenceOrder: -1 })
    expect(result.success).toBe(false)
  })
})
