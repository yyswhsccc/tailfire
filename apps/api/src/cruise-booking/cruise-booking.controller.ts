/**
 * Cruise Booking Controller
 *
 * API endpoints for real-time cruise booking via Traveltek FusionAPI.
 * Supports three booking flows:
 * - Agent: Agent searches, proposes, and books
 * - Client Handoff: Agent proposes, client completes booking
 * - OTA: Client self-service booking
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { Roles } from '../auth/decorators/roles.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import type { AuthContext } from '../auth/auth.types'
import { BookingService } from './services/booking.service'
import { ImportBookingService } from './services/import-booking.service'
import { ImportBookingPreviewDto, ImportBookingConfirmDto } from './dto/import-booking.dto'
import { SearchCruisesDto, SearchResponseDto } from './dto/search.dto'
import { GetRateCodesDto, RateCodesResponseDto, RateCodeDto } from './dto/rate-code.dto'
import { GetCabinGradesDto, CabinGradesResponseDto, CabinGradeDto } from './dto/cabin-grade.dto'
import { GetCabinsDto, CabinsResponseDto, DeckPlanDto, CabinDto } from './dto/cabin.dto'
import { AddToBasketDto, BasketResponseDto, BasketItemDto } from './dto/basket.dto'
import { CreateBookingDto, BookingResponseDto } from './dto/booking.dto'

@ApiTags('Cruise Booking')
@Controller('cruise-booking')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class CruiseBookingController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly importBookingService: ImportBookingService,
  ) {}

  // ============================================================================
  // SEARCH (Step 1)
  // ============================================================================

  /**
   * Search for cruises.
   * Creates a session key for subsequent operations.
   * POST /cruise-booking/search
   */
  @Post('search')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Search for cruises' })
  @ApiResponse({ status: 200, type: SearchResponseDto })
  async searchCruises(
    @Body() dto: SearchCruisesDto,
    @GetAuthContext() _auth: AuthContext
  ): Promise<SearchResponseDto> {
    const result = await this.bookingService.searchCruises(
      {
        sessionkey: dto.sessionkey,
        adults: dto.adults,
        children: dto.children,
        infants: dto.infants,
        startdate: dto.startDate,
        enddate: dto.endDate,
        departuremonth: dto.departuremonth,
        portid: dto.portid,
        regionid: dto.regionid,
        cruiselineid: dto.cruiselineid,
        shipid: dto.shipid,
        nights_min: dto.nights_min,
        nights_max: dto.nights_max,
        page: dto.page,
        pagesize: dto.pagesize,
      },
      dto.sessionkey
    )

    return {
      sessionKey: result.sessionKey,
      results: result.results,
      meta: result.meta,
    }
  }

  // ============================================================================
  // RATE CODES (Step 2)
  // ============================================================================

  /**
   * Get agency-tailored rate codes for a cruise.
   * GET /cruise-booking/rates
   */
  @Get('rates')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Get agency-tailored rate codes for a cruise' })
  @ApiResponse({ status: 200, type: RateCodesResponseDto })
  async getRateCodes(@Query() dto: GetRateCodesDto): Promise<RateCodesResponseDto> {
    const rateCodes = await this.bookingService.getRateCodes(
      dto.sessionkey,
      dto.codetocruiseid,
      dto.resultno
    )

    return {
      rateCodes: rateCodes.map((rc): RateCodeDto => ({
        code: rc.code,
        name: rc.name,
        description: rc.description,
        nonrefundabledeposit: rc.nonrefundabledeposit,
      })),
    }
  }

  // ============================================================================
  // CABIN GRADES (Step 3)
  // ============================================================================

  /**
   * Get cabin grades/categories with pricing.
   * GET /cruise-booking/cabin-grades
   */
  @Get('cabin-grades')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Get cabin grades/categories with pricing' })
  @ApiResponse({ status: 200, type: CabinGradesResponseDto })
  async getCabinGrades(@Query() dto: GetCabinGradesDto): Promise<CabinGradesResponseDto> {
    const grades = await this.bookingService.getCabinGrades(
      dto.sessionkey,
      dto.codetocruiseid,
      dto.resultno,
      dto.farecode
    )

    return {
      grades: grades.map((g): CabinGradeDto => ({
        gradeno: g.gradeno,
        gradename: g.gradename,
        gradedescription: g.gradedescription,
        category: g.category,
        pricepp: g.pricepp,
        pricetotal: g.pricetotal,
        available: g.available,
      })),
    }
  }

  // ============================================================================
  // CABINS + DECK PLANS (Step 4)
  // ============================================================================

  /**
   * Get specific cabins with deck plan coordinates.
   * Returns deck plan images + cabin positions for visual selection.
   * GET /cruise-booking/cabins
   */
  @Get('cabins')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Get specific cabins with deck plan coordinates' })
  @ApiResponse({ status: 200, type: CabinsResponseDto })
  async getCabins(@Query() dto: GetCabinsDto): Promise<CabinsResponseDto> {
    const response = await this.bookingService.getCabins(
      dto.sessionkey,
      dto.codetocruiseid,
      dto.resultno,
      dto.gradeno,
      dto.farecode
    )

    return {
      deckPlans: (response.meta.decks || []).map((d): DeckPlanDto => ({
        id: d.id,
        name: d.name,
        imageurl: d.imageurl,
      })),
      cabins: response.results.map((c): CabinDto => ({
        cabinno: c.cabinno,
        deckname: c.deckname,
        deckcode: c.deckcode,
        coordinates: {
          x1: c.x1,
          x2: c.x2,
          y1: c.y1,
          y2: c.y2,
        },
        bedcode: c.bedcode,
        beddescription: c.beddescription,
        maxguests: c.maxguests,
        available: c.available,
        cabinResult: c.resultno, // Use as cabinresult in basket add
      })),
    }
  }

  // ============================================================================
  // BASKET OPERATIONS (Steps 5-6)
  // ============================================================================

  /**
   * Add cabin to basket (puts cabin on HOLD).
   * Creates a booking session in the database.
   * POST /cruise-booking/basket
   */
  @Post('basket')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Add cabin to basket (puts cabin on hold)' })
  @ApiResponse({ status: 201, type: BasketResponseDto })
  async addToBasket(
    @Body() dto: AddToBasketDto,
    @GetAuthContext() auth: AuthContext
  ): Promise<BasketResponseDto> {
    const result = await this.bookingService.addToBasket({
      activityId: dto.activityId,
      userId: auth.userId,
      tripId: dto.tripId,
      tripTravelerId: dto.tripTravelerId,
      flowType: dto.flowType,
      sessionKey: dto.sessionKey, // REQUIRED: Reuse sessionKey from search step
      codetocruiseid: dto.codetocruiseid,
      resultno: dto.resultno,
      gradeno: dto.gradeno,
      farecode: dto.farecode,
      cabinresult: dto.cabinresult,
      cabinno: dto.cabinno,
    })

    // Build basket response
    const items: BasketItemDto[] = [{
      itemkey: result.basket.itemkey,
      producttype: 'cruise',
      cruiselinename: '', // Would come from search context
      shipname: '',
      itineraryname: '',
      departuredate: '',
      nights: 0,
      cabinno: dto.cabinno,
      cabingrade: String(dto.gradeno),
      farecode: dto.farecode,
      pricepp: 0,
      pricetotal: 0,
      holdcabin: result.basket.holdcabin,
    }]

    return {
      items,
      totalprice: 0,
      currency: 'USD',
      session: {
        id: result.session.id,
        status: result.session.status,
        flowType: result.session.flowType,
        sessionKey: result.session.sessionKey,
        holdExpiresAt: result.holdExpiresAt?.toISOString() || null,
      },
      holdStatus: {
        isHeld: !!result.holdExpiresAt && result.holdExpiresAt > new Date(),
        expiresAt: result.holdExpiresAt?.toISOString(),
        remainingMinutes: result.holdExpiresAt
          ? Math.floor((result.holdExpiresAt.getTime() - Date.now()) / 60000)
          : undefined,
        isWarning: result.holdExpiresAt
          ? (result.holdExpiresAt.getTime() - Date.now()) / 60000 < 5
          : false,
      },
    }
  }

  /**
   * Get basket contents for a session.
   * GET /cruise-booking/basket/:sessionId
   */
  @Get('basket/:sessionId')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Get basket contents for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session UUID' })
  @ApiResponse({ status: 200, type: BasketResponseDto })
  async getBasket(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @GetAuthContext() auth: AuthContext
  ): Promise<BasketResponseDto> {
    const result = await this.bookingService.getBasket(sessionId, auth.userId)

    const items: BasketItemDto[] = result.items.map((item) => ({
      itemkey: item.itemkey,
      producttype: item.producttype,
      cruiselinename: item.cruiselinename,
      shipname: item.shipname,
      itineraryname: item.itineraryname,
      departuredate: item.departuredate,
      nights: item.nights,
      cabinno: item.cabinno,
      cabingrade: item.cabingrade,
      farecode: item.farecode,
      pricepp: item.pricepp,
      pricetotal: item.pricetotal,
      holdcabin: item.holdcabin,
    }))

    return {
      items,
      totalprice: result.totalprice,
      currency: result.currency,
      session: {
        id: result.session.id,
        status: result.session.status,
        flowType: result.session.flowType,
        sessionKey: result.session.sessionKey,
        holdExpiresAt: result.session.holdExpiresAt?.toISOString() || null,
      },
      holdStatus: {
        isHeld: !!result.session.holdExpiresAt && new Date(result.session.holdExpiresAt) > new Date(),
        expiresAt: result.session.holdExpiresAt?.toISOString(),
        remainingMinutes: result.session.holdExpiresAt
          ? Math.floor((new Date(result.session.holdExpiresAt).getTime() - Date.now()) / 60000)
          : undefined,
        isWarning: result.session.holdExpiresAt
          ? (new Date(result.session.holdExpiresAt).getTime() - Date.now()) / 60000 < 5
          : false,
      },
    }
  }

  /**
   * Remove item from basket.
   * DELETE /cruise-booking/basket/:sessionId/:itemkey
   */
  @Delete('basket/:sessionId/:itemkey')
  @Roles('admin', 'user')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove item from basket' })
  @ApiParam({ name: 'sessionId', description: 'Session UUID' })
  @ApiParam({ name: 'itemkey', description: 'Basket item key' })
  @ApiResponse({ status: 204 })
  async removeFromBasket(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('itemkey') itemkey: string,
    @GetAuthContext() auth: AuthContext
  ): Promise<void> {
    await this.bookingService.removeFromBasket(sessionId, auth.userId, itemkey)
  }

  // ============================================================================
  // BOOKING (Step 7)
  // ============================================================================

  /**
   * Complete booking with passengers and preferences.
   * Uses idempotency key to prevent double-bookings.
   * POST /cruise-booking/book
   */
  @Post('book')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Complete booking with passengers and preferences' })
  @ApiResponse({ status: 201, type: BookingResponseDto })
  async createBooking(
    @Body() dto: CreateBookingDto,
    @GetAuthContext() auth: AuthContext
  ): Promise<BookingResponseDto> {
    const result = await this.bookingService.completeBooking({
      sessionId: dto.sessionId,
      userId: auth.userId,
      idempotencyKey: dto.idempotencyKey,
      passengers: dto.passengers,
      contact: dto.contact,
      allocation: dto.allocation,
      payment: dto.payment,
    })

    return {
      success: result.success,
      bookingreference: result.bookingreference,
      confirmationdate: result.confirmationdate,
      totalprice: result.totalprice,
      currency: result.currency,
      depositdue: result.depositdue,
      balancedue: result.balancedue,
      balanceduedate: result.balanceduedate,
    }
  }

  // ============================================================================
  // HANDOFF SUPPORT
  // ============================================================================

  /**
   * Get proposal for client (agent's selection + hold countdown).
   * Used in handoff flow when client views agent's work.
   * GET /cruise-booking/proposal/:activityId
   */
  @Get('proposal/:activityId')
  @Roles('user')
  @ApiOperation({ summary: 'Get proposal for client (handoff flow)' })
  @ApiParam({ name: 'activityId', description: 'Activity UUID' })
  @ApiResponse({ status: 200, type: BasketResponseDto })
  async getProposal(
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @GetAuthContext() auth: AuthContext
  ): Promise<BasketResponseDto> {
    const result = await this.bookingService.getProposal(activityId, auth.userId)

    const items: BasketItemDto[] = result.basket.items.map((item) => ({
      itemkey: item.itemkey,
      producttype: item.producttype,
      cruiselinename: item.cruiselinename,
      shipname: item.shipname,
      itineraryname: item.itineraryname,
      departuredate: item.departuredate,
      nights: item.nights,
      cabinno: item.cabinno,
      cabingrade: item.cabingrade,
      farecode: item.farecode,
      pricepp: item.pricepp,
      pricetotal: item.pricetotal,
      holdcabin: item.holdcabin,
    }))

    return {
      items,
      totalprice: result.basket.totalprice,
      currency: result.basket.currency,
      session: {
        id: result.session.id,
        status: result.session.status,
        flowType: result.session.flowType,
        sessionKey: result.session.sessionKey,
        holdExpiresAt: result.session.holdExpiresAt?.toISOString() || null,
      },
      holdStatus: {
        isHeld: result.holdStatus.isHeld,
        expiresAt: result.holdStatus.expiresAt?.toISOString(),
        remainingMinutes: result.holdStatus.remainingMinutes,
        isWarning: result.holdStatus.isWarning,
      },
    }
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Cancel a session and release basket.
   * DELETE /cruise-booking/session/:sessionId
   */
  @Delete('session/:sessionId')
  @Roles('admin', 'user')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a session and release basket' })
  @ApiParam({ name: 'sessionId', description: 'Session UUID' })
  @ApiResponse({ status: 204 })
  async cancelSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @GetAuthContext() auth: AuthContext
  ): Promise<void> {
    await this.bookingService.cancelSession(sessionId, auth.userId)
  }

  // ============================================================================
  // IMPORT EXISTING BOOKING
  // ============================================================================

  /**
   * Preview an existing cruise booking from a cruise line system.
   * Fetches booking data from Traveltek without creating anything in Tailfire.
   * POST /cruise-booking/import/preview
   */
  @Post('import/preview')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Preview an existing booking for import' })
  @ApiResponse({ status: 200, description: 'Booking preview data' })
  async importPreview(
    @Body() dto: ImportBookingPreviewDto,
    @GetAuthContext() auth: AuthContext,
  ) {
    return this.importBookingService.preview(dto, auth)
  }

  /**
   * Import an existing cruise booking into Tailfire.
   * Creates Trip, Itinerary, Cruise Activity, Contacts, and Travelers.
   * POST /cruise-booking/import/confirm
   */
  @Post('import/confirm')
  @Roles('admin', 'user')
  @ApiOperation({ summary: 'Import an existing booking into Tailfire' })
  @ApiResponse({ status: 201, description: 'Imported trip details' })
  async importConfirm(
    @Body() dto: ImportBookingConfirmDto,
    @GetAuthContext() auth: AuthContext,
  ) {
    return this.importBookingService.confirm(dto, auth)
  }
}
