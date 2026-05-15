/**
 * Unit Tests: TurnstileService — B2 CAPTCHA verification
 *
 * Verifies the strict-mode behavior matrix:
 *   TURNSTILE_REQUIRED=true:
 *     - missing token → BadRequestException
 *     - invalid token (siteverify success=false) → BadRequestException
 *     - siteverify network error → BadRequestException (fail-closed)
 *     - valid token → resolves
 *   TURNSTILE_REQUIRED!=true:
 *     - any token (or none) → resolves (dev mode)
 *
 * Startup invariant:
 *   - TURNSTILE_REQUIRED=true + missing TURNSTILE_SECRET → throws on construction
 */

import { BadRequestException, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TurnstileService } from './turnstile.service'

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService
}

describe('TurnstileService — B2 CAPTCHA strict-mode', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  // ============================================================================
  // Startup invariants
  // ============================================================================

  describe('startup', () => {
    it('throws when TURNSTILE_REQUIRED=true but TURNSTILE_SECRET is missing', () => {
      expect(() => new TurnstileService(makeConfig({ TURNSTILE_REQUIRED: 'true' })))
        .toThrow(InternalServerErrorException)
    })

    it('initializes successfully when required + secret present', () => {
      expect(
        () =>
          new TurnstileService(
            makeConfig({ TURNSTILE_REQUIRED: 'true', TURNSTILE_SECRET: 'sk_test_xxx' }),
          ),
      ).not.toThrow()
    })

    it('initializes (with warning) when not required and no secret (dev)', () => {
      expect(() => new TurnstileService(makeConfig({}))).not.toThrow()
    })

    // Codex B2 rework, 2026-05-15: fail-closed when NODE_ENV is strict.
    // A missing/mistyped Doppler var must NOT silently downgrade prod to dev.

    it.each(['production', 'preview', 'staging'])(
      'THROWS in NODE_ENV=%s when TURNSTILE_REQUIRED is unset',
      (env) => {
        expect(
          () => new TurnstileService(makeConfig({ NODE_ENV: env, TURNSTILE_SECRET: 'sk_xxx' })),
        ).toThrow(InternalServerErrorException)
      },
    )

    it.each(['production', 'preview', 'staging'])(
      'THROWS in NODE_ENV=%s when TURNSTILE_REQUIRED=true but TURNSTILE_SECRET is missing',
      (env) => {
        expect(
          () => new TurnstileService(makeConfig({ NODE_ENV: env, TURNSTILE_REQUIRED: 'true' })),
        ).toThrow(InternalServerErrorException)
      },
    )

    it.each(['on', 'yes', '1', 'TRUE', 'True'])(
      'THROWS in NODE_ENV=production when TURNSTILE_REQUIRED is mistyped as %s',
      (bad) => {
        expect(
          () =>
            new TurnstileService(
              makeConfig({ NODE_ENV: 'production', TURNSTILE_REQUIRED: bad, TURNSTILE_SECRET: 'sk' }),
            ),
        ).toThrow(InternalServerErrorException)
      },
    )

    it.each(['production', 'preview', 'staging'])(
      'initializes in NODE_ENV=%s when TURNSTILE_REQUIRED=true and TURNSTILE_SECRET set',
      (env) => {
        expect(
          () =>
            new TurnstileService(
              makeConfig({ NODE_ENV: env, TURNSTILE_REQUIRED: 'true', TURNSTILE_SECRET: 'sk_xxx' }),
            ),
        ).not.toThrow()
      },
    )

    it('NODE_ENV=development tolerates missing secret + missing TURNSTILE_REQUIRED', () => {
      expect(() => new TurnstileService(makeConfig({ NODE_ENV: 'development' }))).not.toThrow()
    })
  })

  // ============================================================================
  // verify() — strict mode
  // ============================================================================

  describe('verify when TURNSTILE_REQUIRED=true', () => {
    let service: TurnstileService

    beforeEach(() => {
      service = new TurnstileService(
        makeConfig({ TURNSTILE_REQUIRED: 'true', TURNSTILE_SECRET: 'sk_test_xxx' }),
      )
    })

    it('rejects missing token', async () => {
      await expect(service.verify(undefined)).rejects.toThrow(BadRequestException)
    })

    it('rejects empty token', async () => {
      await expect(service.verify('')).rejects.toThrow(BadRequestException)
    })

    it('rejects token siteverify says is invalid', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ success: false, 'error-codes': ['invalid-input-response'] }),
      }) as unknown as typeof fetch

      await expect(service.verify('bogus-token')).rejects.toThrow(BadRequestException)
    })

    it('rejects when siteverify network call throws (fail-closed, no silent bypass)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch

      await expect(service.verify('any-token')).rejects.toThrow(BadRequestException)
    })

    it('resolves on valid token', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ success: true, hostname: 'phoenixvoyages.ca' }),
      }) as unknown as typeof fetch

      await expect(service.verify('valid-token')).resolves.toBeUndefined()
    })

    it('passes remoteIp to siteverify when provided', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ success: true }),
      })
      global.fetch = fetchMock as unknown as typeof fetch

      await service.verify('valid-token', '203.0.113.42')

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const callArgs = fetchMock.mock.calls[0]
      expect(callArgs[0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
      expect(callArgs[1].body).toContain('remoteip=203.0.113.42')
      expect(callArgs[1].body).toContain('secret=sk_test_xxx')
      expect(callArgs[1].body).toContain('response=valid-token')
    })
  })

  // ============================================================================
  // verify() — dev mode (CAPTCHA disabled)
  // ============================================================================

  describe('verify when TURNSTILE_REQUIRED!=true (dev mode)', () => {
    it('resolves with no token', async () => {
      const service = new TurnstileService(makeConfig({}))
      await expect(service.verify(undefined)).resolves.toBeUndefined()
    })

    it('resolves even with garbage token (skipped, no network call)', async () => {
      const service = new TurnstileService(makeConfig({}))
      const fetchSpy = jest.fn()
      global.fetch = fetchSpy as unknown as typeof fetch

      await service.verify('whatever')

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('resolves when only TURNSTILE_SECRET is set but TURNSTILE_REQUIRED is not "true"', async () => {
      const service = new TurnstileService(makeConfig({ TURNSTILE_SECRET: 'sk_test_xxx' }))
      const fetchSpy = jest.fn()
      global.fetch = fetchSpy as unknown as typeof fetch

      await service.verify('whatever')

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('resolves when TURNSTILE_REQUIRED=false explicitly', async () => {
      const service = new TurnstileService(makeConfig({ TURNSTILE_REQUIRED: 'false' }))
      await expect(service.verify('whatever')).resolves.toBeUndefined()
    })
  })
})
