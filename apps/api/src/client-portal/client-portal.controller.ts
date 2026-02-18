/**
 * Client Portal Controller
 *
 * Invitation endpoints (admin auth) and account activation (public + manual JWT).
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient } from '@supabase/supabase-js'
import { Public } from '../auth/decorators/public.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { ClientPortalService } from './client-portal.service'
import { InviteClientDto } from './dto/invite-client.dto'
import { ActivateClientDto } from './dto/activate-client.dto'

@Controller('client-portal')
export class ClientPortalController {
  private readonly supabaseAdmin

  constructor(
    private readonly clientPortalService: ClientPortalService,
    private readonly configService: ConfigService,
  ) {
    this.supabaseAdmin = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    )
  }

  // ==========================================================================
  // Admin-authenticated endpoints (uses existing JwtAuthGuard)
  // ==========================================================================

  @Post('invite')
  async invite(
    @GetAuthContext() auth: AuthContext,
    @Body() dto: InviteClientDto,
  ) {
    return this.clientPortalService.inviteClient(dto, auth.agencyId, auth.userId)
  }

  @Get('invitations')
  async listInvitations(@GetAuthContext() auth: AuthContext) {
    return this.clientPortalService.listInvitations(auth.agencyId)
  }

  @Delete('invitations/:id')
  async revokeInvitation(
    @GetAuthContext() auth: AuthContext,
    @Param('id') id: string,
  ) {
    return this.clientPortalService.revokeInvitation(id, auth.agencyId)
  }

  // ==========================================================================
  // Account activation (public route, manual JWT verification)
  // ==========================================================================

  @Public()
  @Post('activate')
  async activate(
    @Body() dto: ActivateClientDto,
    @Headers('authorization') authHeader: string,
  ) {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header required for activation')
    }

    const token = authHeader.substring(7)

    // Verify the Supabase token to get the user ID
    const { data: { user }, error } = await this.supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired session')
    }

    return this.clientPortalService.activateAccount(dto, user.id)
  }
}
