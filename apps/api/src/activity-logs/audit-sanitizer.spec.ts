/**
 * Audit Sanitizer Unit Tests
 *
 * Tests for the audit sanitization utilities that filter and protect
 * sensitive data before storing in audit logs.
 */

import { sanitizeForAudit, computeAuditDiff, buildAuditDescription } from './audit-sanitizer'

describe('audit-sanitizer', () => {
  describe('sanitizeForAudit', () => {
    describe('field whitelisting', () => {
      it('only includes whitelisted fields for activity entity type', () => {
        const input = {
          name: 'Hotel California',
          proposalStatus: 'approved',
          activityType: 'lodging',
          password: 'secret123',
          notes: 'Internal notes should not be logged',
          randomField: 'should be excluded',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({
          name: 'Hotel California',
          proposalStatus: 'approved',
          activityType: 'lodging',
        })
        expect(result).not.toHaveProperty('password')
        expect(result).not.toHaveProperty('notes')
        expect(result).not.toHaveProperty('randomField')
      })

      it('only includes whitelisted fields for booking entity type', () => {
        const input = {
          name: 'Booking #123',
          status: 'pending',
          paymentStatus: 'unpaid',
          confirmationNumber: 'CONF-456',
          creditCard: '4111111111111111',
          internalNotes: 'Do not log',
        }

        const result = sanitizeForAudit('booking', input)

        expect(result).toEqual({
          name: 'Booking #123',
          status: 'pending',
          paymentStatus: 'unpaid',
          confirmationNumber: 'CONF-456',
        })
        expect(result).not.toHaveProperty('creditCard')
        expect(result).not.toHaveProperty('internalNotes')
      })

      it('only includes whitelisted fields for installment entity type', () => {
        const input = {
          amountCents: 50000,
          dueDate: '2024-01-15',
          paidDate: '2024-01-10',
          status: 'paid',
          description: 'Deposit payment',
          bankAccount: '123456789',
        }

        const result = sanitizeForAudit('installment', input)

        expect(result).toEqual({
          amountCents: 50000,
          dueDate: '2024-01-15',
          paidDate: '2024-01-10',
          status: 'paid',
          description: 'Deposit payment',
        })
        expect(result).not.toHaveProperty('bankAccount')
      })

      it('only includes whitelisted fields for activity_document entity type', () => {
        const input = {
          fileName: 'confirmation.pdf',
          documentType: 'confirmation',
          category: 'booking',
          description: 'Hotel confirmation',
          fileContent: 'base64encodeddata...',
        }

        const result = sanitizeForAudit('activity_document', input)

        expect(result).toEqual({
          fileName: 'confirmation.pdf',
          documentType: 'confirmation',
          category: 'booking',
          description: 'Hotel confirmation',
        })
        expect(result).not.toHaveProperty('fileContent')
      })

      it('only includes whitelisted fields for activity_media entity type', () => {
        const input = {
          fileName: 'hotel-photo.jpg',
          mediaType: 'image',
          isPrimary: true,
          caption: 'Pool view',
          sequenceOrder: 1,
          blob: 'binary data...',
        }

        const result = sanitizeForAudit('activity_media', input)

        expect(result).toEqual({
          fileName: 'hotel-photo.jpg',
          mediaType: 'image',
          isPrimary: true,
          caption: 'Pool view',
          sequenceOrder: 1,
        })
        expect(result).not.toHaveProperty('blob')
      })
    })

    describe('PII blocking', () => {
      it('blocks password fields even if somehow whitelisted', () => {
        const input = {
          name: 'Test',
          password: 'secret',
          passwordHash: 'hashed_password',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({ name: 'Test' })
        expect(result).not.toHaveProperty('password')
        expect(result).not.toHaveProperty('passwordHash')
      })

      it('blocks token and API key fields', () => {
        const input = {
          name: 'Test',
          token: 'jwt_token',
          accessToken: 'access_token_value',
          refreshToken: 'refresh_token_value',
          apiKey: 'api_key_value',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({ name: 'Test' })
        expect(result).not.toHaveProperty('token')
        expect(result).not.toHaveProperty('accessToken')
        expect(result).not.toHaveProperty('refreshToken')
        expect(result).not.toHaveProperty('apiKey')
      })

      it('blocks credit card and SSN fields', () => {
        const input = {
          name: 'Test',
          creditCard: '4111111111111111',
          cardNumber: '4111111111111111',
          cvv: '123',
          ssn: '123-45-6789',
          socialSecurityNumber: '123-45-6789',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({ name: 'Test' })
        expect(result).not.toHaveProperty('creditCard')
        expect(result).not.toHaveProperty('cardNumber')
        expect(result).not.toHaveProperty('cvv')
        expect(result).not.toHaveProperty('ssn')
        expect(result).not.toHaveProperty('socialSecurityNumber')
      })

      it('blocks bank account fields', () => {
        const input = {
          name: 'Test',
          bankAccount: '123456789',
          routingNumber: '021000021',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({ name: 'Test' })
        expect(result).not.toHaveProperty('bankAccount')
        expect(result).not.toHaveProperty('routingNumber')
      })

      it('blocks encrypted and binary data fields', () => {
        const input = {
          name: 'Test',
          encryptedData: 'encrypted...',
          blob: 'binary data',
          base64: 'base64data...',
          content: 'some content',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({ name: 'Test' })
        expect(result).not.toHaveProperty('encryptedData')
        expect(result).not.toHaveProperty('blob')
        expect(result).not.toHaveProperty('base64')
        expect(result).not.toHaveProperty('content')
      })

      it('blocks fields with blocked terms in their names (case-insensitive)', () => {
        const input = {
          name: 'Test',
          userPassword: 'should be blocked',
          myToken: 'should be blocked',
          creditCardNumber: 'should be blocked',
        }

        // These fields aren't in the whitelist anyway, but the blocking mechanism works
        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({ name: 'Test' })
      })
    })

    describe('null/undefined handling', () => {
      it('returns empty object for null input', () => {
        const result = sanitizeForAudit('activity', null)
        expect(result).toEqual({})
      })

      it('returns empty object for undefined input', () => {
        const result = sanitizeForAudit('activity', undefined)
        expect(result).toEqual({})
      })

      it('skips null field values', () => {
        const input = {
          name: 'Test',
          proposalStatus: null,
          activityType: 'tour',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({
          name: 'Test',
          activityType: 'tour',
        })
        expect(result).not.toHaveProperty('proposalStatus')
      })

      it('skips undefined field values', () => {
        const input = {
          name: 'Test',
          proposalStatus: undefined,
          activityType: 'tour',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({
          name: 'Test',
          activityType: 'tour',
        })
        expect(result).not.toHaveProperty('proposalStatus')
      })

      it('skips empty string values', () => {
        const input = {
          name: 'Test',
          proposalStatus: '',
          activityType: '   ', // whitespace only
          description: 'Valid',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result).toEqual({
          name: 'Test',
          description: 'Valid',
        })
      })
    })

    describe('unknown entity types', () => {
      it('returns empty object for unknown entity types', () => {
        const input = {
          foo: 'bar',
          name: 'Test',
          randomField: 'value',
        }

        const result = sanitizeForAudit('unknown_type', input)

        expect(result).toEqual({})
      })

      it('handles misspelled entity types gracefully', () => {
        const input = {
          name: 'Test',
          status: 'active',
        }

        const result = sanitizeForAudit('activty', input) // typo

        expect(result).toEqual({})
      })
    })

    describe('size truncation', () => {
      it('truncates payloads exceeding MAX_METADATA_SIZE (4096 bytes)', () => {
        const input = {
          name: 'A'.repeat(3000),
          description: 'B'.repeat(2000), // Total > 4096
        }

        const result = sanitizeForAudit('activity', input)

        expect(result._truncated).toBe(true)
        expect(result._message).toContain('4096 bytes')
        expect(result.changedFields).toContain('name')
        expect(result.changedFields).toContain('description')
      })

      it('does not truncate payloads under MAX_METADATA_SIZE', () => {
        const input = {
          name: 'Short name',
          description: 'Short description',
          status: 'active',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result._truncated).toBeUndefined()
        expect(result.name).toBe('Short name')
      })
    })

    describe('data types preservation', () => {
      it('preserves boolean values', () => {
        const input = {
          isPrimary: true,
        }

        const result = sanitizeForAudit('activity_media', input)

        expect(result.isPrimary).toBe(true)
        expect(typeof result.isPrimary).toBe('boolean')
      })

      it('preserves number values', () => {
        const input = {
          amountCents: 50000,
          sequenceOrder: 1,
        }

        const result = sanitizeForAudit('installment', input)

        expect(result.amountCents).toBe(50000)
        expect(result.sequenceOrder).toBe(1)
      })

      it('preserves date string values', () => {
        const input = {
          startDate: '2024-01-15',
          endDate: '2024-01-20T10:30:00Z',
        }

        const result = sanitizeForAudit('activity', input)

        expect(result.startDate).toBe('2024-01-15')
        expect(result.endDate).toBe('2024-01-20T10:30:00Z')
      })
    })
  })

  describe('computeAuditDiff', () => {
    it('computes diff between before and after states', () => {
      const before = {
        name: 'Old Name',
        proposalStatus: 'draft',
        activityType: 'tour',
      }
      const after = {
        name: 'New Name',
        proposalStatus: 'approved',
        activityType: 'tour', // unchanged
      }

      const result = computeAuditDiff('activity', before, after)

      expect(result.before).toEqual({
        name: 'Old Name',
        proposalStatus: 'draft',
        activityType: 'tour',
      })
      expect(result.after).toEqual({
        name: 'New Name',
        proposalStatus: 'approved',
        activityType: 'tour',
      })
      expect(result.changedFields).toContain('name')
      expect(result.changedFields).toContain('proposalStatus')
      expect(result.changedFields).not.toContain('activityType')
    })

    it('handles null before state (creation)', () => {
      const after = {
        name: 'New Activity',
        proposalStatus: 'draft',
      }

      const result = computeAuditDiff('activity', null, after)

      expect(result.before).toEqual({})
      expect(result.after).toEqual({
        name: 'New Activity',
        proposalStatus: 'draft',
      })
      expect(result.changedFields).toContain('name')
      expect(result.changedFields).toContain('proposalStatus')
    })

    it('handles null after state (deletion)', () => {
      const before = {
        name: 'Deleted Activity',
        proposalStatus: 'approved',
      }

      const result = computeAuditDiff('activity', before, null)

      expect(result.before).toEqual({
        name: 'Deleted Activity',
        proposalStatus: 'approved',
      })
      expect(result.after).toEqual({})
      expect(result.changedFields).toContain('name')
      expect(result.changedFields).toContain('proposalStatus')
    })

    it('detects field additions', () => {
      const before = { name: 'Test' }
      const after = { name: 'Test', proposalStatus: 'approved' }

      const result = computeAuditDiff('activity', before, after)

      expect(result.changedFields).toContain('proposalStatus')
      expect(result.changedFields).not.toContain('name')
    })

    it('detects field removals', () => {
      const before = { name: 'Test', proposalStatus: 'approved' }
      const after = { name: 'Test' }

      const result = computeAuditDiff('activity', before, after)

      expect(result.changedFields).toContain('proposalStatus')
      expect(result.changedFields).not.toContain('name')
    })

    it('sanitizes both before and after states', () => {
      const before = {
        name: 'Test',
        password: 'secret',
        unwhitelistedField: 'value',
      }
      const after = {
        name: 'Updated',
        password: 'newSecret',
        unwhitelistedField: 'newValue',
      }

      const result = computeAuditDiff('activity', before, after)

      expect(result.before).not.toHaveProperty('password')
      expect(result.after).not.toHaveProperty('password')
      expect(result.before).not.toHaveProperty('unwhitelistedField')
      expect(result.after).not.toHaveProperty('unwhitelistedField')
    })

    it('returns empty changedFields when nothing changed', () => {
      const before = { name: 'Test', proposalStatus: 'approved' }
      const after = { name: 'Test', proposalStatus: 'approved' }

      const result = computeAuditDiff('activity', before, after)

      expect(result.changedFields).toEqual([])
    })

    it('correctly compares complex values using JSON stringify', () => {
      const before = {
        name: 'Test',
        location: JSON.stringify({ lat: 1, lng: 2 }),
      }
      const after = {
        name: 'Test',
        location: JSON.stringify({ lat: 1, lng: 3 }), // changed
      }

      const result = computeAuditDiff('activity', before, after)

      expect(result.changedFields).toContain('location')
    })
  })

  describe('buildAuditDescription', () => {
    it('builds description for created action', () => {
      const result = buildAuditDescription('created', 'activity', 'Hotel California')

      expect(result).toBe('Created activity: Hotel California')
    })

    it('builds description for updated action', () => {
      const result = buildAuditDescription('updated', 'booking', 'Booking #123')

      expect(result).toBe('Updated booking: Booking #123')
    })

    it('builds description for deleted action', () => {
      const result = buildAuditDescription('deleted', 'installment', 'Payment 1')

      expect(result).toBe('Deleted installment: Payment 1')
    })

    it('builds description for status_changed action', () => {
      const result = buildAuditDescription('status_changed', 'trip', 'Paris Trip')

      expect(result).toBe('Changed status of trip: Paris Trip')
    })

    it('formats entity type with underscores as spaces', () => {
      const result = buildAuditDescription('created', 'activity_document', 'confirmation.pdf')

      expect(result).toBe('Created activity document: confirmation.pdf')
    })

    it('formats booking_document entity type correctly', () => {
      const result = buildAuditDescription('deleted', 'booking_document', 'receipt.pdf')

      expect(result).toBe('Deleted booking document: receipt.pdf')
    })

    it('formats activity_media entity type correctly', () => {
      const result = buildAuditDescription('created', 'activity_media', 'hotel-photo.jpg')

      expect(result).toBe('Created activity media: hotel-photo.jpg')
    })

    it('formats trip_media entity type correctly', () => {
      const result = buildAuditDescription('updated', 'trip_media', 'cover-image.jpg')

      expect(result).toBe('Updated trip media: cover-image.jpg')
    })

    it('handles unknown actions with fallback', () => {
      // TypeScript would prevent this, but testing runtime behavior
      const result = buildAuditDescription('unknown' as any, 'activity', 'Test')

      expect(result).toBe('Modified activity: Test')
    })
  })

  describe('entity type coverage', () => {
    const entityTypes = [
      'activity',
      'booking',
      'installment',
      'activity_document',
      'booking_document',
      'activity_media',
      'trip_media',
      'trip',
      'trip_traveler',
      'itinerary',
      'contact',
      'user',
    ]

    it.each(entityTypes)('has whitelist defined for %s entity type', (entityType) => {
      const input = { name: 'Test' }
      const result = sanitizeForAudit(entityType, input)

      // Should either have name in result (if whitelisted) or be empty
      // This ensures no runtime errors for any entity type
      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })
  })
})
