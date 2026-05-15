/**
 * Spec for ActivityTravelerAssignmentPolicy (#359).
 *
 * Establishes the contract for the policy that owns every "fan trip
 * travelers across activities" rule. Each test corresponds to one of the
 * three call sites the policy replaces:
 *
 *   - tryAssignAllTripTravelersToActivity → ActivitiesService.create
 *   - tryEnsureActivityHasAssignments     → ActivityBookingsService.markAsBooked
 *   - tryAssignTravelerToAllTripActivities → TripTravelersService.create
 */
import { ActivityTravelerAssignmentPolicy } from './activity-traveler-assignment.policy'

type MockDb = {
  client: {
    execute: jest.Mock
    select: jest.Mock
  }
  schema: any
}

function buildMockDb(opts: { existingAssignments?: number } = {}): MockDb {
  const limit = jest.fn().mockResolvedValue(
    Array.from({ length: opts.existingAssignments ?? 0 }, (_, i) => ({ id: `r-${i}` })),
  )
  const where = jest.fn().mockReturnValue({ limit })
  const from = jest.fn().mockReturnValue({ where })
  return {
    client: {
      execute: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockReturnValue({ from }),
    },
    schema: {
      activityTravelers: { activityId: 'activity_id', id: 'id' },
    },
  }
}

describe('ActivityTravelerAssignmentPolicy', () => {
  describe('tryAssignAllTripTravelersToActivity', () => {
    it('executes the INSERT and resolves cleanly', async () => {
      const db = buildMockDb()
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      await policy.tryAssignAllTripTravelersToActivity('activity-1', 'trip-1')

      expect(db.client.execute).toHaveBeenCalledTimes(1)
      // Verify it was given an SQL chunk (drizzle returns an object with .queryChunks).
      expect(db.client.execute.mock.calls[0]![0]).toBeTruthy()
    })

    it('does not throw when execute() rejects (logs and continues)', async () => {
      const db = buildMockDb()
      db.client.execute.mockRejectedValueOnce(new Error('connection lost'))
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      // Silence the warn — we only care it does not throw.
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      await expect(
        policy.tryAssignAllTripTravelersToActivity('activity-1', 'trip-1'),
      ).resolves.toBeUndefined()

      warnSpy.mockRestore()
    })
  })

  describe('tryEnsureActivityHasAssignments', () => {
    it('short-circuits when the activity already has assignments', async () => {
      const db = buildMockDb({ existingAssignments: 1 })
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      const result = await policy.tryEnsureActivityHasAssignments('activity-2', 'trip-1')

      expect(result.skipped).toBe(true)
      expect(db.client.execute).not.toHaveBeenCalled()
    })

    it('delegates to tryAssignAllTripTravelersToActivity when activity has none', async () => {
      const db = buildMockDb({ existingAssignments: 0 })
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      const result = await policy.tryEnsureActivityHasAssignments('activity-3', 'trip-1')

      expect(result.skipped).toBe(false)
      expect(db.client.execute).toHaveBeenCalledTimes(1)
    })
  })

  describe('tryAssignTravelerToAllTripActivities', () => {
    it('executes the fan-out INSERT', async () => {
      const db = buildMockDb()
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      await policy.tryAssignTravelerToAllTripActivities('traveler-1', 'trip-1')

      expect(db.client.execute).toHaveBeenCalledTimes(1)
      expect(db.client.execute.mock.calls[0]![0]).toBeTruthy()
    })

    it('does not throw when execute() rejects', async () => {
      const db = buildMockDb()
      db.client.execute.mockRejectedValueOnce(new Error('boom'))
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      await expect(
        policy.tryAssignTravelerToAllTripActivities('traveler-1', 'trip-1'),
      ).resolves.toBeUndefined()
    })
  })
})
