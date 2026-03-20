import { Controller, Post, Delete, Get, Param, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import { BypassImpersonation } from '../auth/decorators/bypass-impersonation.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ImpersonationService } from './impersonation.service'

@ApiTags('Impersonation')
@Controller('admin/impersonate')
export class ImpersonationController {
  constructor(private readonly impersonationService: ImpersonationService) {}

  @Post(':userId')
  @AdminOnly()
  @HttpCode(HttpStatus.CREATED)
  async start(
    @GetAuthContext() auth: AuthContext,
    @Param('userId') targetUserId: string,
  ) {
    return this.impersonationService.startSession(targetUserId, auth)
  }

  @Post('extend')
  @AdminOnly()
  @BypassImpersonation()
  async extend(@GetAuthContext() auth: AuthContext) {
    return this.impersonationService.extendSession(auth)
  }

  @Delete()
  @AdminOnly()
  @BypassImpersonation()
  @HttpCode(HttpStatus.OK)
  async end(@GetAuthContext() auth: AuthContext) {
    return this.impersonationService.endSession(auth)
  }

  @Get('status')
  @AdminOnly()
  @BypassImpersonation()
  async status(@GetAuthContext() auth: AuthContext) {
    return this.impersonationService.getStatus(auth)
  }
}
