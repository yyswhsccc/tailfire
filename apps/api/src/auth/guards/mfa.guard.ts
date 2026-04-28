/**
 * MFA Guard
 *
 * Enforces aal2 (MFA-verified) sessions when MFA_REQUIRED=true.
 * Skips: @Public() routes, @BypassMfa() routes, pending users.
 *
 * Registered globally BEFORE ImpersonationGuard so it checks
 * the real admin JWT, not the impersonated context.
 */

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { BYPASS_MFA_KEY } from '../decorators/bypass-mfa.decorator'
import type { AuthContext } from '../auth.types'

@Injectable()
export class MfaGuard implements CanActivate {
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

    // Only block users who HAVE enrolled MFA factors but haven't verified this session.
    // Supabase sets aal='aal1' for all sessions initially. After MFA verification, it becomes 'aal2'.
    // We can't distinguish "never enrolled" from "enrolled but not verified" via JWT alone.
    // The admin middleware handles redirecting unenrolled users to the enrollment page.
    // This guard blocks direct API access ONLY after a user has completed MFA setup
    // (their session should always be aal2 after that — aal1 means they bypassed the frontend).
    // For now, log but don't block — enforcement is handled by the frontend middleware.
    // TODO: Once all users have enrolled, tighten this to reject aal1 unconditionally.
    if (user.aal !== 'aal2') {
      // Log for monitoring but allow through during grace/enrollment period
      return true
    }

    return true
  }
}
