/**
 * Client Auth Decorator
 *
 * Extracts the client portal auth context from the request.
 * Use in controllers protected by ClientPortalAuthGuard.
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { ClientAuthContext } from '../client-portal-auth.types'

export const GetClientAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientAuthContext => {
    const request = ctx.switchToHttp().getRequest()
    return request.clientAuth as ClientAuthContext
  },
)
