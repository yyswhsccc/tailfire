/**
 * Unit Tests: ConsumerAuthController — B2 throttling + guard wiring
 *
 * Verifies:
 *   - register() applies @UseGuards(ThrottlerGuard)
 *   - register() applies @Throttle with both 'default' (per-IP) and
 *     'register-email' (per-email) named throttlers
 *   - register() forwards req.ip to the service for Turnstile verification
 *   - register() stays @Public() (no JWT required)
 *
 * Behavioral throttling (5/min IP, 3/min email → 429) is exercised at the
 * service spec level (TurnstileService) and at the integration level (Codex
 * smoke). This spec guards against accidental decorator removal.
 */

import 'reflect-metadata'
import { ThrottlerGuard } from '@nestjs/throttler'
import { ConsumerAuthController } from './consumer-auth.controller'
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator'

// @nestjs/throttler v5 stores per-throttler metadata under
// `${THROTTLER_LIMIT}${name}` and `${THROTTLER_TTL}${name}` (no separator).
// Constants aren't on the package's public surface — use the literal strings.
const THROTTLER_LIMIT = 'THROTTLER:LIMIT'
const THROTTLER_TTL = 'THROTTLER:TTL'

describe('ConsumerAuthController — B2 throttling + guards', () => {
  // ============================================================================
  // Decorator wiring (regression guard against accidental removal)
  // ============================================================================

  describe('register() decorator chain', () => {
    it('applies ThrottlerGuard via @UseGuards', () => {
      const guards = Reflect.getMetadata('__guards__', ConsumerAuthController.prototype.register) ?? []
      const guardNames = guards.map((g: unknown) =>
        typeof g === 'function' ? (g as { name: string }).name : (g as { constructor: { name: string } })?.constructor?.name,
      )
      expect(guardNames).toContain(ThrottlerGuard.name)
    })

    it('configures both default (per-IP) and register-email (per-email) throttlers', () => {
      // @nestjs/throttler v5 stores per-throttler limits/ttls under
      // concatenated metadata keys: `${THROTTLER_LIMIT}${name}` (no separator).
      const target = ConsumerAuthController.prototype.register

      const defaultLimit = Reflect.getMetadata(`${THROTTLER_LIMIT}default`, target)
      const defaultTtl = Reflect.getMetadata(`${THROTTLER_TTL}default`, target)
      const emailLimit = Reflect.getMetadata(`${THROTTLER_LIMIT}register-email`, target)
      const emailTtl = Reflect.getMetadata(`${THROTTLER_TTL}register-email`, target)

      expect(defaultLimit).toBe(5)
      expect(defaultTtl).toBe(60_000)
      expect(emailLimit).toBe(3)
      expect(emailTtl).toBe(60_000)
    })

    it('stays @Public() so the global JwtAuthGuard does not block registration', () => {
      const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, ConsumerAuthController.prototype.register)
      expect(isPublic).toBe(true)
    })
  })

  // ============================================================================
  // Service forwarding (req.ip wired through for Turnstile verification)
  // ============================================================================

  describe('register() forwards req.ip to service', () => {
    it('passes the request IP to ConsumerAuthService.registerConsumer', async () => {
      const service = {
        registerConsumer: jest.fn().mockResolvedValue({ message: 'ok' }),
      }
      const controller = new ConsumerAuthController(service as never)

      const dto = { email: 'jane@example.com', turnstileToken: 'tok' } as never
      const req = { ip: '203.0.113.7' } as never

      await controller.register(dto, req)

      expect(service.registerConsumer).toHaveBeenCalledWith(dto, '203.0.113.7')
    })

    it('passes undefined IP cleanly (e.g. unit test contexts)', async () => {
      const service = {
        registerConsumer: jest.fn().mockResolvedValue({ message: 'ok' }),
      }
      const controller = new ConsumerAuthController(service as never)

      const dto = { email: 'jane@example.com' } as never
      const req = {} as never

      await controller.register(dto, req)

      expect(service.registerConsumer).toHaveBeenCalledWith(dto, undefined)
    })
  })
})
