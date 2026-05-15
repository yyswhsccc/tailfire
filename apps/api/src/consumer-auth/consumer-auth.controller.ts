/**
 * Consumer Auth Controller
 *
 * Public endpoint for consumer portal registration.
 * No JWT auth required — consumers register via email + magic link.
 */

import { Controller, Post, Body, HttpCode, Req, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { Request } from 'express'
import { Public } from '../auth/decorators/public.decorator'
import { ConsumerAuthService } from './consumer-auth.service'
import { RegisterConsumerDto } from './dto/register-consumer.dto'

@ApiTags('Consumer Auth')
@Controller('consumer-auth')
export class ConsumerAuthController {
  constructor(private readonly consumerAuthService: ConsumerAuthService) {}

  /**
   * Register or re-authenticate a consumer.
   *
   * - New email: creates contact + auth user, returns magic link
   * - Existing contact without portal user: creates auth user, returns magic link
   * - Existing contact with portal user: returns new magic link
   *
   * POST /consumer-auth/register
   *
   * Throttling (B2):
   *   - default tracker (per-IP): 5 attempts / minute
   *   - register-email tracker (per-email): 3 attempts / minute
   * Both must pass; whichever trips first returns 429.
   */
  @Post('register')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: { limit: 5, ttl: 60_000 },
    'register-email': { limit: 3, ttl: 60_000 },
  })
  @HttpCode(200)
  @ApiOperation({
    summary: 'Register or authenticate a consumer via magic link',
    description:
      'Creates a contact and portal account if needed, then returns a magic link URL for passwordless authentication. Rate limited per-IP and per-email; CAPTCHA enforced when TURNSTILE_REQUIRED=true.',
  })
  @ApiResponse({ status: 200, description: 'Magic link generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or failed CAPTCHA' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  @ApiResponse({ status: 500, description: 'Internal error during registration' })
  async register(@Body() dto: RegisterConsumerDto, @Req() req: Request) {
    return this.consumerAuthService.registerConsumer(dto, req.ip)
  }
}
