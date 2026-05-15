/**
 * Spec for ActivityTravelerAssignmentPolicy (#359 + #374).
 *
 * Establishes the contract for the policy that owns every "fan trip
 * travelers across activities" rule. Each test corresponds to one of the
 * three call sites the policy replaces:
 *
 *   - tryAssignAllTripTravelersToActivity → ActivitiesService.create
 *   - tryEnsureActivityHasAssignments     → ActivityBookingsService.markAsBooked
 *   - tryAssignTravelerToAllTripActivities → TripTravelersService.create
 *
 * Per #374 (Codex retrospective), all best-effort methods return an
 * explicit { ok, error? } shape so callers can introspect outcomes.
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
    it('executes the INSERT and returns { ok: true }', async () => {
      const db = buildMockDb()
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      const result = await policy.tryAssignAllTripTravelersToActivity('activity-1', 'trip-1')

      expect(result.ok).toBe(true)
      expect(result.error).toBeUndefined()
      expect(db.client.execute).toHaveBeenCalledTimes(1)
      expect(db.client.execute.mock.calls[0]![0]).toBeTruthy()
    })

    it('returns { ok: false, error } when execute() rejects (logs, does not throw)', async () => {
      const db = buildMockDb()
      const boom = new Error('connection lost')
      db.client.execute.mockRejectedValueOnce(boom)
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await policy.tryAssignAllTripTravelersToActivity('activity-1', 'trip-1')

      expect(result.ok).toBe(false)
      expect(result.error).toBe(boom)

      warnSpy.mockRestore()
    })
  })

  describe('tryEnsureActivityHasAssignments', () => {
    it('short-circuits when the activity already has assignments: { ok: true, skipped: true }', async () => {
      const db = buildMockDb({ existingAssignments: 1 })
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      const result = await policy.tryEnsureActivityHasAssignments('activity-2', 'trip-1')

      expect(result.ok).toBe(true)
      expect(result.skipped).toBe(true)
      expect(result.error).toBeUndefined()
      expect(db.client.execute).not.toHaveBeenCalled()
    })

    it('delegates to tryAssignAllTripTravelersToActivity when activity has none: { ok: true, skipped: false }', async () => {
      const db = buildMockDb({ existingAssignments: 0 })
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      const result = await policy.tryEnsureActivityHasAssignments('activity-3', 'trip-1')

      expect(result.ok).toBe(true)
      expect(result.skipped).toBe(false)
      expect(db.client.execute).toHaveBeenCalledTimes(1)
    })

    it('propagates ok:false when the delegated INSERT fails', async () => {
      const db = buildMockDb({ existingAssignments: 0 })
      const boom = new Error('exec failed')
      db.client.execute.mockRejectedValueOnce(boom)
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await policy.tryEnsureActivityHasAssignments('activity-4', 'trip-1')

      expect(result.ok).toBe(false)
      expect(result.skipped).toBe(false)
      expect(result.error).toBe(boom)

      warnSpy.mockRestore()
    })
  })

  describe('tryAssignTravelerToAllTripActivities', () => {
    it('executes the fan-out INSERT and returns { ok: true }', async () => {
      const db = buildMockDb()
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      const result = await policy.tryAssignTravelerToAllTripActivities('traveler-1', 'trip-1')

      expect(result.ok).toBe(true)
      expect(result.error).toBeUndefined()
      expect(db.client.execute).toHaveBeenCalledTimes(1)
      expect(db.client.execute.mock.calls[0]![0]).toBeTruthy()
    })

    it('returns { ok: false, error } when execute() rejects', async () => {
      const db = buildMockDb()
      const boom = new Error('boom')
      db.client.execute.mockRejectedValueOnce(boom)
      const policy = new ActivityTravelerAssignmentPolicy(db as any)

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await policy.tryAssignTravelerToAllTripActivities('traveler-1', 'trip-1')

      expect(result.ok).toBe(false)
      expect(result.error).toBe(boom)

      warnSpy.mockRestore()
    })
  })
})
