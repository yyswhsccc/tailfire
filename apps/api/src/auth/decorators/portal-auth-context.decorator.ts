/**
 * Portal Auth Context Decorator
 *
 * Extracts the portal user context from the request.
 *
 * @example
 * @Get()
 * getProfile(@GetPortalAuth() auth: PortalAuthContext) {
 *   return this.portalService.getProfile(auth.contactId);
 * }
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { PortalAuthContext } from '../auth.types'

export const GetPortalAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalAuthContext => {
    const request = ctx.switchToHttp().getRequest()
    return request.user as PortalAuthContext
  }
)
