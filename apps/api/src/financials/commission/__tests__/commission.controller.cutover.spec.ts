/**
 * Unit Tests: CommissionController — IC_PAYOUTS_V2_ENABLED cutover gate
 *
 * Verifies that:
 * - When flag is undefined or 'false': legacy endpoints work normally
 * - When flag is 'true': payAgents and claimMyCommission throw GoneException
 *   with messages pointing to the new IC payouts endpoints
 */

import { GoneException } from '@nestjs/common'
import { CommissionController } from '../commission.controller'
import type { AuthContext } from '../../../auth/auth.types'

// Minimal auth context stubs (cast via unknown to avoid exhaustive interface stubbing)
const adminAuth = {
  agencyId: 'agency-1',
  userId: 'user-1',
  role: 'admin',
} as unknown as AuthContext

const agentAuth = {
  agencyId: 'agency-1',
  userId: 'user-2',
  role: 'agent',
} as unknown as AuthContext

function makeController(flagValue: string | undefined): CommissionController {
  const configService = {
    get: jest.fn().mockImplementation((key: string) =>
      key === 'IC_PAYOUTS_V2_ENABLED' ? flagValue : undefined,
    ),
  }
  const commissionService = {
    payAgents: jest.fn().mockResolvedValue([]),
  }
  return new CommissionController(
    commissionService as any,
    configService as any,
  )
}

// ============================================================================
// payAgents (POST /commission/due/pay)
// ============================================================================

describe('CommissionController — payAgents cutover gate', () => {
  it('works normally when flag is undefined', async () => {
    const controller = makeController(undefined)
    await expect(
      controller.payAgents(adminAuth, { userIds: ['user-2'] } as any),
    ).resolves.toEqual([])
  })

  it('works normally when flag is "false"', async () => {
    const controller = makeController('false')
    await expect(
      controller.payAgents(adminAuth, { userIds: ['user-2'] } as any),
    ).resolves.toEqual([])
  })

  it('throws GoneException when flag is "true"', async () => {
    const controller = makeController('true')
    await expect(
      controller.payAgents(adminAuth, { userIds: ['user-2'] } as any),
    ).rejects.toThrow(GoneException)
  })

  it('GoneException message mentions IC payouts module when flag is "true"', async () => {
    const controller = makeController('true')
    await expect(
      controller.payAgents(adminAuth, { userIds: ['user-2'] } as any),
    ).rejects.toThrow(/IC payouts module/)
  })

  it('GoneException message mentions /ic-payouts/admin/invoices when flag is "true"', async () => {
    const controller = makeController('true')
    await expect(
      controller.payAgents(adminAuth, { userIds: ['user-2'] } as any),
    ).rejects.toThrow(/\/ic-payouts\/admin\/invoices/)
  })
})

// ============================================================================
// claimMyCommission (POST /commission/claims/me)
// ============================================================================

describe('CommissionController — claimMyCommission cutover gate', () => {
  it('works normally when flag is undefined', async () => {
    const controller = makeController(undefined)
    await expect(
      controller.claimMyCommission(agentAuth),
    ).resolves.toEqual([])
  })

  it('works normally when flag is "false"', async () => {
    const controller = makeController('false')
    await expect(
      controller.claimMyCommission(agentAuth),
    ).resolves.toEqual([])
  })

  it('throws GoneException when flag is "true"', async () => {
    const controller = makeController('true')
    await expect(
      controller.claimMyCommission(agentAuth),
    ).rejects.toThrow(GoneException)
  })

  it('GoneException message mentions /ic-payouts/me/claims when flag is "true"', async () => {
    const controller = makeController('true')
    await expect(
      controller.claimMyCommission(agentAuth),
    ).rejects.toThrow(/\/ic-payouts\/me\/claims/)
  })

  it('GoneException message mentions GET /ic-payouts/me/eligible when flag is "true"', async () => {
    const controller = makeController('true')
    await expect(
      controller.claimMyCommission(agentAuth),
    ).rejects.toThrow(/\/ic-payouts\/me\/eligible/)
  })
})

// ============================================================================
// isIcPayoutsV2Enabled — edge cases
// ============================================================================

describe('CommissionController — isIcPayoutsV2Enabled edge cases', () => {
  it('treats "True" (wrong case) as disabled', async () => {
    const controller = makeController('True')
    await expect(
      controller.claimMyCommission(agentAuth),
    ).resolves.toEqual([])
  })

  it('treats "1" as disabled (only exact "true" activates gate)', async () => {
    const controller = makeController('1')
    await expect(
      controller.payAgents(adminAuth, {} as any),
    ).resolves.toEqual([])
  })
})
