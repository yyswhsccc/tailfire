/**
 * Portal Auth Guard
 *
 * Protects portal-specific routes by requiring a valid portal JWT.
 * Does NOT check @Public() — always enforces portal auth.
 * Portal endpoints use @Public() only to bypass the global JwtAuthGuard + RolesGuard,
 * not to bypass this guard.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class PortalAuthGuard extends AuthGuard('portal-jwt') {
  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: Error | undefined
  ): TUser {
    if (err || !user) {
      if (info?.message === 'No auth token') {
        throw new UnauthorizedException('Portal authentication required')
      }
      if (info?.message === 'jwt expired') {
        throw new UnauthorizedException('Token expired')
      }
      throw new UnauthorizedException(info?.message || 'Invalid portal token')
    }
    return user
  }
}
