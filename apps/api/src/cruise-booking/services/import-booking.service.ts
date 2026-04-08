/**
 * Import Booking Service
 *
 * Orchestrates importing existing cruise bookings from cruise line systems
 * (e.g. Royal Caribbean, Celebrity) via Traveltek's cruiseimportbooking.pl endpoint.
 *
 * Two operations:
 * - preview(): Fetches booking data without creating anything in Tailfire
 * - confirm(): Fetches booking + creates Trip/Itinerary/Day/Activity/CruiseDetails/Contacts/Travelers
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { eq, and, desc, sql } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { schema } from '@tailfire/database'
import { FusionApiService } from './fusion-api.service'
import { ContactsService } from '../../contacts/contacts.service'
import { TripsService } from '../../trips/trips.service'
import { ItinerariesService } from '../../trips/itineraries.service'
import { ItineraryDaysService } from '../../trips/itinerary-days.service'
import { ComponentOrchestrationService } from '../../trips/component-orchestration.service'
import { TripTravelersService } from '../../trips/trip-travelers.service'
import { ActivityTravelersService } from '../../trips/activity-travelers.service'
import { TripAccessService } from '../../trips/trip-access.service'
import { PaymentSchedulesService } from '../../trips/payment-schedules.service'
import type { AuthContext } from '../../auth/auth.types'
import type { ImportBookingPreviewDto, ImportBookingConfirmDto } from '../dto/import-booking.dto'
import type {
  ImportBookingResult,
  ImportBookingCruiseItem,
  ImportBookingPassenger,
  ImportBookingItineraryPort,
  ImportBookingBreakdownItem,
} from '../types/fusion-api.types'
import type { CustomCruiseDetailsDto, CruisePortCall, CreateTripTravelerDto } from '@tailfire/shared-types'

const { customCruiseDetails, cruiseLines, cruiseSailings, cruiseShips, cruisePorts, cruiseRegions, cruiseSailingRegions, activityPricing } = schema

@Injectable()
export class ImportBookingService {
  private readonly logger = new Logger(ImportBookingService.name)

  constructor(
    private readonly db: DatabaseService,
    private readonly fusionApiService: FusionApiService,
    private readonly contactsService: ContactsService,
    private readonly tripsService: TripsService,
    private readonly itinerariesService: ItinerariesService,
    private readonly itineraryDaysService: ItineraryDaysService,
    private readonly componentOrchestrationService: ComponentOrchestrationService,
    private readonly tripTravelersService: TripTravelersService,
    private readonly activityTravelersService: ActivityTravelersService,
    private readonly tripAccessService: TripAccessService,
    private readonly paymentSchedulesService: PaymentSchedulesService,
  ) {}

  // ============================================================================
  // Preview
  // ============================================================================

  async preview(dto: ImportBookingPreviewDto, _auth: AuthContext) {
    const lineid = await this.resolveLineid(dto)

    const response = await this.fusionApiService.importBooking({
      lineid,
      bookingreference: dto.bookingReference,
      viewonly: 1,
      currency: dto.currency ?? 'CAD',
    })

    if (response.error) {
      throw new BadRequestException(
        `Failed to import booking: ${response.error.message}`,
      )
    }

    const rawResult = response.results?.[0]
    if (!rawResult) {
      throw new NotFoundException(
        `Booking ${dto.bookingReference} not found for line ${lineid}`,
      )
    }

    const result = this.normalizeImportResult(rawResult)
    return this.formatPreviewResponse(result, dto.bookingReference, lineid)
  }

  // ============================================================================
  // Confirm
  // ============================================================================

  async confirm(dto: ImportBookingConfirmDto, auth: AuthContext) {
    // 1. Access check BEFORE idempotency — prevent tripId leakage
    if (dto.existingTripId) {
      await this.tripAccessService.verifyWriteAccess(dto.existingTripId, auth)
    }

    // 2. Idempotency check — scope by agency + source to prevent collisions
    const existing = await this.findExistingImport(dto.bookingReference, auth.agencyId)
    if (existing) {
      this.logger.log(`Import already exists for booking ${dto.bookingReference}, returning existing trip`)
      return { tripId: existing.tripId, alreadyImported: true }
    }

    // 3. Fetch fresh booking data
    const lineid = await this.resolveLineid(dto)
    const response = await this.fusionApiService.importBooking({
      lineid,
      bookingreference: dto.bookingReference,
      viewonly: 1,
      currency: dto.currency ?? 'CAD',
    })

    if (response.error) {
      throw new BadRequestException(
        `Failed to import booking: ${response.error.message}`,
      )
    }

    const rawResult = response.results?.[0]
    if (!rawResult) {
      throw new NotFoundException(
        `Booking ${dto.bookingReference} not found for line ${lineid}`,
      )
    }

    const result = this.normalizeImportResult(rawResult)
    const cruiseItem = result.cruiseitem

    // 4. Match/Create contacts for each passenger
    const passengerContactMap = await this.matchOrCreateContacts(
      result.passengers,
      auth,
    )

    // 5. Create or use existing trip
    let tripId: string
    if (dto.existingTripId) {
      tripId = dto.existingTripId
    } else {
      const tripName = dto.tripName || cruiseItem.name || `Cruise ${dto.bookingReference}`
      const trip = await this.tripsService.create(
        {
          name: tripName,
          status: 'inbound',
          startDate: cruiseItem.startdate,
          endDate: cruiseItem.enddate,
          tripType: 'leisure',
        },
        auth.userId,
      )
      tripId = trip.id
    }

    // 6. Create itinerary
    const itinerary = await this.itinerariesService.create(tripId, {
      name: cruiseItem.name || `Cruise Itinerary`,
      startDate: cruiseItem.startdate,
      endDate: cruiseItem.enddate,
      status: 'approved',
    })

    // 7. Create itinerary day for the departure date using findOrCreateByDate
    const departureDay = await this.itineraryDaysService.findOrCreateByDate(
      itinerary.id,
      cruiseItem.startdate,
    )

    // 8. Build and create custom cruise activity
    const rawCruiseDetails = this.mapToCruiseDetails(cruiseItem, dto.bookingReference, result)
    const cruiseDetails = await this.enrichFromCatalog(rawCruiseDetails, cruiseItem) as CustomCruiseDetailsDto
    // Total charge = sum of ALL breakdown items (cruise fare + taxes + port charges).
    // Falls back to nettprice (cruise fare only) if breakdown is empty.
    const totalPriceCents = this.calculateTotalChargeCents(cruiseItem.breakdown || [], cruiseItem.nettprice)
    const commissionCents = result.commission
      ? Math.round(result.commission * 100)
      : null
    const taxesAndFeesCents = this.extractTaxesAndFeesCents(cruiseItem.breakdown || [], totalPriceCents)

    this.logger.log({
      message: 'Import pricing breakdown',
      bookingReference: dto.bookingReference,
      nettprice: cruiseItem.nettprice,
      grossprice: cruiseItem.grossprice,
      breakdownTotal: totalPriceCents,
      commission: result.commission,
      taxesAndFees: taxesAndFeesCents,
      breakdownItemCount: cruiseItem.breakdown?.length ?? 0,
    })

    const cruiseActivity = await this.componentOrchestrationService.createCustomCruise({
      itineraryDayId: departureDay.id,
      componentType: 'custom_cruise',
      name: cruiseItem.name || `Cruise ${dto.bookingReference}`,
      startDatetime: cruiseItem.startdate,
      endDatetime: cruiseItem.enddate,
      proposalStatus: 'approved',
      bookingStatus: 'booked',
      currency: dto.currency ?? 'CAD',
      totalPriceCents: totalPriceCents,
      taxesAndFeesCents: taxesAndFeesCents ?? null,
      commissionTotalCents: commissionCents,
      supplier: cruiseItem.suppliername || null,
      bookingReference: dto.bookingReference,
      customCruiseDetails: cruiseDetails,
    })

    // 8b. Mark the imported cruise as booked — it's an existing confirmed booking
    // Also sync booking_number → confirmation_number (canonical booking ref field)
    await this.db.client
      .update(this.db.schema.itineraryActivities)
      .set({
        bookingStatus: 'booked',
        bookingDate: new Date(),
        confirmationNumber: dto.bookingReference,
      })
      .where(eq(this.db.schema.itineraryActivities.id, cruiseActivity.id))

    // 9. Create trip travelers for each passenger
    const travelerIds: string[] = []
    for (let i = 0; i < result.passengers.length; i++) {
      const passenger = result.passengers[i]!
      const contactId = passengerContactMap.get(passenger.paxno)

      const travelerDto = {
        contactId: contactId!,
        role: i === 0 ? 'primary_contact' as const : 'limited_access' as const,
        travelerType: this.mapPaxType(passenger.paxtype),
      } as CreateTripTravelerDto
      const traveler = await this.tripTravelersService.create(tripId, travelerDto, auth)
      travelerIds.push(traveler.id)
    }

    // 10. Link travelers to cruise activity
    if (travelerIds.length > 0) {
      await this.activityTravelersService.linkTravelers(cruiseActivity.id, {
        tripTravelerIds: travelerIds,
      })
    }

    // 10c. Populate per-person pricing breakdown + universal booking fields from FusionAPI data
    if (cruiseActivity.activityPricingId) {
      try {
        const pricingUpdate: Record<string, unknown> = {}

        // Per-person breakdown
        if (cruiseItem.perperson?.length > 0) {
          pricingUpdate.pricingBreakdownJson = result.passengers.map((pax, i) => {
            const paxTotal = cruiseItem.perperson.reduce((sum, item) => {
              const paxPrice = item.prices?.find(p => p.guestno === pax.paxno)
              return sum + (this.parsePriceToCents(paxPrice?.price) ?? 0)
            }, 0)
            return {
              label: `${pax.title || ''} ${pax.firstname} ${pax.lastname}`.trim(),
              priceCents: paxTotal,
              travelerId: travelerIds[i] || undefined,
            }
          })
          pricingUpdate.pricingType = 'per_person'
        }

        // Net = Total charge - Commission (not grossprice which is wholesale/agency cost)
        if (totalPriceCents !== null && commissionCents !== null) {
          pricingUpdate.netPriceCents = totalPriceCents - commissionCents
        } else if (totalPriceCents !== null) {
          pricingUpdate.netPriceCents = totalPriceCents
        }
        if (cruiseItem.paymentinfo?.nonrefundabledeposit === 1) {
          pricingUpdate.nonRefundableDeposit = true
        }

        if (Object.keys(pricingUpdate).length > 0) {
          await this.db.client
            .update(activityPricing)
            .set(pricingUpdate)
            .where(eq(activityPricing.id, cruiseActivity.activityPricingId))
        }
      } catch (error) {
        this.logger.warn({
          message: 'Failed to populate pricing fields from import',
          bookingReference: dto.bookingReference,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 10b. Create payment schedule + record received payments (non-critical)
    // Must run AFTER travelers are linked — createTransaction validates trip has travelers
    if (cruiseActivity.activityPricingId && cruiseItem.paymentinfo) {
      try {
        await this.createPaymentsFromImport(
          cruiseActivity.activityPricingId,
          cruiseItem.paymentinfo,
          totalPriceCents,
          dto.currency ?? 'CAD',
          dto.bookingReference,
          result.bookingdate,
        )
      } catch (error) {
        this.logger.warn({
          message: 'Failed to create payment records for imported booking',
          bookingReference: dto.bookingReference,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 11. Generate port schedule from cruise port calls (non-critical)
    if (cruiseDetails.portCallsJson && cruiseDetails.portCallsJson.length > 0) {
      try {
        await this.componentOrchestrationService.generateCruisePortSchedule(
          cruiseActivity.id,
          {
            itineraryId: itinerary.id,
            customCruiseDetails: {
              departureDate: cruiseItem.startdate,
              arrivalDate: cruiseItem.enddate,
              portCallsJson: cruiseDetails.portCallsJson,
              departurePort: cruiseDetails.departurePort,
              arrivalPort: cruiseDetails.arrivalPort,
            },
            skipDelete: true,
            autoExtendItinerary: true,
          },
        )
      } catch (error) {
        // Port schedule generation is non-critical — log and continue
        this.logger.warn({
          message: 'Failed to generate port schedule for imported booking',
          bookingReference: dto.bookingReference,
          cruiseActivityId: cruiseActivity.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 12. Stamp Fusion fields LAST — this is the idempotency marker.
    // Writing fusionBookingRef as the final step ensures partial failures
    // don't short-circuit retries via the idempotency check.
    await this.db.client
      .update(customCruiseDetails)
      .set({
        fusionBookingRef: dto.bookingReference,
        fusionBookingStatus: 'confirmed',
        fusionBookedAt: new Date(),
        fusionBookingResponse: response as unknown as Record<string, unknown>,
      })
      .where(eq(customCruiseDetails.activityId, cruiseActivity.id))

    this.logger.log({
      message: 'Booking imported successfully',
      bookingReference: dto.bookingReference,
      tripId,
      cruiseActivityId: cruiseActivity.id,
      travelers: travelerIds.length,
    })

    return { tripId, cruiseActivityId: cruiseActivity.id, alreadyImported: false }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async resolveLineid(dto: ImportBookingPreviewDto): Promise<number> {
    if (dto.lineid) {
      return dto.lineid
    }

    if (dto.cruiseLineId) {
      const [line] = await this.db.client
        .select({ providerIdentifier: cruiseLines.providerIdentifier })
        .from(cruiseLines)
        .where(
          and(
            eq(cruiseLines.id, dto.cruiseLineId),
            eq(cruiseLines.provider, 'traveltek'),
          ),
        )
        .limit(1)

      if (!line) {
        throw new NotFoundException(
          `Cruise line ${dto.cruiseLineId} not found or has no Traveltek mapping`,
        )
      }

      const parsed = parseInt(line.providerIdentifier, 10)
      if (isNaN(parsed)) {
        throw new BadRequestException(
          `Invalid Traveltek lineid for cruise line ${dto.cruiseLineId}`,
        )
      }
      return parsed
    }

    throw new BadRequestException(
      'Either cruiseLineId or lineid must be provided',
    )
  }

  private async findExistingImport(
    bookingReference: string,
    agencyId: string,
  ): Promise<{ tripId: string } | null> {
    // Query custom_cruise_details joined to activities → days → itineraries → trips
    // to find an existing import scoped by agency + source + fusionBookingRef.
    // Using source='traveltek' + fusionBookingRef prevents false matches when the
    // same booking reference exists across different cruise lines or sources.
    const result = await this.db.client
      .select({
        tripId: this.db.schema.trips.id,
      })
      .from(customCruiseDetails)
      .innerJoin(
        this.db.schema.itineraryActivities,
        eq(customCruiseDetails.activityId, this.db.schema.itineraryActivities.id),
      )
      .innerJoin(
        this.db.schema.itineraryDays,
        eq(this.db.schema.itineraryActivities.itineraryDayId, this.db.schema.itineraryDays.id),
      )
      .innerJoin(
        this.db.schema.itineraries,
        eq(this.db.schema.itineraryDays.itineraryId, this.db.schema.itineraries.id),
      )
      .innerJoin(
        this.db.schema.trips,
        eq(this.db.schema.itineraries.tripId, this.db.schema.trips.id),
      )
      .where(
        and(
          eq(customCruiseDetails.source, 'traveltek'),
          eq(customCruiseDetails.fusionBookingRef, bookingReference),
          eq(this.db.schema.trips.agencyId, agencyId),
        ),
      )
      .limit(1)

    return result[0] || null
  }

  private async matchOrCreateContacts(
    passengers: ImportBookingPassenger[],
    auth: AuthContext,
  ): Promise<Map<number, string>> {
    const map = new Map<number, string>()

    for (const pax of passengers) {
      // Normalize names to title case (API data is often ALL CAPS)
      const firstName = this.titleCase(pax.firstname)
      const lastName = this.titleCase(pax.lastname)

      // Validate DOB format before using in DB queries/writes
      const rawDob = pax.dob || null
      const dob = rawDob && /^\d{4}-\d{2}-\d{2}$/.test(rawDob) && !isNaN(Date.parse(rawDob))
        ? rawDob
        : null
      // Match by name first (case-insensitive), then disambiguate with DOB if needed.
      // We do NOT require DOB in the WHERE clause because existing contacts may not
      // have a DOB yet — requiring it would cause duplicates.
      const nameMatches = await this.db.client
        .select({
          id: this.db.schema.contacts.id,
          dateOfBirth: this.db.schema.contacts.dateOfBirth,
        })
        .from(this.db.schema.contacts)
        .where(
          and(
            eq(this.db.schema.contacts.agencyId, auth.agencyId),
            sql`LOWER(${this.db.schema.contacts.firstName}) = LOWER(${firstName})`,
            sql`LOWER(${this.db.schema.contacts.lastName}) = LOWER(${lastName})`,
          ),
        )
        .limit(10)

      // Disambiguate: prefer DOB match, then any name match
      let matched = nameMatches[0] || null
      if (dob && nameMatches.length > 1) {
        const dobMatch = nameMatches.find((c) => c.dateOfBirth === dob)
        if (dobMatch) matched = dobMatch
      }

      if (matched) {
        // Additively update empty fields on the matched contact
        const fullContact = await this.db.client
          .select()
          .from(this.db.schema.contacts)
          .where(eq(this.db.schema.contacts.id, matched.id))
          .limit(1)

        const contact = fullContact[0]
        if (contact) {
          const updates: Record<string, any> = {}
          if (!contact.gender && pax.gender) updates.gender = this.normalizeGender(pax.gender)
          if (!contact.nationality && pax.nationality) updates.nationality = this.sanitizeNationality(pax.nationality)
          if (!contact.dateOfBirth && dob) updates.dateOfBirth = dob
          if (!contact.middleName && pax.middlename) updates.middleName = this.titleCase(pax.middlename)
          if (!contact.prefix && pax.title) updates.prefix = this.normalizePrefix(pax.title)

          if (Object.keys(updates).length > 0) {
            try {
              await this.contactsService.update(matched.id, updates, auth.agencyId, auth.userId)
              this.logger.log(`Updated contact ${matched.id} with ${Object.keys(updates).join(', ')}`)
            } catch (e) {
              this.logger.warn(`Failed to update contact ${matched.id}: ${(e as Error).message}`)
            }
          }
        }

        map.set(pax.paxno, matched.id)
      } else {
        // Create new contact
        const contact = await this.contactsService.create(
          {
            firstName,
            lastName,
            middleName: pax.middlename ? this.titleCase(pax.middlename) : undefined,
            prefix: this.normalizePrefix(pax.title),
            dateOfBirth: dob || undefined,
            gender: this.normalizeGender(pax.gender),
            nationality: this.sanitizeNationality(pax.nationality),
            contactType: 'client',
            becameClientAt: new Date().toISOString(),
          },
          auth.agencyId,
          auth.userId,
        )
        map.set(pax.paxno, contact.id)
      }
    }

    return map
  }

  private mapToCruiseDetails(
    cruiseItem: ImportBookingCruiseItem,
    bookingReference: string,
    result: ImportBookingResult,
  ): CustomCruiseDetailsDto {
    const portCallsJson: CruisePortCall[] = (cruiseItem.itinerary || []).map(
      (port: ImportBookingItineraryPort) => ({
        day: port.day,
        portName: port.itineraryname,
        arriveDate: port.arrivedate || '',
        arriveTime: port.arrivetime || '',
        departDate: port.departdate || '',
        departTime: port.departtime || '',
        description: port.extrainfo || undefined,
        latitude: port.latitude || undefined,
        longitude: port.longitude || undefined,
      }),
    )

    // Derive departure/arrival ports from itinerary
    const firstPort = cruiseItem.itinerary?.[0]
    const lastPort = cruiseItem.itinerary?.[cruiseItem.itinerary.length - 1]

    return {
      source: 'traveltek',
      traveltekCruiseId: String(cruiseItem.codetocruiseid),
      traveltekBookingId: result.bookingid ?? null,
      traveltekPortfolioId: result.portfolioid ?? null,
      cruiseLineName: cruiseItem.suppliername || null,
      shipName: cruiseItem.ship?.name || null,
      shipCode: cruiseItem.ship?.code || null,
      shipImageUrl: cruiseItem.ship?.imageurl || null,
      itineraryName: cruiseItem.name || null,
      voyageCode: cruiseItem.voyagecode || null,
      nights: cruiseItem.nights ?? null,
      seaDays: cruiseItem.sailnights ?? null,
      departurePort: firstPort?.itineraryname || null,
      departureDate: cruiseItem.startdate || null,
      arrivalPort: lastPort?.itineraryname || null,
      arrivalDate: cruiseItem.enddate || null,
      cabinCategory: cruiseItem.cabin?.cabintype || null,
      cabinCode: cruiseItem.cabin?.farecode || null,
      cabinNumber: cruiseItem.cabin?.number || null,
      cabinDescription: cruiseItem.cabin?.name || null,
      cabinDeck: cruiseItem.cabin?.deck || null,
      cabinLocation: cruiseItem.cabin?.location || null,
      bookingNumber: bookingReference,
      fareCode: cruiseItem.cabin?.farecode || null,
      reservationNumber: cruiseItem.reservation || null,
      stateroomCategoryCode: cruiseItem.berthedcategorycode || null,
      onboardCreditCents: cruiseItem.onboardcredit ? Math.round(cruiseItem.onboardcredit * 100) : null,
      onboardCreditCurrency: cruiseItem.obccurrency || null,
      portCallsJson,
      cabinPricingJson: {
        grossprice: cruiseItem.grossprice,
        nettprice: cruiseItem.nettprice,
        price: cruiseItem.price,
        breakdown: cruiseItem.breakdown || [],
        perperson: cruiseItem.perperson || [],
        paymentinfo: cruiseItem.paymentinfo || {},
        onboardcredit: cruiseItem.onboardcredit,
        obccurrency: cruiseItem.obccurrency,
      },
      diningPreferences: cruiseItem.dining ?? null,
      selectedExtras: this.normalizeExtras(cruiseItem.selectedextras),
      selectedPromotions: cruiseItem.selectedpromotions &&
        Object.keys(cruiseItem.selectedpromotions).length > 0
          ? cruiseItem.selectedpromotions
          : null,
    }
  }

  private async formatPreviewResponse(
    result: ImportBookingResult,
    bookingReference: string,
    lineid: number,
  ) {
    const cruiseItem = result.cruiseitem

    // Enrich preview with catalog data for UI display
    const rawDetails = this.mapToCruiseDetails(cruiseItem, bookingReference, result)
    const enriched = await this.enrichFromCatalog(rawDetails, cruiseItem)

    return {
      bookingReference,
      lineid,
      bookingDate: result.bookingdate,
      commission: result.commission,
      cruise: {
        name: cruiseItem.name,
        voyageCode: cruiseItem.voyagecode,
        status: cruiseItem.status,
        startDate: cruiseItem.startdate,
        endDate: cruiseItem.enddate,
        nights: cruiseItem.nights,
        ship: cruiseItem.ship,
        cabin: cruiseItem.cabin,
        supplier: cruiseItem.suppliername,
        itinerary: cruiseItem.itinerary,
        pricing: (() => {
          // Total charge = sum of ALL breakdown items (cruise fare + taxes + port charges).
          // Falls back to nettprice (cruise fare only) if breakdown is empty.
          const totalChargeCents = this.calculateTotalChargeCents(
            cruiseItem.breakdown || [],
            cruiseItem.nettprice,
          )
          const totalCharge = totalChargeCents !== null ? totalChargeCents / 100 : null
          // Net = Total charge - Commission
          const netPrice = totalCharge !== null && result.commission
            ? totalCharge - result.commission
            : null
          return {
            grossPrice: totalCharge,
            netPrice,
            currency: cruiseItem.scurrency,
          }
        })(),
        dining: cruiseItem.dining,
        selectedExtras: this.normalizeExtras(cruiseItem.selectedextras),
        selectedPromotions: cruiseItem.selectedpromotions &&
          Object.keys(cruiseItem.selectedpromotions).length > 0
            ? cruiseItem.selectedpromotions
            : null,
        traveltekBookingId: result.bookingid ?? null,
        traveltekPortfolioId: result.portfolioid ?? null,
        paymentInfo: cruiseItem.paymentinfo,
        onboardCredit: cruiseItem.onboardcredit,
        obcCurrency: cruiseItem.obccurrency,
      },
      passengers: result.passengers,
      catalog: {
        cruiseLineId: enriched.cruiseLineId || null,
        cruiseShipId: enriched.cruiseShipId || null,
        cruiseRegionId: enriched.cruiseRegionId || null,
        departurePortId: enriched.departurePortId || null,
        arrivalPortId: enriched.arrivalPortId || null,
        region: enriched.region || null,
        shipClass: enriched.shipClass || null,
        shipImageUrl: enriched.shipImageUrl || null,
      },
    }
  }

  private mapPaxType(paxtype: string): 'adult' | 'child' | 'infant' {
    const lower = (paxtype || '').toLowerCase()
    if (lower.includes('child')) return 'child'
    if (lower.includes('infant')) return 'infant'
    return 'adult'
  }

  private titleCase(name: string): string {
    return name
      .toLowerCase()
      .replace(/(?:^|\s|-)(\w)/g, (match) => match.toUpperCase())
  }

  private normalizeGender(gender: string): string | undefined {
    const lower = (gender || '').toLowerCase()
    if (lower === 'm' || lower === 'male') return 'male'
    if (lower === 'f' || lower === 'female') return 'female'
    return undefined
  }

  /**
   * Enrich cruise details from our catalog tables.
   * All lookups are best-effort — never overwrites non-empty imported values with nulls.
   */
  private async enrichFromCatalog(
    cruiseDetails: Partial<CustomCruiseDetailsDto>,
    cruiseItem: ImportBookingCruiseItem,
  ): Promise<Partial<CustomCruiseDetailsDto>> {
    const enriched = { ...cruiseDetails }

    try {
      // 1. Sailing lookup by traveltek provider_identifier
      const [sailing] = await this.db.client
        .select()
        .from(cruiseSailings)
        .where(
          and(
            eq(cruiseSailings.provider, 'traveltek'),
            eq(cruiseSailings.providerIdentifier, String(cruiseItem.codetocruiseid)),
          ),
        )
        .limit(1)

      if (sailing) {
        if (!enriched.cruiseLineId && sailing.cruiseLineId) {
          enriched.cruiseLineId = sailing.cruiseLineId
        }
        if (!enriched.cruiseShipId && sailing.shipId) {
          enriched.cruiseShipId = sailing.shipId
        }
        if (!enriched.departurePortId && sailing.embarkPortId) {
          enriched.departurePortId = sailing.embarkPortId
        }
        if (!enriched.arrivalPortId && sailing.disembarkPortId) {
          enriched.arrivalPortId = sailing.disembarkPortId
        }

        // 2. Region lookup from sailing_regions
        try {
          const [sailingRegion] = await this.db.client
            .select({
              regionId: cruiseSailingRegions.regionId,
            })
            .from(cruiseSailingRegions)
            .where(eq(cruiseSailingRegions.sailingId, sailing.id))
            .orderBy(desc(cruiseSailingRegions.isPrimary))
            .limit(1)

          if (sailingRegion && !enriched.cruiseRegionId) {
            enriched.cruiseRegionId = sailingRegion.regionId

            // Get region name
            const [region] = await this.db.client
              .select({ name: cruiseRegions.name })
              .from(cruiseRegions)
              .where(eq(cruiseRegions.id, sailingRegion.regionId))
              .limit(1)

            if (region && !enriched.region) {
              enriched.region = region.name
            }
          }
        } catch (e) {
          this.logger.warn(`Failed to enrich region for sailing ${sailing.id}: ${(e as Error).message}`)
        }

        // 3. Ship enrichment
        if (sailing.shipId) {
          try {
            const [ship] = await this.db.client
              .select({
                imageUrl: cruiseShips.imageUrl,
                shipClass: cruiseShips.shipClass,
              })
              .from(cruiseShips)
              .where(eq(cruiseShips.id, sailing.shipId))
              .limit(1)

            if (ship) {
              if (!enriched.shipImageUrl && ship.imageUrl) {
                enriched.shipImageUrl = ship.imageUrl
              }
              if (!enriched.shipClass && ship.shipClass) {
                enriched.shipClass = ship.shipClass
              }
            }
          } catch (e) {
            this.logger.warn(`Failed to enrich ship for sailing ${sailing.id}: ${(e as Error).message}`)
          }
        }

        // 4. Port timezone enrichment
        try {
          if (sailing.embarkPortId) {
            const [embarkPort] = await this.db.client
              .select({ metadata: cruisePorts.metadata })
              .from(cruisePorts)
              .where(eq(cruisePorts.id, sailing.embarkPortId))
              .limit(1)

            const embarkMeta = embarkPort?.metadata as Record<string, any> | null
            if (embarkMeta?.timezone && !enriched.departureTimezone) {
              enriched.departureTimezone = embarkMeta.timezone
            }
          }

          if (sailing.disembarkPortId) {
            const [disembarkPort] = await this.db.client
              .select({ metadata: cruisePorts.metadata })
              .from(cruisePorts)
              .where(eq(cruisePorts.id, sailing.disembarkPortId))
              .limit(1)

            const disembarkMeta = disembarkPort?.metadata as Record<string, any> | null
            if (disembarkMeta?.timezone && !enriched.arrivalTimezone) {
              enriched.arrivalTimezone = disembarkMeta.timezone
            }
          }
        } catch (e) {
          this.logger.warn(`Failed to enrich port timezones: ${(e as Error).message}`)
        }
      } else {
        this.logger.warn(`No catalog sailing found for codetocruiseid=${cruiseItem.codetocruiseid}`)
      }
    } catch (e) {
      this.logger.warn(`Failed to enrich from catalog: ${(e as Error).message}`)
    }

    return enriched
  }

  private parsePriceToCents(price: string | number | undefined): number | null {
    if (price === undefined || price === null) return null
    const num = typeof price === 'string' ? parseFloat(price) : price
    if (isNaN(num)) return null
    return Math.round(num * 100)
  }

  /**
   * Calculate total charge from ALL breakdown items (commissionable + non-commissionable).
   * This is the real "total charge" the client pays, including taxes/port charges.
   * Falls back to nettprice (cruise fare only) if breakdown is empty.
   */
  private calculateTotalChargeCents(
    breakdown: ImportBookingBreakdownItem[],
    nettPriceFallback: string | number | undefined,
  ): number | null {
    if (breakdown?.length) {
      let sum = 0
      for (const item of breakdown) {
        const itemCents = this.parsePriceToCents(item.itemprice) ?? 0
        if (itemCents > 0) {
          sum += itemCents * (item.quantity ?? 1)
        }
      }
      if (sum > 0) return sum
    }
    return this.parsePriceToCents(nettPriceFallback)
  }

  /**
   * Extract taxes and fees from FusionAPI breakdown items.
   * Non-commissionable items (commissionable === 0) are port charges, government fees, and taxes.
   */
  private extractTaxesAndFeesCents(
    breakdown: ImportBookingBreakdownItem[],
    totalPriceCents: number | null,
  ): number {
    if (!breakdown?.length) return 0
    let sum = 0
    for (const item of breakdown) {
      if (Number(item.commissionable) === 0) {
        const itemCents = this.parsePriceToCents(item.itemprice) ?? 0
        if (itemCents > 0) {
          sum += itemCents * (item.quantity ?? 1)
        }
      }
    }
    if (totalPriceCents !== null && totalPriceCents > 0) {
      return Math.max(0, Math.min(sum, totalPriceCents))
    }
    return Math.max(0, sum)
  }

  /**
   * Create payment schedule and record received payments from FusionAPI paymentinfo.
   *
   * Strategy:
   * - If a schedule already exists (re-import), skip creation and just record transactions
   * - Parse the cruise line's paymentschedule[] into expected payment items
   * - Ensure items sum exactly to totalPriceCents (required by validation)
   * - Use 'full' for single item, 'installments' for multiple
   *   (NOT 'deposit' — that requires depositType/depositPercentage fields we don't have)
   * - Record receivedtotal as payment transaction(s) against the expected items
   */
  private async createPaymentsFromImport(
    activityPricingId: string,
    paymentInfo: ImportBookingCruiseItem['paymentinfo'],
    totalPriceCents: number | null,
    currency: string,
    bookingReference: string,
    bookingDate?: string,
  ): Promise<void> {
    if (!totalPriceCents || totalPriceCents <= 0) {
      this.logger.debug('Skipping payment creation — no total price')
      return
    }

    // Log paymentinfo shape for investigation (keys only — no raw values for PCI/PII safety)
    this.logger.debug({
      message: 'Paymentinfo shape from FusionAPI',
      bookingReference,
      paymentInfoKeys: Object.keys(paymentInfo),
      hasPaymentRecords: !!(paymentInfo as any).paymentrecords,
      receivedTotal: paymentInfo.receivedtotal,
    })

    const receivedCents = this.parsePriceToCents(paymentInfo.receivedtotal) || 0

    // Check for existing schedule (re-import or partial failure recovery)
    const existingConfig = await this.paymentSchedulesService.findByActivityPricingId(activityPricingId)
    if (existingConfig) {
      this.logger.log(`Payment schedule already exists for pricing ${activityPricingId} — recording transactions only`)
      if (receivedCents > 0 && existingConfig.expectedPaymentItems?.length) {
        await this.recordPaymentTransactions(
          existingConfig.expectedPaymentItems,
          receivedCents,
          currency,
          bookingReference,
          bookingDate,
        )
      }
      return
    }

    const schedule = paymentInfo.paymentschedule || []

    // Build expected payment items from FusionAPI payment schedule
    const expectedItems: { paymentName: string; expectedAmountCents: number; dueDate: string | null; sequenceOrder: number }[] = []

    if (schedule.length > 0) {
      // Parse schedule items, filtering out zero/negative amounts
      const parsed: { amountCents: number; dueDate: string | null }[] = []
      for (const entry of schedule) {
        const amountCents = this.parsePriceToCents(entry.amount) || 0
        if (amountCents > 0) {
          parsed.push({ amountCents, dueDate: this.normalizeDueDate(entry.duedate) })
        }
      }

      if (parsed.length > 0) {
        const scheduleSum = parsed.reduce((sum, p) => sum + p.amountCents, 0)

        if (scheduleSum === totalPriceCents) {
          // Perfect match — use as-is
          for (let i = 0; i < parsed.length; i++) {
            expectedItems.push({
              paymentName: parsed.length === 1 ? 'Full Payment' : i === 0 ? 'Deposit' : i === parsed.length - 1 ? 'Final Payment' : `Payment ${i + 1}`,
              expectedAmountCents: parsed[i]!.amountCents,
              dueDate: parsed[i]!.dueDate,
              sequenceOrder: i + 1,
            })
          }
        } else if (scheduleSum < totalPriceCents) {
          // Schedule is less than total — add balance item
          for (let i = 0; i < parsed.length; i++) {
            expectedItems.push({
              paymentName: i === 0 ? 'Deposit' : `Payment ${i + 1}`,
              expectedAmountCents: parsed[i]!.amountCents,
              dueDate: parsed[i]!.dueDate,
              sequenceOrder: i + 1,
            })
          }
          expectedItems.push({
            paymentName: 'Final Payment',
            expectedAmountCents: totalPriceCents - scheduleSum,
            dueDate: null,
            sequenceOrder: expectedItems.length + 1,
          })
        } else {
          // Schedule exceeds total — ignore schedule, use single item
          this.logger.warn({
            message: 'FusionAPI payment schedule sum exceeds gross price — using single payment item',
            bookingReference,
            scheduleSumCents: scheduleSum,
            totalPriceCents,
          })
          expectedItems.push({
            paymentName: 'Full Payment',
            expectedAmountCents: totalPriceCents,
            dueDate: null,
            sequenceOrder: 1,
          })
        }
      }
    }

    // Fallback: no valid schedule items parsed — single full-payment item
    if (expectedItems.length === 0) {
      expectedItems.push({
        paymentName: 'Full Payment',
        expectedAmountCents: totalPriceCents,
        dueDate: null,
        sequenceOrder: 1,
      })
    }

    // 'full' for single item, 'installments' for multiple
    // (NOT 'deposit' — that requires depositType/depositPercentage we don't have)
    const scheduleType = expectedItems.length > 1 ? 'installments' as const : 'full' as const

    const config = await this.paymentSchedulesService.create({
      activityPricingId,
      scheduleType,
      allowPartialPayments: true,
      expectedPaymentItems: expectedItems,
    })

    // Record received payment as transaction(s)
    if (receivedCents > 0 && config.expectedPaymentItems && config.expectedPaymentItems.length > 0) {
      await this.recordPaymentTransactions(
        config.expectedPaymentItems,
        receivedCents,
        currency,
        bookingReference,
        bookingDate,
      )
    }
  }

  /**
   * Record payment transactions against expected payment items, distributing
   * the received amount across items in order.
   */
  private async recordPaymentTransactions(
    expectedItems: { id: string; expectedAmountCents: number }[],
    receivedCents: number,
    currency: string,
    bookingReference: string,
    bookingDate?: string,
  ): Promise<void> {
    // Use booking date if valid, otherwise fall back to now
    let transactionDate: string
    if (bookingDate && /^\d{4}-\d{2}-\d{2}$/.test(bookingDate) && !isNaN(Date.parse(bookingDate))) {
      // Append T12:00:00 to avoid timezone drift (date-only strings parse as UTC midnight)
      transactionDate = `${bookingDate}T12:00:00`
    } else {
      transactionDate = new Date().toISOString()
    }

    let remainingCents = receivedCents
    for (const item of expectedItems) {
      if (remainingCents <= 0) break
      const payAmount = Math.min(remainingCents, item.expectedAmountCents)
      await this.paymentSchedulesService.createTransaction({
        expectedPaymentItemId: item.id,
        transactionType: 'payment',
        amountCents: payAmount,
        currency,
        paymentMethod: null,
        referenceNumber: bookingReference,
        transactionDate,
        notes: `Imported from booking ${bookingReference}`,
      })
      remainingCents -= payAmount
    }

    if (remainingCents > 0) {
      // Excess is expected — receivedtotal from the cruise line includes the commission portion
      this.logger.debug({
        message: 'Received total includes commission portion beyond expected schedule',
        bookingReference,
        commissionPortionCents: remainingCents,
      })
    }

    this.logger.log({
      message: 'Payment transactions recorded for imported booking',
      bookingReference,
      receivedCents,
      recordedCents: receivedCents - remainingCents,
      itemCount: expectedItems.length,
    })
  }

  /**
   * Normalize a due date string from Traveltek to YYYY-MM-DD format.
   * Returns null if the date is invalid or missing.
   */
  private normalizeDueDate(duedate: string | undefined | null): string | null {
    if (!duedate) return null
    const trimmed = duedate.trim()
    // Already ISO date format
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
    // Try parsing as a date
    const parsed = new Date(trimmed)
    if (isNaN(parsed.getTime())) return null
    return parsed.toISOString().split('T')[0]!
  }

  /**
   * Normalize the raw Traveltek response into a consistent ImportBookingResult.
   * Handles two known response shapes:
   * 1. Standard: { cruiseitem, passengers, bookingdate, commission }
   * 2. Alternative: { bookingdetails.bookingitems[].cruisedetail, passengers, ... }
   */
  private normalizeImportResult(rawResult: Record<string, any>): ImportBookingResult {
    let cruiseitem: ImportBookingCruiseItem | undefined

    // Shape 1: standard response with cruiseitem at top level
    if (rawResult.cruiseitem) {
      cruiseitem = rawResult.cruiseitem as ImportBookingCruiseItem
    }

    // Shape 2: alternative response with bookingdetails.bookingitems[].cruisedetail
    if (!cruiseitem) {
      const bookingItems = rawResult.bookingdetails?.bookingitems
      if (Array.isArray(bookingItems)) {
        const cruiseEntry = bookingItems.find(
          (item: Record<string, any>) => item.cruisedetail,
        )
        if (cruiseEntry?.cruisedetail) {
          cruiseitem = cruiseEntry.cruisedetail as ImportBookingCruiseItem
        }
      }
    }

    if (!cruiseitem) {
      throw new BadRequestException('No cruise data found in Traveltek response')
    }

    // Validate minimal required fields
    if (!cruiseitem.startdate || !cruiseitem.enddate || !cruiseitem.codetocruiseid) {
      throw new BadRequestException('Cruise data missing required fields (startdate, enddate, codetocruiseid)')
    }

    // Normalize passengers to a validated array
    const passengers = Array.isArray(rawResult.passengers) ? rawResult.passengers : []

    // Normalize commission to a finite number
    let commission = 0
    if (typeof rawResult.commission === 'object' && rawResult.commission !== null) {
      commission = Number(rawResult.commission.amount) || 0
    } else if (rawResult.commission !== undefined && rawResult.commission !== null) {
      commission = Number(rawResult.commission) || 0
    }
    if (!Number.isFinite(commission)) commission = 0

    return {
      cruiseitem,
      passengers,
      bookingdate: rawResult.bookingdate,
      commission,
      bookingid: rawResult.bookingid,
      portfolioid: rawResult.portfolioid,
    }
  }

  private normalizeExtras(extras: unknown): Record<string, unknown>[] | null {
    if (!extras) return null
    if (Array.isArray(extras)) {
      const filtered = extras.filter(
        (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
      )
      return filtered.length > 0 ? filtered : null
    }
    if (typeof extras === 'object') return [extras as Record<string, unknown>]
    return null
  }

  private normalizePrefix(title: string): string | undefined {
    const lower = (title || '').toLowerCase().replace('.', '')
    const map: Record<string, string> = {
      mr: 'Mr.',
      mrs: 'Mrs.',
      ms: 'Ms.',
      miss: 'Ms.',
      dr: 'Dr.',
      mx: 'Mx.',
    }
    return map[lower]
  }

  private sanitizeNationality(nationality: string): string | undefined {
    if (!nationality) return undefined
    const trimmed = nationality.trim()
    if (trimmed.length >= 2 && trimmed.length <= 3) {
      return trimmed.toUpperCase()
    }
    // DB column is varchar(3) — don't risk saving full country names
    return undefined
  }
}
