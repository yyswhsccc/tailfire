/**
 * OTA Search Controller
 *
 * Public search facades for the OTA consumer portal.
 * Exposes existing Amadeus and FusionAPI search capabilities.
 *
 * Auth: @Public (bypass JWT) + OtaServiceKeyGuard (x-ota-service-key header).
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiHeader, ApiResponse } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { OtaServiceKeyGuard } from './guards/ota-service-key.guard'
import { OtaSearchService } from './ota-search.service'

@ApiTags('OTA Search')
@Controller('ota/search')
export class OtaSearchController {
  private readonly logger = new Logger(OtaSearchController.name)

  constructor(private readonly otaSearchService: OtaSearchService) {}

  // ============================================================================
  // Flight Search
  // ============================================================================

  /**
   * Search flight offers.
   * GET /ota/search/flights
   */
  @Get('flights')
  @Public()
  @UseGuards(OtaServiceKeyGuard)
  @ApiOperation({ summary: 'Search flight offers' })
  @ApiHeader({ name: 'x-ota-service-key', required: true, description: 'OTA service-to-service key' })
  @ApiQuery({ name: 'origin', required: true, description: '3-letter IATA origin code', example: 'YYZ' })
  @ApiQuery({ name: 'destination', required: true, description: '3-letter IATA destination code', example: 'CUN' })
  @ApiQuery({ name: 'departureDate', required: true, description: 'Departure date (YYYY-MM-DD)', example: '2026-06-15' })
  @ApiQuery({ name: 'returnDate', required: false, description: 'Return date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'adults', required: false, description: 'Number of adults', example: '2' })
  @ApiQuery({ name: 'children', required: false, description: 'Number of children', example: '0' })
  @ApiQuery({ name: 'travelClass', required: false, enum: ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'] })
  @ApiResponse({ status: 200, description: 'Flight offers returned' })
  @ApiResponse({ status: 400, description: 'Invalid search parameters' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async searchFlights(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
    @Query('departureDate') departureDate?: string,
    @Query('returnDate') returnDate?: string,
    @Query('adults') adults?: string,
    @Query('children') children?: string,
    @Query('travelClass') travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST',
  ) {
    if (!origin || !destination || !departureDate) {
      throw new BadRequestException('origin, destination, and departureDate are required')
    }

    this.logger.log('OTA flight search', { origin, destination, departureDate })

    const response = await this.otaSearchService.searchFlights({
      origin: origin.toUpperCase(),
      destination: destination.toUpperCase(),
      departureDate,
      returnDate,
      adults: adults ? parseInt(adults, 10) : 1,
      children: children ? parseInt(children, 10) : 0,
      travelClass,
      currencyCode: 'CAD',
    })

    if (!response.success) {
      return { results: [], warning: response.error }
    }

    return { results: response.data || [] }
  }

  // ============================================================================
  // Airport Lookup
  // ============================================================================

  /**
   * Search airports by keyword.
   * GET /ota/search/airports
   */
  @Get('airports')
  @Public()
  @UseGuards(OtaServiceKeyGuard)
  @ApiOperation({ summary: 'Search airports by keyword' })
  @ApiHeader({ name: 'x-ota-service-key', required: true, description: 'OTA service-to-service key' })
  @ApiQuery({ name: 'keyword', required: true, description: 'City or airport name (min 3 chars)', example: 'toronto' })
  @ApiResponse({ status: 200, description: 'Airport results' })
  @ApiResponse({ status: 400, description: 'Keyword too short' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async searchAirports(
    @Query('keyword') keyword?: string,
  ) {
    if (!keyword || keyword.trim().length < 3) {
      throw new BadRequestException('keyword must be at least 3 characters')
    }

    this.logger.log('OTA airport search', { keyword })

    return this.otaSearchService.searchAirports(keyword)
  }

  // ============================================================================
  // Hotel Search
  // ============================================================================

  /**
   * Search hotels by destination.
   * GET /ota/search/hotels
   */
  @Get('hotels')
  @Public()
  @UseGuards(OtaServiceKeyGuard)
  @ApiOperation({ summary: 'Search hotels by destination' })
  @ApiHeader({ name: 'x-ota-service-key', required: true, description: 'OTA service-to-service key' })
  @ApiQuery({ name: 'destination', required: true, description: 'Amadeus city code (e.g., NYC, PAR)', example: 'CUN' })
  @ApiQuery({ name: 'checkIn', required: false, description: 'Check-in date (YYYY-MM-DD)', example: '2026-06-15' })
  @ApiQuery({ name: 'checkOut', required: false, description: 'Check-out date (YYYY-MM-DD)', example: '2026-06-22' })
  @ApiQuery({ name: 'adults', required: false, description: 'Number of adults', example: '2' })
  @ApiQuery({ name: 'rooms', required: false, description: 'Number of rooms (reserved for future use)' })
  @ApiResponse({ status: 200, description: 'Hotel results' })
  @ApiResponse({ status: 400, description: 'Invalid search parameters' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async searchHotels(
    @Query('destination') destination?: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('adults') adults?: string,
    @Query('rooms') _rooms?: string,
  ) {
    if (!destination) {
      throw new BadRequestException('destination is required (Amadeus city code, e.g., CUN, PAR)')
    }

    this.logger.log('OTA hotel search', { destination, checkIn, checkOut })

    const response = await this.otaSearchService.searchHotels({
      cityCode: destination.toUpperCase(),
      checkIn,
      checkOut,
      adults: adults ? parseInt(adults, 10) : undefined,
    })

    if (!response.success) {
      return { results: [], warning: response.error }
    }

    return { results: response.data || [] }
  }

  // ============================================================================
  // Cruise Search
  // ============================================================================

  /**
   * Search cruises via FusionAPI live pricing.
   * GET /ota/search/cruises
   */
  @Get('cruises')
  @Public()
  @UseGuards(OtaServiceKeyGuard)
  @ApiOperation({ summary: 'Search cruises with live pricing' })
  @ApiHeader({ name: 'x-ota-service-key', required: true, description: 'OTA service-to-service key' })
  @ApiQuery({ name: 'destination', required: false, description: 'Region ID for destination filtering' })
  @ApiQuery({ name: 'departureDate', required: false, description: 'Earliest departure date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'returnDate', required: false, description: 'Latest departure date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'passengers', required: false, description: 'Number of passengers (defaults to 2)', example: '2' })
  @ApiQuery({ name: 'cruiseLine', required: false, description: 'Cruise line ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number', example: '1' })
  @ApiQuery({ name: 'pagesize', required: false, description: 'Results per page (max 100)', example: '20' })
  @ApiResponse({ status: 200, description: 'Cruise search results with pricing' })
  @ApiResponse({ status: 401, description: 'Invalid OTA service key' })
  async searchCruises(
    @Query('destination') destination?: string,
    @Query('departureDate') departureDate?: string,
    @Query('returnDate') returnDate?: string,
    @Query('passengers') passengers?: string,
    @Query('cruiseLine') cruiseLine?: string,
    @Query('page') page?: string,
    @Query('pagesize') pagesize?: string,
  ) {
    this.logger.log('OTA cruise search', { destination, departureDate, cruiseLine })

    const result = await this.otaSearchService.searchCruises({
      regionid: destination ? parseInt(destination, 10) || undefined : undefined,
      departureDate,
      returnDate,
      passengers: passengers ? parseInt(passengers, 10) : undefined,
      cruiselineid: cruiseLine ? parseInt(cruiseLine, 10) || undefined : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pagesize: pagesize ? parseInt(pagesize, 10) : undefined,
    })

    return {
      sessionKey: result.sessionKey,
      results: result.results,
      meta: result.meta,
    }
  }
}
