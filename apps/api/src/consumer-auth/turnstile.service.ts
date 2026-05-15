/**
 * Cloudflare Turnstile Verification Service
 *
 * Verifies Turnstile tokens against Cloudflare's siteverify endpoint.
 *
 * Behavior matrix:
 *   TURNSTILE_REQUIRED=true (stg/prd):
 *     - missing/empty token   → BadRequestException (fail-closed, B2)
 *     - invalid token         → BadRequestException
 *     - missing TURNSTILE_SECRET on startup → ConfigurationException (loud)
 *     - valid token           → resolves
 *
 *   TURNSTILE_REQUIRED=false / unset (dev):
 *     - any token              → resolves (logs warning if secret absent)
 *
 * Strict-context per CLAUDE.md §8: registration is auth-adjacent. We never
 * silently swallow CAPTCHA verification failures when TURNSTILE_REQUIRED=true.
 */

import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

interface TurnstileResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name)
  private readonly secret: string | undefined
  private readonly required: boolean

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.get<string>('TURNSTILE_SECRET')
    this.required = this.config.get<string>('TURNSTILE_REQUIRED') === 'true'

    if (this.required && !this.secret) {
      // Fail-loud at startup if production demands Turnstile but secret is missing.
      throw new InternalServerErrorException(
        'TURNSTILE_REQUIRED=true but TURNSTILE_SECRET is not configured',
      )
    }
    if (!this.required) {
      this.logger.warn(
        'Turnstile verification is NOT required (TURNSTILE_REQUIRED!=true). ' +
          'Set TURNSTILE_REQUIRED=true + TURNSTILE_SECRET in stg/prd to enforce CAPTCHA.',
      )
    }
  }

  /**
   * Verify a Turnstile token. Throws BadRequestException when verification
   * fails and Turnstile is required.
   *
   * @param token  cf-turnstile-response token from the client widget
   * @param remoteIp  optional client IP for additional verification context
   */
  async verify(token: string | undefined, remoteIp?: string): Promise<void> {
    if (!this.required) {
      return
    }

    if (!token || typeof token !== 'string' || token.length === 0) {
      throw new BadRequestException('CAPTCHA token is required')
    }

    const body = new URLSearchParams()
    body.set('secret', this.secret as string)
    body.set('response', token)
    if (remoteIp) {
      body.set('remoteip', remoteIp)
    }

    let result: TurnstileResponse
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      result = (await res.json()) as TurnstileResponse
    } catch (err) {
      this.logger.error(`Turnstile siteverify request failed: ${(err as Error).message}`)
      // Strict context — when verification is required and we can't reach Cloudflare,
      // refuse the request rather than silently bypassing.
      throw new BadRequestException('CAPTCHA verification temporarily unavailable')
    }

    if (!result.success) {
      this.logger.warn(`Turnstile rejected token: ${(result['error-codes'] ?? []).join(',')}`)
      throw new BadRequestException('CAPTCHA verification failed')
    }
  }
}
