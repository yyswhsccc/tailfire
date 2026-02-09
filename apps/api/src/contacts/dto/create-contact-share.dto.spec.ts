/**
 * Tests for Contact Share DTOs
 */

import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { CreateContactShareDto, UpdateContactShareDto } from './create-contact-share.dto'

describe('CreateContactShareDto', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000'

  describe('sharedWithUserId', () => {
    it('should pass with valid UUID', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: validUuid,
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should fail with invalid UUID', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: 'not-a-uuid',
      })
      const errors = await validate(dto)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]!.property).toBe('sharedWithUserId')
    })

    it('should fail when sharedWithUserId is missing', async () => {
      const dto = plainToInstance(CreateContactShareDto, {})
      const errors = await validate(dto)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]!.property).toBe('sharedWithUserId')
    })
  })

  describe('accessLevel', () => {
    it('should pass with "basic" accessLevel', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: validUuid,
        accessLevel: 'basic',
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should pass with "full" accessLevel', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: validUuid,
        accessLevel: 'full',
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should pass when accessLevel is omitted (optional)', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: validUuid,
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should fail with invalid accessLevel', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: validUuid,
        accessLevel: 'invalid',
      })
      const errors = await validate(dto)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]!.property).toBe('accessLevel')
    })
  })

  describe('notes', () => {
    it('should pass with valid notes', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: validUuid,
        notes: 'Sharing for collaboration',
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should pass when notes is omitted', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: validUuid,
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should fail when notes exceeds 500 characters', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: validUuid,
        notes: 'a'.repeat(501),
      })
      const errors = await validate(dto)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]!.property).toBe('notes')
    })

    it('should pass with exactly 500 characters', async () => {
      const dto = plainToInstance(CreateContactShareDto, {
        sharedWithUserId: validUuid,
        notes: 'a'.repeat(500),
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })
  })
})

describe('UpdateContactShareDto', () => {
  describe('accessLevel', () => {
    it('should pass with "basic" accessLevel', async () => {
      const dto = plainToInstance(UpdateContactShareDto, {
        accessLevel: 'basic',
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should pass with "full" accessLevel', async () => {
      const dto = plainToInstance(UpdateContactShareDto, {
        accessLevel: 'full',
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should pass with empty object (all fields optional)', async () => {
      const dto = plainToInstance(UpdateContactShareDto, {})
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should fail with invalid accessLevel', async () => {
      const dto = plainToInstance(UpdateContactShareDto, {
        accessLevel: 'read',
      })
      const errors = await validate(dto)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]!.property).toBe('accessLevel')
    })
  })

  describe('notes', () => {
    it('should pass with valid notes', async () => {
      const dto = plainToInstance(UpdateContactShareDto, {
        notes: 'Updated notes',
      })
      const errors = await validate(dto)
      expect(errors.length).toBe(0)
    })

    it('should fail when notes exceeds 500 characters', async () => {
      const dto = plainToInstance(UpdateContactShareDto, {
        notes: 'a'.repeat(501),
      })
      const errors = await validate(dto)
      expect(errors.length).toBeGreaterThan(0)
    })
  })
})
