/**
 * Activity Logs Service Integration Tests
 *
 * Tests for the ActivityLogsService that handles audit event logging.
 * Uses mocked DatabaseService to verify correct data insertion.
 */

import { Test, TestingModule } from '@nestjs/testing'
import { ActivityLogsService } from './activity-logs.service'
import { DatabaseService } from '../db/database.service'
import {
  AuditEvent,
  TripCreatedEvent,
  TripUpdatedEvent,
  TripDeletedEvent,
  TravelerCreatedEvent,
  TravelerUpdatedEvent,
  TravelerDeletedEvent,
} from './events'

describe('ActivityLogsService', () => {
  let service: ActivityLogsService
  let mockInsert: jest.Mock
  let mockValues: jest.Mock

  // Mock database insert chain
  beforeEach(async () => {
    mockValues = jest.fn().mockResolvedValue([])
    mockInsert = jest.fn().mockReturnValue({ values: mockValues })

    const mockDbService = {
      client: {
        insert: mockInsert,
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              orderBy: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  offset: jest.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        }),
      },
      schema: {
        activityLogs: { name: 'activity_logs' },
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogsService,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile()

    service = module.get<ActivityLogsService>(ActivityLogsService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('handleAuditEvent', () => {
    describe('activity entity', () => {
      it('logs activity.created event with correct data', async () => {
        const event = new AuditEvent(
          'activity',
          'activity-123',
          'created',
          'trip-456',
          'user-789',
          'Hotel California',
          { subType: 'lodging' }
        )

        await service.handleAuditEvent(event)

        expect(mockInsert).toHaveBeenCalled()
        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'activity',
            entityId: 'activity-123',
            action: 'created',
            actorId: 'user-789',
            actorType: 'user',
            tripId: 'trip-456',
            metadata: { subType: 'lodging' },
          })
        )
      })

      it('logs activity.updated event with before/after diff', async () => {
        const event = new AuditEvent(
          'activity',
          'activity-123',
          'updated',
          'trip-456',
          'user-789',
          'Hotel California',
          {
            before: { name: 'Old Name', proposalStatus: 'draft' },
            after: { name: 'New Name', proposalStatus: 'approved' },
            changedFields: ['name', 'proposalStatus'],
          }
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'activity',
            action: 'updated',
            metadata: {
              before: { name: 'Old Name', proposalStatus: 'draft' },
              after: { name: 'New Name', proposalStatus: 'approved' },
              changedFields: ['name', 'proposalStatus'],
            },
          })
        )
      })

      it('logs activity.deleted event', async () => {
        const event = new AuditEvent(
          'activity',
          'activity-123',
          'deleted',
          'trip-456',
          'user-789',
          'Hotel California'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'activity',
            action: 'deleted',
          })
        )
      })
    })

    describe('booking entity', () => {
      it('logs booking.created event', async () => {
        const event = new AuditEvent(
          'booking',
          'booking-123',
          'created',
          'trip-456',
          'user-789',
          'Booking #123'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'booking',
            entityId: 'booking-123',
            action: 'created',
          })
        )
      })

      it('logs booking.status_changed event', async () => {
        const event = new AuditEvent(
          'booking',
          'booking-123',
          'status_changed',
          'trip-456',
          'user-789',
          'Booking #123',
          {
            before: { status: 'pending' },
            after: { status: 'confirmed' },
          }
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'booking',
            action: 'status_changed',
          })
        )
      })
    })

    describe('installment entity', () => {
      it('logs installment.created event with parentId', async () => {
        const event = new AuditEvent(
          'installment',
          'installment-123',
          'created',
          'trip-456',
          'user-789',
          'Payment 1',
          { parentId: 'booking-123' }
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'installment',
            metadata: { parentId: 'booking-123' },
          })
        )
      })
    })

    describe('document entities', () => {
      it('logs activity_document.created event', async () => {
        const event = new AuditEvent(
          'activity_document',
          'doc-123',
          'created',
          'trip-456',
          'user-789',
          'confirmation.pdf'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'activity_document',
            action: 'created',
          })
        )
      })

      it('logs booking_document.deleted event', async () => {
        const event = new AuditEvent(
          'booking_document',
          'doc-123',
          'deleted',
          'trip-456',
          'user-789',
          'receipt.pdf'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'booking_document',
            action: 'deleted',
          })
        )
      })
    })

    describe('media entities', () => {
      it('logs activity_media.created event', async () => {
        const event = new AuditEvent(
          'activity_media',
          'media-123',
          'created',
          'trip-456',
          'user-789',
          'hotel-photo.jpg'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'activity_media',
            action: 'created',
          })
        )
      })

      it('logs trip_media.updated event', async () => {
        const event = new AuditEvent(
          'trip_media',
          'media-123',
          'updated',
          'trip-456',
          'user-789',
          'cover-image.jpg',
          { before: { isPrimary: false }, after: { isPrimary: true } }
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'trip_media',
            action: 'updated',
          })
        )
      })
    })

    describe('actor attribution', () => {
      it('sets actorType to "user" when actorId is provided', async () => {
        const event = new AuditEvent(
          'activity',
          'activity-123',
          'created',
          'trip-456',
          'user-789',
          'Test Activity'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: 'user-789',
            actorType: 'user',
          })
        )
      })

      it('sets actorType to "system" when actorId is null', async () => {
        const event = new AuditEvent(
          'activity',
          'activity-123',
          'created',
          'trip-456',
          null,
          'Test Activity'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId: null,
            actorType: 'system',
          })
        )
      })
    })

    describe('description generation', () => {
      it('generates correct description for created action', async () => {
        const event = new AuditEvent(
          'activity',
          'activity-123',
          'created',
          'trip-456',
          'user-789',
          'Hotel California'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            description: 'Created activity: Hotel California',
          })
        )
      })

      it('generates correct description for updated action', async () => {
        const event = new AuditEvent(
          'activity',
          'activity-123',
          'updated',
          'trip-456',
          'user-789',
          'Hotel California'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            description: 'Updated activity: Hotel California',
          })
        )
      })

      it('generates correct description for deleted action', async () => {
        const event = new AuditEvent(
          'booking',
          'booking-123',
          'deleted',
          'trip-456',
          'user-789',
          'Booking #456'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            description: 'Deleted booking: Booking #456',
          })
        )
      })

      it('formats entity type with underscores as spaces', async () => {
        const event = new AuditEvent(
          'activity_document',
          'doc-123',
          'created',
          'trip-456',
          'user-789',
          'confirmation.pdf'
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            description: 'Created activity document: confirmation.pdf',
          })
        )
      })
    })

    describe('error handling', () => {
      it('catches database errors without re-throwing', async () => {
        mockValues.mockRejectedValueOnce(new Error('Database connection failed'))

        const event = new AuditEvent(
          'activity',
          'activity-123',
          'created',
          'trip-456',
          'user-789',
          'Test Activity'
        )

        // Should not throw
        await expect(service.handleAuditEvent(event)).resolves.toBeUndefined()
      })

      it('logs error details when database fails', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
        mockValues.mockRejectedValueOnce(new Error('Database error'))

        const event = new AuditEvent(
          'activity',
          'activity-123',
          'created',
          'trip-456',
          'user-789',
          'Test Activity'
        )

        await service.handleAuditEvent(event)

        expect(consoleSpy).toHaveBeenCalledWith(
          '[ActivityLogs] handleAuditEvent - FAILED:',
          expect.objectContaining({
            error: 'Database error',
          })
        )

        consoleSpy.mockRestore()
      })
    })

    describe('metadata handling', () => {
      it('handles undefined metadata gracefully', async () => {
        const event = new AuditEvent(
          'activity',
          'activity-123',
          'created',
          'trip-456',
          'user-789',
          'Test Activity',
          undefined
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: {},
          })
        )
      })

      it('preserves all metadata fields', async () => {
        const metadata = {
          before: { name: 'Old' },
          after: { name: 'New' },
          changedFields: ['name'],
          subType: 'tour',
          parentId: 'parent-123',
          count: 5,
          customField: 'value',
        }

        const event = new AuditEvent(
          'activity',
          'activity-123',
          'updated',
          'trip-456',
          'user-789',
          'Test Activity',
          metadata
        )

        await service.handleAuditEvent(event)

        expect(mockValues).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata,
          })
        )
      })
    })
  })

  describe('handleTripCreated', () => {
    it('logs trip created event', async () => {
      const event: TripCreatedEvent = {
        tripId: 'trip-123',
        tripName: 'Paris Vacation',
        actorId: 'user-456',
        metadata: { tripType: 'leisure' },
      }

      await service.handleTripCreated(event)

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'trip',
          entityId: 'trip-123',
          action: 'created',
          actorId: 'user-456',
          description: 'Created trip "Paris Vacation"',
        })
      )
    })
  })

  describe('handleTripUpdated', () => {
    it('logs trip updated event', async () => {
      const event: TripUpdatedEvent = {
        tripId: 'trip-123',
        tripName: 'Paris Vacation',
        actorId: 'user-456',
        changes: { name: 'Updated Name' },
      }

      await service.handleTripUpdated(event)

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'trip',
          action: 'updated',
          description: 'Updated trip "Paris Vacation"',
        })
      )
    })
  })

  describe('handleTripDeleted', () => {
    it('logs trip deleted event', async () => {
      const event: TripDeletedEvent = {
        tripId: 'trip-123',
        tripName: 'Paris Vacation',
        actorId: 'user-456',
      }

      await service.handleTripDeleted(event)

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'trip',
          action: 'deleted',
          description: 'Deleted trip "Paris Vacation"',
        })
      )
    })
  })

  describe('handleTravelerCreated', () => {
    it('logs traveler created event', async () => {
      const event: TravelerCreatedEvent = {
        travelerId: 'traveler-123',
        tripId: 'trip-456',
        travelerName: 'John Doe',
        actorId: 'user-789',
        metadata: { isPrimaryTraveler: true },
      }

      await service.handleTravelerCreated(event)

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'trip_traveler',
          entityId: 'traveler-123',
          action: 'created',
          description: 'Added traveler "John Doe" to trip',
        })
      )
    })
  })

  describe('handleTravelerUpdated', () => {
    it('logs traveler updated event', async () => {
      const event: TravelerUpdatedEvent = {
        travelerId: 'traveler-123',
        tripId: 'trip-456',
        travelerName: 'John Doe',
        actorId: 'user-789',
        changes: { role: 'primary' },
      }

      await service.handleTravelerUpdated(event)

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'trip_traveler',
          action: 'updated',
          description: 'Updated traveler "John Doe"',
        })
      )
    })
  })

  describe('handleTravelerDeleted', () => {
    it('logs traveler deleted event', async () => {
      const event: TravelerDeletedEvent = {
        travelerId: 'traveler-123',
        tripId: 'trip-456',
        travelerName: 'John Doe',
        actorId: 'user-789',
      }

      await service.handleTravelerDeleted(event)

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'trip_traveler',
          action: 'deleted',
          description: 'Removed traveler "John Doe" from trip',
        })
      )
    })
  })

  describe('getActivityForTrip', () => {
    it('queries activity logs for a trip with default pagination', async () => {
      const mockFrom = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              offset: jest.fn().mockResolvedValue([
                { id: 'log-1', entityType: 'activity', action: 'created' },
                { id: 'log-2', entityType: 'booking', action: 'updated' },
              ]),
            }),
          }),
        }),
      })

      const mockDbService = {
        client: {
          insert: mockInsert,
          select: jest.fn().mockReturnValue({ from: mockFrom }),
        },
        schema: {
          activityLogs: { name: 'activity_logs' },
        },
      }

      const module = await Test.createTestingModule({
        providers: [
          ActivityLogsService,
          { provide: DatabaseService, useValue: mockDbService },
        ],
      }).compile()

      const testService = module.get<ActivityLogsService>(ActivityLogsService)
      const result = await testService.getActivityForTrip('trip-123')

      expect(result).toHaveLength(2)
      expect(mockDbService.client.select).toHaveBeenCalled()
    })
  })
})
