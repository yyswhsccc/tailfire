/**
 * Admin Role Guard
 *
 * Simple guard that requires 'admin' role.
 * Convenience guard for admin-only endpoints.
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import type { AuthContext } from '../auth.types'

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user as AuthContext

    if (!user) {
      throw new ForbiddenException('Authentication required')
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException('Admin access required')
    }

    return true
  }
}
