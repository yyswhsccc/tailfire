import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { ConsumerActivityService } from './consumer-activity.service'
import { TrackEventDto } from './dto/track-event.dto'

@ApiTags('Consumer Activity')
@Controller('consumer-activity')
export class ConsumerActivityController {
  constructor(private readonly service: ConsumerActivityService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Track a consumer browsing event' })
  async trackEvent(@Body() dto: TrackEventDto) {
    await this.service.trackEvent(dto)
  }

  @Get('by-contact/:contactId')
  @ApiOperation({ summary: 'Get consumer activity for a contact (admin use)' })
  async getActivity(
    @Param('contactId') contactId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getActivityForContact(contactId, limit ? parseInt(limit, 10) : 50)
  }

  @Get('insights/:contactId')
  @ApiOperation({ summary: 'Get consumer insights for a contact (admin use)' })
  async getInsights(@Param('contactId') contactId: string) {
    return this.service.getInsightsForContact(contactId)
  }

  @Get('signals/:contactId')
  @ApiOperation({ summary: 'Get purchase signals for a contact (admin use)' })
  async getSignals(@Param('contactId') contactId: string) {
    return this.service.generateSignals(contactId)
  }
}
