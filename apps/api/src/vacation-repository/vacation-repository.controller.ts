import { Controller, Get, Query, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiHeader, ApiSecurity, ApiQuery } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { CatalogAuthGuard, CatalogThrottleGuard } from '../common/guards'
import { VacationRepositoryService } from './vacation-repository.service'
import { VacationHotelSearchDto } from './dto/vacation-search.dto'

@ApiTags('Vacation Repository')
@Controller('vacation-repository')
@Public() // Bypass global JWT guard - we use our own hybrid auth
@UseGuards(CatalogAuthGuard, CatalogThrottleGuard)
@ApiSecurity('bearer')
@ApiHeader({
  name: 'x-catalog-api-key',
  description: 'Catalog API key for OTA public access (alternative to JWT)',
  required: false,
})
export class VacationRepositoryController {
  constructor(
    private readonly vacationRepository: VacationRepositoryService,
  ) {}

  @Get('gateways')
  async listGateways() {
    return this.vacationRepository.listGateways()
  }

  @Get('destinations')
  @ApiQuery({ name: 'gatewayId', required: false })
  async listDestinations(@Query('gatewayId') gatewayId?: string) {
    return this.vacationRepository.listDestinations(gatewayId)
  }

  @Get('hotels')
  async searchHotels(@Query() dto: VacationHotelSearchDto) {
    return this.vacationRepository.searchHotels(dto)
  }

  @Get('hotels/:id')
  async getHotelDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.vacationRepository.getHotelDetail(id)
  }

  @Get('filters')
  async getFilterOptions() {
    return this.vacationRepository.getFilterOptions()
  }
}
