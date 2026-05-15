import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { AdminOnly } from '../auth/decorators/admin-only.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { OtaServiceKeyGuard } from '../ota/guards/ota-service-key.guard'
import { ConsumerActivityService } from './consumer-activity.service'
import { TrackEventDto } from './dto/track-event.dto'

@ApiTags('Consumer Activity')
@Controller('consumer-activity')
export class ConsumerActivityController {
  constructor(private readonly service: ConsumerActivityService) {}

  @Post()
  @Public()
  @UseGuards(OtaServiceKeyGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track a consumer browsing event' })
  @ApiHeader({ name: 'x-ota-service-key', description: 'OTA service-to-service key', required: true })
  async trackEvent(@Body() dto: TrackEventDto) {
    await this.service.trackEvent(dto)
  }

  @Get('by-contact/:contactId')
  @AdminOnly()
  @ApiOperation({ summary: 'Get consumer activity for a contact (admin use)' })
  async getActivity(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getActivityForContact(contactId, auth.agencyId, limit ? parseInt(limit, 10) : 50)
  }

  @Get('insights/:contactId')
  @AdminOnly()
  @ApiOperation({ summary: 'Get consumer insights for a contact (admin use)' })
  async getInsights(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
  ) {
    return this.service.getInsightsForContact(contactId, auth.agencyId)
  }

  @Get('signals/:contactId')
  @AdminOnly()
  @ApiOperation({ summary: 'Get purchase signals for a contact (admin use)' })
  async getSignals(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
  ) {
    return this.service.generateSignals(contactId, auth.agencyId)
  }
}
