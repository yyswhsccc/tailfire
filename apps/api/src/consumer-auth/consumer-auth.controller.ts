/**
 * Consumer Auth Controller
 *
 * Public endpoint for consumer portal registration.
 * No JWT auth required — consumers register via email + magic link.
 */

import { Controller, Post, Body, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
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
   */
  @Post('register')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Register or authenticate a consumer via magic link',
    description: 'Creates a contact and portal account if needed, then returns a magic link URL for passwordless authentication.',
  })
  @ApiResponse({ status: 200, description: 'Magic link generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input (e.g., bad email)' })
  @ApiResponse({ status: 500, description: 'Internal error during registration' })
  async register(@Body() dto: RegisterConsumerDto) {
    return this.consumerAuthService.registerConsumer(dto)
  }
}
