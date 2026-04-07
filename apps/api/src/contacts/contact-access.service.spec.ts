/**
 * Tests for ContactAccessService
 */

import { Test, TestingModule } from '@nestjs/testing'
import { ContactAccessService, BASIC_VIEW_ALLOWED_FIELDS } from './contact-access.service'
import { DatabaseService } from '../db/database.service'
import type { AuthContext } from '../auth/auth.types'

// Mock data
const mockAgencyId = 'agency-123'
const mockUserId = 'user-123'
const mockOtherUserId = 'user-456'
const mockContactId = 'contact-123'

const createAuth = (overrides: Partial<AuthContext> = {}): AuthContext => ({
  userId: mockUserId,
  agencyId: mockAgencyId,
  role: 'user',
  email: 'agent@test.com',
  userStatus: 'active',
  ...overrides,
})

describe('ContactAccessService', () => {
  let service: ContactAccessService
  let mockDbClient: {
    select: jest.Mock
    from: jest.Mock
    where: jest.Mock
    limit: jest.Mock
  }

  beforeEach(async () => {
    // Create chainable mock
    mockDbClient = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactAccessService,
        {
          provide: DatabaseService,
          useValue: {
            client: mockDbClient,
            schema: {
              contacts: { id: 'id', ownerId: 'ownerId', agencyId: 'agencyId' },
              contactShares: {
                id: 'id',
                contactId: 'contactId',
                sharedWithUserId: 'sharedWithUserId',
                accessLevel: 'accessLevel',
              },
            },
          },
        },
      ],
    }).compile()

    service = module.get<ContactAccessService>(ContactAccessService)
  })

  describe('canAccessSensitiveData', () => {
    it('should grant full access to admin', async () => {
      const auth = createAuth({ role: 'admin' })

      const result = await service.canAccessSensitiveData(mockContactId, auth)

      expect(result).toEqual({
        canAccessBasic: true,
        canAccessSensitive: true,
        reason: 'Admin has full access',
      })
      // Should not query database for admin
      expect(mockDbClient.select).not.toHaveBeenCalled()
    })

    it('should return no access when contact not found', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([])

      const result = await service.canAccessSensitiveData(mockContactId, auth)

      expect(result).toEqual({
        canAccessBasic: false,
        canAccessSensitive: false,
        reason: 'Contact not found',
      })
    })

    it('should return no access for different agency', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([
        { ownerId: mockOtherUserId, agencyId: 'different-agency' },
      ])

      const result = await service.canAccessSensitiveData(mockContactId, auth)

      expect(result).toEqual({
        canAccessBasic: false,
        canAccessSensitive: false,
        reason: 'Contact belongs to different agency',
      })
    })

    it('should grant full access to contact owner', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockUserId, agencyId: mockAgencyId }])

      const result = await service.canAccessSensitiveData(mockContactId, auth)

      expect(result).toEqual({
        canAccessBasic: true,
        canAccessSensitive: true,
        reason: 'User owns this contact',
      })
    })

    it('should grant full access with full share', async () => {
      const auth = createAuth()
      // First query returns contact
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        // Second query returns share
        .mockResolvedValueOnce([{ accessLevel: 'full' }])

      const result = await service.canAccessSensitiveData(mockContactId, auth)

      expect(result).toEqual({
        canAccessBasic: true,
        canAccessSensitive: true,
        reason: 'Full share granted',
      })
    })

    it('should grant basic access with basic share', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([{ accessLevel: 'basic' }])

      const result = await service.canAccessSensitiveData(mockContactId, auth)

      expect(result).toEqual({
        canAccessBasic: true,
        canAccessSensitive: false,
        reason: 'Basic share granted',
      })
    })

    it('should grant basic access to agency-wide contact (no owner)', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: null, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([]) // No share

      const result = await service.canAccessSensitiveData(mockContactId, auth)

      expect(result).toEqual({
        canAccessBasic: true,
        canAccessSensitive: false,
        reason: 'Agency-wide contact (no owner)',
      })
    })

    it('should grant basic access by default for agency members', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([]) // No share

      const result = await service.canAccessSensitiveData(mockContactId, auth)

      expect(result).toEqual({
        canAccessBasic: true,
        canAccessSensitive: false,
        reason: 'Default agency access (basic only)',
      })
    })
  })

  describe('canUseContact', () => {
    it('should allow admin to use any contact', async () => {
      const auth = createAuth({ role: 'admin' })

      const result = await service.canUseContact(mockContactId, auth)

      expect(result).toBe(true)
    })

    it('should deny when contact not found', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([])

      const result = await service.canUseContact(mockContactId, auth)

      expect(result).toBe(false)
    })

    it('should deny for different agency', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([
        { ownerId: mockOtherUserId, agencyId: 'different-agency' },
      ])

      const result = await service.canUseContact(mockContactId, auth)

      expect(result).toBe(false)
    })

    it('should allow owner to use their contact', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([
        { ownerId: mockUserId, agencyId: mockAgencyId },
      ])

      const result = await service.canUseContact(mockContactId, auth)

      expect(result).toBe(true)
    })

    it('should allow anyone to use agency-wide contact', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([
        { ownerId: null, agencyId: mockAgencyId },
      ])

      const result = await service.canUseContact(mockContactId, auth)

      expect(result).toBe(true)
    })

    it('should allow user with share to use contact', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([{ id: 'share-123' }])

      const result = await service.canUseContact(mockContactId, auth)

      expect(result).toBe(true)
    })

    it('should deny non-owner without share', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([]) // No share

      const result = await service.canUseContact(mockContactId, auth)

      expect(result).toBe(false)
    })
  })

  describe('filterSensitiveFields', () => {
    const mockContact = {
      id: mockContactId,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '123-456-7890',
      passportNumber: 'AB123456',
      passportExpiry: '2030-01-01',
      dateOfBirth: '1990-05-15',
      dietaryRequirements: 'Vegetarian',
      marketingEmailOptIn: true,
    } as any

    it('should return all fields when canAccessSensitive is true', () => {
      const result = service.filterSensitiveFields(mockContact, true)

      expect(result).toEqual(mockContact)
    })

    it('should strip sensitive fields when canAccessSensitive is false', () => {
      const result = service.filterSensitiveFields(mockContact, false)

      expect(result.firstName).toBe('John')
      expect(result.lastName).toBe('Doe')
      expect(result.email).toBe('john@example.com')
      expect(result.passportNumber).toBeNull()
      expect(result.passportExpiry).toBeNull()
      expect(result.dateOfBirth).toBeNull()
      expect(result.dietaryRequirements).toBeNull()
      expect(result.marketingEmailOptIn).toBeNull()
    })

    it('should contain all expected allowed fields for basic view', () => {
      expect(BASIC_VIEW_ALLOWED_FIELDS).toContain('id')
      expect(BASIC_VIEW_ALLOWED_FIELDS).toContain('firstName')
      expect(BASIC_VIEW_ALLOWED_FIELDS).toContain('lastName')
      expect(BASIC_VIEW_ALLOWED_FIELDS).toContain('email')
      expect(BASIC_VIEW_ALLOWED_FIELDS).toContain('phone')
      expect(BASIC_VIEW_ALLOWED_FIELDS).toContain('ownerId')
      expect(BASIC_VIEW_ALLOWED_FIELDS).toContain('_accessLevel')
      expect(BASIC_VIEW_ALLOWED_FIELDS).toContain('_ownerName')
      expect(BASIC_VIEW_ALLOWED_FIELDS).toContain('_shareRequestStatus')
    })
  })

  describe('filterSnapshotFields', () => {
    const mockSnapshot = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '123-456-7890',
      gender: 'male',
      passportNumber: 'AB123456',
      dateOfBirth: '1990-05-15',
      dietaryRequirements: 'Vegetarian',
    }

    it('should return null when snapshot is null', () => {
      const result = service.filterSnapshotFields(null, false)
      expect(result).toBeNull()
    })

    it('should return all fields when canAccessSensitive is true', () => {
      const result = service.filterSnapshotFields(mockSnapshot, true)
      expect(result).toEqual(mockSnapshot)
    })

    it('should keep only basic fields when canAccessSensitive is false', () => {
      const result = service.filterSnapshotFields(mockSnapshot, false)

      expect(result).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '123-456-7890',
        gender: 'male',
      })
      expect(result).not.toHaveProperty('passportNumber')
      expect(result).not.toHaveProperty('dateOfBirth')
      expect(result).not.toHaveProperty('dietaryRequirements')
    })
  })
})
