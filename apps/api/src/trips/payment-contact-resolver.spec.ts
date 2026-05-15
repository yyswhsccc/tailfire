/**
 * Spec for PaymentContactResolver (#361).
 *
 * Pure resolver — strict precedence rule, returns null when nothing matches.
 * No error swallowing per #368 doctrine.
 */
import { PaymentContactResolver } from './payment-contact-resolver'

describe('PaymentContactResolver', () => {
  const resolver = new PaymentContactResolver()

  describe('precedence', () => {
    it('requestedContactId beats all other sources', () => {
      const result = resolver.resolve({
        requestedContactId: 'requested',
        expectedItemContactId: 'epi',
        tripPrimaryContactId: 'trip',
      })
      expect(result).toBe('requested')
    })

    it('expectedItemContactId is used when no override is provided', () => {
      const result = resolver.resolve({
        requestedContactId: null,
        expectedItemContactId: 'epi',
        tripPrimaryContactId: 'trip',
      })
      expect(result).toBe('epi')
    })

    it('falls back to tripPrimaryContactId when item has no contact', () => {
      const result = resolver.resolve({
        expectedItemContactId: null,
        tripPrimaryContactId: 'trip',
      })
      expect(result).toBe('trip')
    })

    it('returns null when every source is empty', () => {
      expect(resolver.resolve({})).toBeNull()
      expect(
        resolver.resolve({
          requestedContactId: null,
          expectedItemContactId: null,
          tripPrimaryContactId: null,
        }),
      ).toBeNull()
    })
  })

  describe('treating empty string as missing', () => {
    it('empty requestedContactId falls through to next source', () => {
      const result = resolver.resolve({
        requestedContactId: '',
        expectedItemContactId: 'epi',
        tripPrimaryContactId: 'trip',
      })
      expect(result).toBe('epi')
    })

    it('empty expectedItemContactId falls through to trip primary', () => {
      const result = resolver.resolve({
        expectedItemContactId: '',
        tripPrimaryContactId: 'trip',
      })
      expect(result).toBe('trip')
    })
  })

  describe('does not throw', () => {
    it('returns null instead of throwing when nothing resolves', () => {
      // Critical: the resolver MUST NOT silently fabricate a fallback
      // (logger.warn + return undefined would be a #368 violation). It MUST
      // return null cleanly so the caller can decide what to do with the
      // missing contact.
      expect(() => resolver.resolve({})).not.toThrow()
      expect(resolver.resolve({})).toBeNull()
    })
  })
})
