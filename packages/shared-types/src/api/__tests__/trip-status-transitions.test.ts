/**
 * Unit Tests: Trip Status Transitions
 *
 * Tests the canTransitionTripStatus() helper to ensure it correctly validates
 * all legal and illegal state transitions according to the workflow:
 *
 * Inbound → Planning, Cancelled
 * Planning → Inbound, Cancelled
 * Active → Planning, Travelling, Cancelled
 * Travelling → Travelled, Cancelled
 * Travelled → [terminal]
 * Cancelled → Planning (admin un-cancel)
 */

import {
  canTransitionTripStatus,
  type TripStatus,
} from '../trip-status-transitions.js'

describe('canTransitionTripStatus', () => {
  describe('from INBOUND', () => {
    const from: TripStatus = 'inbound'

    it('should allow transition to PLANNING', () => {
      expect(canTransitionTripStatus(from, 'planning')).toBe(true)
    })

    it('should allow transition to CANCELLED', () => {
      expect(canTransitionTripStatus(from, 'cancelled')).toBe(true)
    })

    it('should reject transition to ACTIVE', () => {
      expect(canTransitionTripStatus(from, 'active')).toBe(false)
    })

    it('should reject transition to TRAVELLING', () => {
      expect(canTransitionTripStatus(from, 'travelling')).toBe(false)
    })

    it('should reject transition to TRAVELLED', () => {
      expect(canTransitionTripStatus(from, 'travelled')).toBe(false)
    })

    it('should allow no-op (same status)', () => {
      expect(canTransitionTripStatus(from, 'inbound')).toBe(true)
    })
  })

  describe('from PLANNING', () => {
    const from: TripStatus = 'planning'

    it('should allow transition to INBOUND', () => {
      expect(canTransitionTripStatus(from, 'inbound')).toBe(true)
    })

    it('should allow transition to CANCELLED', () => {
      expect(canTransitionTripStatus(from, 'cancelled')).toBe(true)
    })

    it('should reject transition to ACTIVE', () => {
      expect(canTransitionTripStatus(from, 'active')).toBe(false)
    })

    it('should reject transition to TRAVELLING', () => {
      expect(canTransitionTripStatus(from, 'travelling')).toBe(false)
    })

    it('should reject transition to TRAVELLED', () => {
      expect(canTransitionTripStatus(from, 'travelled')).toBe(false)
    })

    it('should allow no-op (same status)', () => {
      expect(canTransitionTripStatus(from, 'planning')).toBe(true)
    })
  })

  describe('from ACTIVE', () => {
    const from: TripStatus = 'active'

    it('should allow transition to PLANNING', () => {
      expect(canTransitionTripStatus(from, 'planning')).toBe(true)
    })

    it('should allow transition to TRAVELLING', () => {
      expect(canTransitionTripStatus(from, 'travelling')).toBe(true)
    })

    it('should allow transition to CANCELLED', () => {
      expect(canTransitionTripStatus(from, 'cancelled')).toBe(true)
    })

    it('should reject transition to INBOUND', () => {
      expect(canTransitionTripStatus(from, 'inbound')).toBe(false)
    })

    it('should reject transition to TRAVELLED', () => {
      expect(canTransitionTripStatus(from, 'travelled')).toBe(false)
    })

    it('should allow no-op (same status)', () => {
      expect(canTransitionTripStatus(from, 'active')).toBe(true)
    })
  })

  describe('from TRAVELLING', () => {
    const from: TripStatus = 'travelling'

    it('should allow transition to TRAVELLED', () => {
      expect(canTransitionTripStatus(from, 'travelled')).toBe(true)
    })

    it('should allow transition to CANCELLED', () => {
      expect(canTransitionTripStatus(from, 'cancelled')).toBe(true)
    })

    it('should reject transition to INBOUND', () => {
      expect(canTransitionTripStatus(from, 'inbound')).toBe(false)
    })

    it('should reject transition to PLANNING', () => {
      expect(canTransitionTripStatus(from, 'planning')).toBe(false)
    })

    it('should reject transition to ACTIVE', () => {
      expect(canTransitionTripStatus(from, 'active')).toBe(false)
    })

    it('should allow no-op (same status)', () => {
      expect(canTransitionTripStatus(from, 'travelling')).toBe(true)
    })
  })

  describe('from TRAVELLED (terminal state)', () => {
    const from: TripStatus = 'travelled'

    it('should reject transition to INBOUND', () => {
      expect(canTransitionTripStatus(from, 'inbound')).toBe(false)
    })

    it('should reject transition to PLANNING', () => {
      expect(canTransitionTripStatus(from, 'planning')).toBe(false)
    })

    it('should reject transition to ACTIVE', () => {
      expect(canTransitionTripStatus(from, 'active')).toBe(false)
    })

    it('should reject transition to TRAVELLING', () => {
      expect(canTransitionTripStatus(from, 'travelling')).toBe(false)
    })

    it('should reject transition to CANCELLED', () => {
      expect(canTransitionTripStatus(from, 'cancelled')).toBe(false)
    })

    it('should allow no-op (same status)', () => {
      expect(canTransitionTripStatus(from, 'travelled')).toBe(true)
    })
  })

  describe('from CANCELLED (admin un-cancel allowed)', () => {
    const from: TripStatus = 'cancelled'

    it('should allow transition to PLANNING (admin un-cancel)', () => {
      expect(canTransitionTripStatus(from, 'planning')).toBe(true)
    })

    it('should reject transition to INBOUND', () => {
      expect(canTransitionTripStatus(from, 'inbound')).toBe(false)
    })

    it('should reject transition to ACTIVE', () => {
      expect(canTransitionTripStatus(from, 'active')).toBe(false)
    })

    it('should reject transition to TRAVELLING', () => {
      expect(canTransitionTripStatus(from, 'travelling')).toBe(false)
    })

    it('should reject transition to TRAVELLED', () => {
      expect(canTransitionTripStatus(from, 'travelled')).toBe(false)
    })

    it('should allow no-op (same status)', () => {
      expect(canTransitionTripStatus(from, 'cancelled')).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should always allow no-op transitions for all statuses', () => {
      const statuses: TripStatus[] = [
        'inbound',
        'planning',
        'active',
        'travelling',
        'travelled',
        'cancelled',
      ]

      statuses.forEach((status) => {
        expect(canTransitionTripStatus(status, status)).toBe(true)
      })
    })
  })
})
