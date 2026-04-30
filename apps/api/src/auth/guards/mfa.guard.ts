/**
 * MFA Guard
 *
 * Enforces aal2 (MFA-verified) sessions when MFA_REQUIRED=true.
 * Skips: @Public() routes, @BypassMfa() routes, pending users.
 *
 * Registered globally BEFORE ImpersonationGuard so it checks
 * the real admin JWT, not the impersonated context.
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { BYPASS_MFA_KEY } from '../decorators/bypass-mfa.decorator'
import type { AuthContext } from '../auth.types'

@Injectable()
export class MfaGuard implements CanActivate {
  private readonly logger = new Logger(MfaGuard.name)

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Skip if MFA enforcement is off
    if (process.env.MFA_REQUIRED !== 'true') {
      return true
    }

    // Skip for @Public() routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    // Skip for @BypassMfa() routes (MFA enrollment/management)
    const bypassMfa = this.reflector.getAllAndOverride<boolean>(BYPASS_MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (bypassMfa) return true

    const request = context.switchToHttp().getRequest()
    const user = request.user as AuthContext | undefined

    // No user (handled by JwtAuthGuard before this)
    if (!user) return true

    // Pending users skip MFA — they need to set password first
    if (user.userStatus === 'pending') return true

    // Reject aal1 sessions — user must complete MFA verification.
    // The frontend middleware handles enrollment/grace period routing.
    // By the time a request reaches the API, the user should have aal2
    // (or be in grace period, which the frontend allows but the API does not).
    if (user.aal !== 'aal2') {
      this.logger.warn(`MFA verification required for user ${user.userId} (aal=${user.aal})`)
      throw new ForbiddenException('MFA verification required')
    }

    return true
  }
}
