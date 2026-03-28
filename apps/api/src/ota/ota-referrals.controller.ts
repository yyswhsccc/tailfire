/**
 * OTA Referrals Controller
 *
 * Referral logging endpoint for the OTA consumer portal.
 * Auth: @Public (bypass JWT) + OtaServiceKeyGuard (x-ota-service-key header).
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiHeader, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { OtaServiceKeyGuard } from './guards/ota-service-key.guard'
import { OtaReferralsService } from './ota-referrals.service'
import { CreateReferralDto } from './dto/create-referral.dto'

@ApiTags('OTA Referrals')
@Controller('ota/referrals')
export class OtaReferralsController {
  constructor(private readonly otaReferralsService: OtaReferralsService) {}

  /**
   * Log a referral session.
   * POST /ota/referrals
   *
   * Called when OTA middleware detects an advisor slug in the URL.
   */
  @Post()
  @Public()
  @UseGuards(OtaServiceKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log a referral session from OTA portal' })
  @ApiHeader({
    name: 'x-ota-service-key',
    description: 'OTA service-to-service key',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Referral logged' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async logReferral(@Body() dto: CreateReferralDto) {
    return this.otaReferralsService.logReferral(dto)
  }
}
