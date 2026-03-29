/**
 * OTA Leads Controller
 *
 * Lead capture endpoint for the OTA consumer portal.
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
import { OtaLeadsService } from './ota-leads.service'
import { CreateLeadDto } from './dto/create-lead.dto'
import { CreateFlightRequestDto } from './dto/create-flight-request.dto'

@ApiTags('OTA Leads')
@Controller('ota/leads')
export class OtaLeadsController {
  constructor(private readonly otaLeadsService: OtaLeadsService) {}

  /**
   * Capture a lead from the OTA consumer portal.
   * POST /ota/leads
   *
   * Called when:
   * - AI concierge captures an email
   * - Contact form is submitted
   * - User inquires about a deal or advisor
   */
  @Post()
  @Public()
  @UseGuards(OtaServiceKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Capture a lead from OTA portal' })
  @ApiHeader({
    name: 'x-ota-service-key',
    description: 'OTA service-to-service key',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Lead captured with attribution' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async captureLead(@Body() dto: CreateLeadDto) {
    return this.otaLeadsService.captureLead(dto)
  }

  /**
   * Submit a flight request from the OTA consumer portal.
   * POST /ota/leads/flight-requests
   *
   * Called when a consumer selects flights and provides contact info.
   * Creates a lead with structured flight data for advisor follow-up.
   */
  @Post('flight-requests')
  @Public()
  @UseGuards(OtaServiceKeyGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a flight request from OTA consumer' })
  @ApiHeader({
    name: 'x-ota-service-key',
    description: 'OTA service-to-service key',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Flight request created' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async createFlightRequest(@Body() dto: CreateFlightRequestDto) {
    return this.otaLeadsService.createFlightRequest(dto)
  }
}
