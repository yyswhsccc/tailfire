/**
 * Tests for TripAccessService
 */

import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { TripAccessService } from './trip-access.service'
import { DatabaseService } from '../db/database.service'
import type { AuthContext } from '../auth/auth.types'

// Mock data
const mockAgencyId = 'agency-123'
const mockUserId = 'user-123'
const mockOtherUserId = 'user-456'
const mockTripId = 'trip-123'

const createAuth = (overrides: Partial<AuthContext> = {}): AuthContext => ({
  userId: mockUserId,
  agencyId: mockAgencyId,
  role: 'user',
  email: 'agent@test.com',
  userStatus: 'active',
  ...overrides,
})

describe('TripAccessService', () => {
  let service: TripAccessService
  let mockDbClient: {
    select: jest.Mock
    from: jest.Mock
    where: jest.Mock
    limit: jest.Mock
  }

  beforeEach(async () => {
    mockDbClient = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripAccessService,
        {
          provide: DatabaseService,
          useValue: {
            client: mockDbClient,
            schema: {
              trips: {
                id: 'id',
                ownerId: 'ownerId',
                agencyId: 'agencyId',
                status: 'status',
              },
              tripShares: {
                id: 'id',
                tripId: 'tripId',
                sharedWithUserId: 'sharedWithUserId',
                accessLevel: 'accessLevel',
              },
            },
          },
        },
      ],
    }).compile()

    service = module.get<TripAccessService>(TripAccessService)
  })

  describe('canAccessTrip', () => {
    it('should grant full access to admin', async () => {
      const auth = createAuth({ role: 'admin' })

      const result = await service.canAccessTrip(mockTripId, auth)

      expect(result).toEqual({
        canRead: true,
        canWrite: true,
        reason: 'Admin has full access',
      })
      expect(mockDbClient.select).not.toHaveBeenCalled()
    })

    it('should return no access when trip not found', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([])

      const result = await service.canAccessTrip(mockTripId, auth)

      expect(result).toEqual({
        canRead: false,
        canWrite: false,
        reason: 'Trip not found',
      })
    })

    it('should return no access for different agency', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([
        { ownerId: mockOtherUserId, agencyId: 'different-agency' },
      ])

      const result = await service.canAccessTrip(mockTripId, auth)

      expect(result).toEqual({
        canRead: false,
        canWrite: false,
        reason: 'Trip belongs to different agency',
      })
    })

    it('should grant full access to trip owner', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([
        { ownerId: mockUserId, agencyId: mockAgencyId },
      ])

      const result = await service.canAccessTrip(mockTripId, auth)

      expect(result).toEqual({
        canRead: true,
        canWrite: true,
        reason: 'User owns this trip',
      })
    })

    it('should grant read/write access with write share', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([{ accessLevel: 'write' }])

      const result = await service.canAccessTrip(mockTripId, auth)

      expect(result).toEqual({
        canRead: true,
        canWrite: true,
        reason: 'Write share granted',
      })
    })

    it('should grant read-only access with read share', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([{ accessLevel: 'read' }])

      const result = await service.canAccessTrip(mockTripId, auth)

      expect(result).toEqual({
        canRead: true,
        canWrite: false,
        reason: 'Read-only share granted',
      })
    })

    it('should grant read-only access to inbound trip (no owner)', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: null, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([]) // No share

      const result = await service.canAccessTrip(mockTripId, auth)

      expect(result).toEqual({
        canRead: true,
        canWrite: false,
        reason: 'Inbound trip (no owner) - read-only access',
      })
    })

    it('should deny access to other users trips without share', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([]) // No share

      const result = await service.canAccessTrip(mockTripId, auth)

      expect(result).toEqual({
        canRead: false,
        canWrite: false,
        reason: 'No access to this trip',
      })
    })
  })

  describe('canRead', () => {
    it('should return true for admin', async () => {
      const auth = createAuth({ role: 'admin' })

      const result = await service.canRead(mockTripId, auth)

      expect(result).toBe(true)
    })

    it('should return true for owner', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([
        { ownerId: mockUserId, agencyId: mockAgencyId },
      ])

      const result = await service.canRead(mockTripId, auth)

      expect(result).toBe(true)
    })

    it('should return false for non-owner without share', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([])

      const result = await service.canRead(mockTripId, auth)

      expect(result).toBe(false)
    })
  })

  describe('canWrite', () => {
    it('should return true for admin', async () => {
      const auth = createAuth({ role: 'admin' })

      const result = await service.canWrite(mockTripId, auth)

      expect(result).toBe(true)
    })

    it('should return true for owner', async () => {
      const auth = createAuth()
      mockDbClient.limit.mockResolvedValueOnce([
        { ownerId: mockUserId, agencyId: mockAgencyId },
      ])

      const result = await service.canWrite(mockTripId, auth)

      expect(result).toBe(true)
    })

    it('should return false for read-only share', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([{ accessLevel: 'read' }])

      const result = await service.canWrite(mockTripId, auth)

      expect(result).toBe(false)
    })

    it('should return true for write share', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([{ accessLevel: 'write' }])

      const result = await service.canWrite(mockTripId, auth)

      expect(result).toBe(true)
    })
  })

  describe('verifyReadAccess', () => {
    it('should return access result when allowed', async () => {
      const auth = createAuth({ role: 'admin' })

      const result = await service.verifyReadAccess(mockTripId, auth)

      expect(result).toEqual({
        canRead: true,
        canWrite: true,
        reason: 'Admin has full access',
      })
    })

    it('should throw ForbiddenException when not allowed', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([])

      await expect(service.verifyReadAccess(mockTripId, auth)).rejects.toThrow(
        ForbiddenException,
      )
    })
  })

  describe('verifyWriteAccess', () => {
    it('should return access result when allowed', async () => {
      const auth = createAuth({ role: 'admin' })

      const result = await service.verifyWriteAccess(mockTripId, auth)

      expect(result).toEqual({
        canRead: true,
        canWrite: true,
        reason: 'Admin has full access',
      })
    })

    it('should throw ForbiddenException when read-only', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([{ accessLevel: 'read' }])

      await expect(service.verifyWriteAccess(mockTripId, auth)).rejects.toThrow(
        'You have read-only access to this trip',
      )
    })

    it('should throw ForbiddenException with reason when no access', async () => {
      const auth = createAuth()
      mockDbClient.limit
        .mockResolvedValueOnce([{ ownerId: mockOtherUserId, agencyId: mockAgencyId }])
        .mockResolvedValueOnce([])

      await expect(service.verifyWriteAccess(mockTripId, auth)).rejects.toThrow(
        'No access to this trip',
      )
    })
  })

  describe('getAccessibleTripIds', () => {
    it('should return "all" for admin', async () => {
      const auth = createAuth({ role: 'admin' })

      const result = await service.getAccessibleTripIds(auth)

      expect(result).toBe('all')
    })

    it('should combine owned, shared, and inbound trips', async () => {
      const auth = createAuth()
      mockDbClient.limit = jest.fn()

      // Mock the three queries (owned, shared, inbound)
      // Note: getAccessibleTripIds doesn't use .limit(), it returns arrays directly
      const mockSelect = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              { id: 'owned-trip-1' },
              { id: 'owned-trip-2' },
            ]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              { tripId: 'shared-trip-1' },
            ]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              { id: 'inbound-trip-1' },
            ]),
          }),
        })

      mockDbClient.select = mockSelect

      const result = await service.getAccessibleTripIds(auth)

      expect(result).toEqual(
        expect.arrayContaining([
          'owned-trip-1',
          'owned-trip-2',
          'shared-trip-1',
          'inbound-trip-1',
        ]),
      )
      expect((result as string[]).length).toBe(4)
    })

    it('should deduplicate trip IDs', async () => {
      const auth = createAuth()

      const mockSelect = jest.fn()
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              { id: 'trip-1' },
            ]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              { tripId: 'trip-1' }, // Same trip shared
            ]),
          }),
        })
        .mockReturnValueOnce({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        })

      mockDbClient.select = mockSelect

      const result = await service.getAccessibleTripIds(auth)

      expect(result).toEqual(['trip-1'])
    })
  })
})
