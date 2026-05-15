/**
 * Consumer Auth Module
 *
 * Handles consumer portal authentication:
 * - Email-based registration with magic link
 * - Contact creation (lead/prospecting) for new consumers
 * - Supabase auth user creation with portal_user app_metadata
 */

import { Module } from '@nestjs/common'
import { ConsumerAuthController } from './consumer-auth.controller'
import { ConsumerAuthService } from './consumer-auth.service'
import { TurnstileService } from './turnstile.service'

@Module({
  controllers: [ConsumerAuthController],
  providers: [ConsumerAuthService, TurnstileService],
  exports: [ConsumerAuthService],
})
export class ConsumerAuthModule {}
