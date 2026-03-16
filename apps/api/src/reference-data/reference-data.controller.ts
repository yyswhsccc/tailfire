import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { AdminGuard } from '../common/guards/admin.guard'
import { ApiTags } from '@nestjs/swagger'
import {
  ReferenceDataService,
  CruiseLineDto,
  CruiseShipDto,
  CruiseRegionDto,
  CruisePortDto,
} from './reference-data.service'

@ApiTags('Reference Data')
@Controller('reference-data')
export class ReferenceDataController {
  constructor(private readonly referenceDataService: ReferenceDataService) {}

  /**
   * Get all cruise lines
   * GET /reference-data/cruise-lines
   */
  @Get('cruise-lines')
  async getCruiseLines(): Promise<CruiseLineDto[]> {
    return this.referenceDataService.getCruiseLines()
  }

  /**
   * Get cruise ships, optionally filtered by cruise line UUID
   * GET /reference-data/cruise-ships
   * GET /reference-data/cruise-ships?cruiseLineId=uuid
   */
  @Get('cruise-ships')
  async getShips(@Query('cruiseLineId') cruiseLineId?: string): Promise<CruiseShipDto[]> {
    return this.referenceDataService.getShips(cruiseLineId)
  }

  /**
   * Get all cruise regions
   * GET /reference-data/cruise-regions
   */
  @Get('cruise-regions')
  async getRegions(): Promise<CruiseRegionDto[]> {
    return this.referenceDataService.getRegions()
  }

  /**
   * Get all cruise ports
   * GET /reference-data/cruise-ports
   */
  @Get('cruise-ports')
  async getPorts(): Promise<CruisePortDto[]> {
    return this.referenceDataService.getPorts()
  }

  /**
   * Get metadata about the reference data
   * GET /reference-data/metadata
   */
  @Get('metadata')
  async getMetadata(): Promise<{ counts: Record<string, number>; cacheStatus: string }> {
    return this.referenceDataService.getMetadata()
  }

  /**
   * Refresh the reference data cache (admin only)
   * POST /reference-data/refresh
   */
  @UseGuards(AdminGuard)
  @Post('refresh')
  async refreshCache(): Promise<{ message: string }> {
    await this.referenceDataService.refreshCache()
    return { message: 'Reference data cache refreshed successfully' }
  }
}
