/**
 * Tests for UserValidationService
 */

import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { UserValidationService } from './user-validation.service'
import { DatabaseService } from '../db/database.service'

// Mock data
const mockAgencyId = 'agency-123'
const mockUserId = 'user-123'
const mockOtherAgencyId = 'agency-456'

describe('UserValidationService', () => {
  let service: UserValidationService
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
        UserValidationService,
        {
          provide: DatabaseService,
          useValue: {
            client: mockDbClient,
            schema: {
              userProfiles: {
                id: 'id',
                agencyId: 'agencyId',
                isActive: 'isActive',
                status: 'status',
              },
            },
          },
        },
      ],
    }).compile()

    service = module.get<UserValidationService>(UserValidationService)
  })

  describe('validateUser', () => {
    it('should return exists=false when user not found', async () => {
      mockDbClient.limit.mockResolvedValueOnce([])

      const result = await service.validateUser(mockUserId, mockAgencyId)

      expect(result).toEqual({
        exists: false,
        belongsToAgency: false,
        isActive: false,
      })
    })

    it('should return correct info when user exists in same agency', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockAgencyId,
          isActive: true,
          status: 'active',
        },
      ])

      const result = await service.validateUser(mockUserId, mockAgencyId)

      expect(result).toEqual({
        exists: true,
        belongsToAgency: true,
        isActive: true,
        userId: mockUserId,
        agencyId: mockAgencyId,
      })
    })

    it('should return belongsToAgency=false when user in different agency', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockOtherAgencyId,
          isActive: true,
          status: 'active',
        },
      ])

      const result = await service.validateUser(mockUserId, mockAgencyId)

      expect(result).toEqual({
        exists: true,
        belongsToAgency: false,
        isActive: true,
        userId: mockUserId,
        agencyId: mockOtherAgencyId,
      })
    })

    it('should return isActive=false when user is not active', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockAgencyId,
          isActive: false,
          status: 'inactive',
        },
      ])

      const result = await service.validateUser(mockUserId, mockAgencyId)

      expect(result).toEqual({
        exists: true,
        belongsToAgency: true,
        isActive: false,
        userId: mockUserId,
        agencyId: mockAgencyId,
      })
    })

    it('should return isActive=false when status is not active', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockAgencyId,
          isActive: true,
          status: 'suspended',
        },
      ])

      const result = await service.validateUser(mockUserId, mockAgencyId)

      expect(result.isActive).toBe(false)
    })
  })

  describe('validateUserInAgency', () => {
    it('should not throw when user exists in agency', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockAgencyId,
          isActive: true,
          status: 'active',
        },
      ])

      await expect(
        service.validateUserInAgency(mockUserId, mockAgencyId),
      ).resolves.not.toThrow()
    })

    it('should throw BadRequestException when user not found', async () => {
      mockDbClient.limit.mockResolvedValueOnce([])

      await expect(
        service.validateUserInAgency(mockUserId, mockAgencyId),
      ).rejects.toThrow(BadRequestException)
      await expect(
        service.validateUserInAgency(mockUserId, mockAgencyId),
      ).rejects.toThrow('User not found')
    })

    it('should throw BadRequestException when user in different agency', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockOtherAgencyId,
          isActive: true,
          status: 'active',
        },
      ])

      await expect(
        service.validateUserInAgency(mockUserId, mockAgencyId),
      ).rejects.toThrow('User does not belong to this agency')
    })

    it('should use custom context in error message', async () => {
      mockDbClient.limit.mockResolvedValueOnce([])

      await expect(
        service.validateUserInAgency(mockUserId, mockAgencyId, 'Target user'),
      ).rejects.toThrow('Target user not found')
    })
  })

  describe('validateActiveUserInAgency', () => {
    it('should not throw when user is active in agency', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockAgencyId,
          isActive: true,
          status: 'active',
        },
      ])

      await expect(
        service.validateActiveUserInAgency(mockUserId, mockAgencyId),
      ).resolves.not.toThrow()
    })

    it('should throw when user not found', async () => {
      mockDbClient.limit.mockResolvedValueOnce([])

      await expect(
        service.validateActiveUserInAgency(mockUserId, mockAgencyId),
      ).rejects.toThrow('User not found')
    })

    it('should throw when user in different agency', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockOtherAgencyId,
          isActive: true,
          status: 'active',
        },
      ])

      await expect(
        service.validateActiveUserInAgency(mockUserId, mockAgencyId),
      ).rejects.toThrow('User does not belong to this agency')
    })

    it('should throw when user is not active', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockAgencyId,
          isActive: false,
          status: 'inactive',
        },
      ])

      await expect(
        service.validateActiveUserInAgency(mockUserId, mockAgencyId),
      ).rejects.toThrow('User is not active')
    })

    it('should use custom context in error message', async () => {
      mockDbClient.limit.mockResolvedValueOnce([
        {
          id: mockUserId,
          agencyId: mockAgencyId,
          isActive: false,
          status: 'inactive',
        },
      ])

      await expect(
        service.validateActiveUserInAgency(mockUserId, mockAgencyId, 'New owner'),
      ).rejects.toThrow('New owner is not active')
    })
  })

  describe('userExistsInAgency', () => {
    it('should return true when user exists in agency', async () => {
      mockDbClient.limit.mockResolvedValueOnce([{ id: mockUserId }])

      const result = await service.userExistsInAgency(mockUserId, mockAgencyId)

      expect(result).toBe(true)
    })

    it('should return false when user not found', async () => {
      mockDbClient.limit.mockResolvedValueOnce([])

      const result = await service.userExistsInAgency(mockUserId, mockAgencyId)

      expect(result).toBe(false)
    })
  })
})
