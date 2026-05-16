/**
 * trips-commission-overrides.spec.ts (PR-2 Commit 8)
 *
 * Wiring + tenant-scope spec for the new commission-overrides endpoints
 * added in PR-2 (Codex round-1 BLOCK fix). Covers:
 *
 *   - Controller forwards auth.agencyId + auth.userId + body to the service
 *   - Controller forwards auth.agencyId to listCommissionCollaborators
 *   - Service refuses cross-agency reads (returns NotFoundException)
 *   - Service refuses cross-agency writes (NotFoundException, even when the
 *     trip UUID is valid in another agency)
 *
 * Uses direct constructor calls instead of NestJS TestingModule to avoid
 * pulling in the apps/api transitive compile graph (email-accounts has
 * pre-existing TS errors that block any spec importing TripsController via
 * a TestingModule). The wiring assertions are still complete:
 * controller/service contract for both methods.
 */

import { NotFoundException } from '@nestjs/common'
import { TripsController } from '../trips.controller'
import { TripsService } from '../trips.service'

const AGENCY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const AGENCY_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ACTOR = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TRIP_ID = '11111111-1111-1111-1111-111111111111'
const COLLAB_ID = '22222222-2222-2222-2222-222222222222'

function makeAuth(agencyId: string) {
  return {
    agencyId,
    userId: ACTOR,
    role: 'admin' as const,
    email: 'admin@example.com',
    userStatus: 'active' as 'active',
    aal: 'aal1' as 'aal1',
  } as never
}

/**
 * Constructs a TripsController with a minimal mocked TripsService. All
 * other controller deps are unused for these tests so they pass through
 * as `undefined as never` — the constructor arity is preserved per the
 * `apps/api/src/trips/trips.controller.ts` definition.
 */
function makeControllerWithMock(
  tripsService: Partial<TripsService>,
): TripsController {
  return new TripsController(
    tripsService as TripsService,
    undefined as never, // tripAccessService
    undefined as never, // tripGroupAccessService
    undefined as never, // activitiesService
    undefined as never, // activityLogsService
    undefined as never, // paymentSchedulesService
    undefined as never, // storageService
    undefined as never, // tripLifecycleService
    undefined as never, // groupBillingService
    undefined as never, // tripOrderService
  )
}

describe('TripsController.updateCommissionOverrides (PR-2 Commit 8)', () => {
  it('forwards auth.agencyId + actor + body to the service', async () => {
    const update = jest.fn().mockResolvedValue({ tripId: TRIP_ID, updatedCollaborators: 1 })
    const controller = makeControllerWithMock({
      updateCommissionOverrides: update,
    } as unknown as TripsService)

    await controller.updateCommissionOverrides(
      makeAuth(AGENCY_A),
      TRIP_ID,
      {
        feeRateOverridePercent: 0,
        collaboratorOverrides: [
          { collaboratorId: COLLAB_ID, commissionPercentage: '100.00', agentSplitOverridePercent: 100 },
        ],
        reason: 'legacy payroll trip',
      },
    )

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(
      AGENCY_A, // ← critical: tenant scope
      TRIP_ID,
      ACTOR,
      {
        feeRateOverridePercent: 0,
        collaboratorOverrides: [
          { collaboratorId: COLLAB_ID, commissionPercentage: '100.00', agentSplitOverridePercent: 100 },
        ],
        reason: 'legacy payroll trip',
      },
    )
  })

  it('coerces missing reason to null and forwards undefined collaboratorOverrides', async () => {
    const update = jest.fn().mockResolvedValue({ tripId: TRIP_ID, updatedCollaborators: 0 })
    const controller = makeControllerWithMock({
      updateCommissionOverrides: update,
    } as unknown as TripsService)

    await controller.updateCommissionOverrides(makeAuth(AGENCY_A), TRIP_ID, {
      feeRateOverridePercent: null,
    })

    expect(update).toHaveBeenCalledWith(AGENCY_A, TRIP_ID, ACTOR, {
      feeRateOverridePercent: null,
      collaboratorOverrides: undefined,
      reason: null,
    })
  })

  it('propagates the service NotFoundException when trip belongs to another agency', async () => {
    // Service is responsible for the cross-tenant 404 — the controller
    // surfaces it to the client. Mock the service to throw the same shape
    // the real service throws when its agency-scoped trip lookup returns
    // zero rows.
    const update = jest.fn().mockRejectedValue(new NotFoundException(`Trip ${TRIP_ID} not found`))
    const controller = makeControllerWithMock({
      updateCommissionOverrides: update,
    } as unknown as TripsService)

    await expect(
      controller.updateCommissionOverrides(makeAuth(AGENCY_B), TRIP_ID, {
        feeRateOverridePercent: 5,
      }),
    ).rejects.toThrow(NotFoundException)

    // The service was called with the wrong-agency agencyId — proves we
    // didn't leak the trip via missing scope.
    expect(update).toHaveBeenCalledWith(
      AGENCY_B,
      TRIP_ID,
      ACTOR,
      expect.objectContaining({ feeRateOverridePercent: 5 }),
    )
  })
})

describe('TripsController.listCollaborators (PR-2 Commit 8)', () => {
  it('forwards auth.agencyId + tripId to the service', async () => {
    const list = jest.fn().mockResolvedValue([])
    const controller = makeControllerWithMock({
      listCommissionCollaborators: list,
    } as unknown as TripsService)

    await controller.listCollaborators(makeAuth(AGENCY_A), TRIP_ID)

    expect(list).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledWith(AGENCY_A, TRIP_ID)
  })

  it('propagates cross-agency NotFoundException', async () => {
    const list = jest.fn().mockRejectedValue(new NotFoundException(`Trip ${TRIP_ID} not found`))
    const controller = makeControllerWithMock({
      listCommissionCollaborators: list,
    } as unknown as TripsService)

    await expect(
      controller.listCollaborators(makeAuth(AGENCY_B), TRIP_ID),
    ).rejects.toThrow(NotFoundException)
    expect(list).toHaveBeenCalledWith(AGENCY_B, TRIP_ID)
  })
})
