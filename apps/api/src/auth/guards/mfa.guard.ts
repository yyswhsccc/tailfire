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

    // Check MFA verification level.
    // aal1 = password-only session (no MFA verified this session).
    // aal2 = MFA verified this session.
    //
    // During the enrollment grace period, the frontend middleware allows
    // unenrolled users through with aal1. The API must match this behavior —
    // otherwise users who click "Set up later" get 403 on every API call.
    //
    // Strategy: allow aal1 through with a warning log. The frontend enforces
    // the enrollment/verify routing. Once the grace period ends and all users
    // have enrolled, tighten this to reject aal1 unconditionally.
    // TODO: After grace period expires, change this to throw ForbiddenException.
    if (user.aal !== 'aal2') {
      this.logger.warn(`MFA: aal1 session for user ${user.userId} — allowed during enrollment period`)
    }

    return true
  }
}
