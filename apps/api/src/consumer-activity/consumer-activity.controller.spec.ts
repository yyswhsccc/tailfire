/**
 * Unit Tests: ConsumerActivityController — agency scoping (B1)
 *
 * Verifies that:
 * - The three admin endpoints carry the @AdminOnly() decorator
 *   (which composes role metadata + AdminRoleGuard)
 * - The controller forwards the actor's agencyId to the service so the
 *   service-side defense-in-depth check has the data it needs
 *
 * Anonymous 401 is enforced by the global JwtAuthGuard and is not unit-tested
 * here. Cross-agency 403 service behavior is covered in
 * consumer-activity.service.spec.ts.
 */

import 'reflect-metadata'
import { ConsumerActivityController } from './consumer-activity.controller'
import { AdminRoleGuard } from '../auth/guards/admin-role.guard'
import type { AuthContext } from '../auth/auth.types'

const adminAuth = {
  agencyId: 'agency-1',
  userId: 'user-admin',
  role: 'admin',
  email: 'admin@test.com',
  userStatus: 'active',
} as unknown as AuthContext

describe('ConsumerActivityController — B1 admin gating + agency forwarding', () => {
  // ============================================================================
  // @AdminOnly() decorator wiring (regression guard)
  // ============================================================================

  describe('@AdminOnly() decorator', () => {
    const adminEndpoints: Array<keyof ConsumerActivityController> = [
      'getActivity',
      'getInsights',
      'getSignals',
    ]

    it.each(adminEndpoints)(
      '%s requires admin role (roles metadata = ["admin"])',
      (method) => {
        const roles = Reflect.getMetadata('roles', ConsumerActivityController.prototype[method])
        expect(roles).toEqual(['admin'])
      },
    )

    it.each(adminEndpoints)(
      '%s applies AdminRoleGuard',
      (method) => {
        const guards = Reflect.getMetadata('__guards__', ConsumerActivityController.prototype[method]) ?? []
        const guardNames = guards.map((g: unknown) =>
          typeof g === 'function' ? (g as { name: string }).name : g?.constructor?.name,
        )
        expect(guardNames).toContain(AdminRoleGuard.name)
      },
    )

    it('trackEvent (public ingest) is NOT admin-gated', () => {
      const roles = Reflect.getMetadata('roles', ConsumerActivityController.prototype.trackEvent)
      expect(roles).toBeUndefined()
    })
  })

  // ============================================================================
  // Agency forwarding to service (defense-in-depth wiring)
  // ============================================================================

  describe('agency forwarding', () => {
    it('getActivity passes auth.agencyId to service', async () => {
      const service = {
        getActivityForContact: jest.fn().mockResolvedValue([]),
      }
      const controller = new ConsumerActivityController(service as never)

      await controller.getActivity(adminAuth, 'contact-1', '25')

      expect(service.getActivityForContact).toHaveBeenCalledWith('contact-1', 'agency-1', 25)
    })

    it('getInsights passes auth.agencyId to service', async () => {
      const service = {
        getInsightsForContact: jest.fn().mockResolvedValue([]),
      }
      const controller = new ConsumerActivityController(service as never)

      await controller.getInsights(adminAuth, 'contact-1')

      expect(service.getInsightsForContact).toHaveBeenCalledWith('contact-1', 'agency-1')
    })

    it('getSignals passes auth.agencyId to service', async () => {
      const service = {
        generateSignals: jest.fn().mockResolvedValue([]),
      }
      const controller = new ConsumerActivityController(service as never)

      await controller.getSignals(adminAuth, 'contact-1')

      expect(service.generateSignals).toHaveBeenCalledWith('contact-1', 'agency-1')
    })

    it('getActivity defaults limit to 50 when query param absent', async () => {
      const service = {
        getActivityForContact: jest.fn().mockResolvedValue([]),
      }
      const controller = new ConsumerActivityController(service as never)

      await controller.getActivity(adminAuth, 'contact-1')

      expect(service.getActivityForContact).toHaveBeenCalledWith('contact-1', 'agency-1', 50)
    })
  })
})
