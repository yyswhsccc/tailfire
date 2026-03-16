import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'

/**
 * AdminGuard
 *
 * Restricts access to admin-only endpoints.
 * Checks auth.role from JWT context (set by JwtAuthGuard).
 *
 * Must be used AFTER JwtAuthGuard (which is registered globally).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Admin access required')
    }

    return true
  }
}
