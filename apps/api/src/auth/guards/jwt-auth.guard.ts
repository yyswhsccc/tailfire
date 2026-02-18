/**
 * JWT Auth Guard
 *
 * Protects routes by requiring a valid JWT token.
 * Allows @Public() decorator to bypass authentication.
 */

import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import type { AuthContext } from '../auth.types'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  canActivate(context: ExecutionContext) {
    // Check for @Public() decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    return super.canActivate(context)
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: Error | undefined
  ): TUser {
    if (err || !user) {
      if (info?.message === 'No auth token') {
        throw new UnauthorizedException('Authentication required')
      }
      if (info?.message === 'jwt expired') {
        throw new UnauthorizedException('Token expired')
      }
      throw new UnauthorizedException(info?.message || 'Invalid token')
    }

    // Role isolation: Reject client_portal tokens from staff endpoints.
    // Client portal users must only access @Public() + ClientPortalAuthGuard routes.
    const authUser = user as unknown as AuthContext
    if ((authUser as any).role === 'client_portal') {
      throw new UnauthorizedException('Client portal tokens cannot access staff endpoints')
    }

    // Defense in depth: Block locked users (JWT hook should block, but verify)
    if (authUser.userStatus === 'locked') {
      throw new ForbiddenException('Account is locked')
    }

    return user
  }
}
