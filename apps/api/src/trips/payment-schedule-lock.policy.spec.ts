/**
 * Spec for PaymentScheduleLockPolicy (#361).
 *
 * Strict-mode policy per CLAUDE.md section 8. These specs lock the
 * contract: locked statuses throw, admin bypasses, isLockedByStatus is
 * the pure predicate.
 */
import { BadRequestException } from '@nestjs/common'
import {
  PaymentScheduleLockPolicy,
  PAYMENT_SCHEDULE_LOCKING_STATUSES,
} from './payment-schedule-lock.policy'

describe('PaymentScheduleLockPolicy', () => {
  const policy = new PaymentScheduleLockPolicy()

  describe('PAYMENT_SCHEDULE_LOCKING_STATUSES', () => {
    it('locks travelling, travelled, cancelled — and nothing else from the canonical trip-status set', () => {
      expect([...PAYMENT_SCHEDULE_LOCKING_STATUSES]).toEqual([
        'travelling',
        'travelled',
        'cancelled',
      ])
    })
  })

  describe('isLockedByStatus', () => {
    it.each(['travelling', 'travelled', 'cancelled'] as const)(
      'returns true for %s',
      (status) => {
        expect(policy.isLockedByStatus(status)).toBe(true)
      },
    )

    it.each(['inbound', 'planning', 'active'] as const)(
      'returns false for %s',
      (status) => {
        expect(policy.isLockedByStatus(status)).toBe(false)
      },
    )

    it('returns false for an unknown status string', () => {
      // Defensive — if a new status is introduced and not yet classified,
      // edits remain ALLOWED (more permissive default). This is the right
      // failure mode: a missed-classification surfaces as users being able
      // to edit a new trip phase, not as users locked out unexpectedly.
      expect(policy.isLockedByStatus('mystery_new_status')).toBe(false)
    })
  })

  describe('assertEditable', () => {
    it('returns silently for an unlocked status', () => {
      expect(() => policy.assertEditable({ tripStatus: 'planning' })).not.toThrow()
    })

    it('throws BadRequestException for a locked status', () => {
      expect(() => policy.assertEditable({ tripStatus: 'travelled' })).toThrow(
        BadRequestException,
      )
    })

    it('throws with a user-actionable message that names the admin escape valve', () => {
      try {
        policy.assertEditable({ tripStatus: 'cancelled' })
        fail('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException)
        const message = (e as BadRequestException).message
        expect(message).toMatch(/departed/i)
        expect(message).toMatch(/admin/i)
      }
    })

    it('admin bypasses the lock for travelled', () => {
      expect(() =>
        policy.assertEditable({ tripStatus: 'travelled', isAdmin: true }),
      ).not.toThrow()
    })

    it('admin bypasses the lock for cancelled', () => {
      expect(() =>
        policy.assertEditable({ tripStatus: 'cancelled', isAdmin: true }),
      ).not.toThrow()
    })

    it('isAdmin=false is identical to omitting the flag', () => {
      expect(() =>
        policy.assertEditable({ tripStatus: 'travelling', isAdmin: false }),
      ).toThrow(BadRequestException)
    })
  })
})
