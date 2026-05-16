/**
 * Unit Tests: IcInvoiceController PR-0 V2 money-path gate
 *
 * Verifies that the IC V2 money-path endpoints return 410 Gone when
 * `IC_PAYOUTS_V2_ENABLED=false` (the default while V2 math is being
 * rebuilt). Without this gate, IC v2 silently issues invoices with the
 * gross supplier `received_cents` as the line amount — no fee, split, or
 * tax applied.
 *
 * See PR-0 in docs/runbooks/commission-rebuild-plan.md.
 *
 * Browse/admin endpoints (list invoices, approve/reject/cancel) are NOT
 * gated — those don't compute money and remain open so any in-flight
 * invoices can be cleaned up.
 */

import { GoneException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { IcInvoiceController } from '../ic-invoice.controller'

type MoneyMethod = 'getEligible' | 'submitClaim' | 'getEligibleForAgent' | 'submitClaimForAgent'

const AGENCY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_ID = '11111111-1111-1111-1111-111111111111'
const TARGET_USER_ID = '22222222-2222-2222-2222-222222222222'
const AUTH = { agencyId: AGENCY_ID, userId: USER_ID } as any
const BODY = { selectedCheckItemIds: ['cci-1', 'cci-2'] } as any

function makeController(flagValue: 'true' | 'false' | undefined): {
  controller: IcInvoiceController
  serviceCalls: Record<string, number>
} {
  const serviceCalls = { getEligibleForUser: 0, submitClaim: 0 }
  const mockService = {
    getEligibleForUser: jest.fn(async () => {
      serviceCalls.getEligibleForUser++
      return { ok: true }
    }),
    submitClaim: jest.fn(async () => {
      serviceCalls.submitClaim++
      return { ok: true }
    }),
  } as any
  const mockStorage = {} as any
  const mockConfig = {
    get: jest.fn((key: string) =>
      key === 'IC_PAYOUTS_V2_ENABLED' ? flagValue : undefined
    ),
  } as unknown as ConfigService

  return {
    controller: new IcInvoiceController(mockService, mockStorage, mockConfig),
    serviceCalls,
  }
}

describe('IcInvoiceController PR-0 money-path gate', () => {
  describe('IC_PAYOUTS_V2_ENABLED=false (default — V2 math not ready)', () => {
    const cases: { name: MoneyMethod; invoke: (c: IcInvoiceController) => Promise<unknown> }[] = [
      { name: 'getEligible', invoke: (c) => c.getEligible(AUTH) },
      { name: 'submitClaim', invoke: (c) => c.submitClaim(AUTH, BODY) },
      { name: 'getEligibleForAgent', invoke: (c) => c.getEligibleForAgent(AUTH, TARGET_USER_ID) },
      {
        name: 'submitClaimForAgent',
        invoke: (c) => c.submitClaimForAgent(AUTH, TARGET_USER_ID, BODY),
      },
    ]

    for (const { name, invoke } of cases) {
      it(`${name} → throws GoneException without calling service`, async () => {
        const { controller, serviceCalls } = makeController('false')
        await expect(invoke(controller)).rejects.toThrow(GoneException)
        expect(serviceCalls.getEligibleForUser).toBe(0)
        expect(serviceCalls.submitClaim).toBe(0)
      })
    }

    it('throws the same gate exception when the env var is undefined (defaults to disabled)', async () => {
      const { controller } = makeController(undefined)
      await expect(controller.getEligible(AUTH)).rejects.toThrow(GoneException)
    })

    it('GoneException message references the runbook for context', async () => {
      const { controller } = makeController('false')
      await expect(controller.getEligible(AUTH)).rejects.toThrow(
        /commission-rebuild-plan\.md/
      )
    })
  })

  describe('IC_PAYOUTS_V2_ENABLED=true (V2 ready)', () => {
    it('getEligible delegates to service', async () => {
      const { controller, serviceCalls } = makeController('true')
      await controller.getEligible(AUTH)
      expect(serviceCalls.getEligibleForUser).toBe(1)
    })

    it('submitClaim delegates to service', async () => {
      const { controller, serviceCalls } = makeController('true')
      await controller.submitClaim(AUTH, BODY)
      expect(serviceCalls.submitClaim).toBe(1)
    })

    it('getEligibleForAgent delegates to service', async () => {
      const { controller, serviceCalls } = makeController('true')
      await controller.getEligibleForAgent(AUTH, TARGET_USER_ID)
      expect(serviceCalls.getEligibleForUser).toBe(1)
    })

    it('submitClaimForAgent delegates to service', async () => {
      const { controller, serviceCalls } = makeController('true')
      await controller.submitClaimForAgent(AUTH, TARGET_USER_ID, BODY)
      expect(serviceCalls.submitClaim).toBe(1)
    })
  })
})
