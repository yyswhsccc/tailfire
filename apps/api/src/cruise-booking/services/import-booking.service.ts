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
import { eq, and, desc } from 'drizzle-orm'
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
import type { AuthContext } from '../../auth/auth.types'
import type { ImportBookingPreviewDto, ImportBookingConfirmDto } from '../dto/import-booking.dto'
import type {
  ImportBookingResult,
  ImportBookingCruiseItem,
  ImportBookingPassenger,
  ImportBookingItineraryPort,
} from '../types/fusion-api.types'
import type { CustomCruiseDetailsDto, CruisePortCall, CreateTripTravelerDto } from '@tailfire/shared-types'

const { customCruiseDetails, cruiseLines, cruiseSailings, cruiseShips, cruisePorts, cruiseRegions, cruiseSailingRegions } = schema

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
          status: 'booked',
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
    const totalPriceCents = this.parsePriceToCents(cruiseItem.grossprice)
    const commissionCents = result.commission
      ? Math.round(result.commission * 100)
      : null

    const cruiseActivity = await this.componentOrchestrationService.createCustomCruise({
      itineraryDayId: departureDay.id,
      componentType: 'custom_cruise',
      name: cruiseItem.name || `Cruise ${dto.bookingReference}`,
      startDatetime: cruiseItem.startdate,
      endDatetime: cruiseItem.enddate,
      status: 'confirmed',
      currency: dto.currency ?? 'CAD',
      totalPriceCents: totalPriceCents,
      commissionTotalCents: commissionCents,
      supplier: cruiseItem.suppliername || null,
      bookingReference: dto.bookingReference,
      customCruiseDetails: cruiseDetails,
    })

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
      message: 'Cruise booking imported successfully',
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
      // Validate DOB format before using in DB queries/writes
      const rawDob = pax.dob || null
      const dob = rawDob && /^\d{4}-\d{2}-\d{2}$/.test(rawDob) && !isNaN(Date.parse(rawDob))
        ? rawDob
        : null
      const existing = await this.db.client
        .select({ id: this.db.schema.contacts.id })
        .from(this.db.schema.contacts)
        .where(
          and(
            eq(this.db.schema.contacts.agencyId, auth.agencyId),
            eq(this.db.schema.contacts.firstName, pax.firstname),
            eq(this.db.schema.contacts.lastName, pax.lastname),
            ...(dob ? [eq(this.db.schema.contacts.dateOfBirth, dob)] : []),
          ),
        )
        .limit(1)

      if (existing[0]) {
        const isHighConfidence = !!dob // DOB was part of the match query

        if (isHighConfidence) {
          // Additively update empty fields on the matched contact
          const fullContact = await this.db.client
            .select()
            .from(this.db.schema.contacts)
            .where(eq(this.db.schema.contacts.id, existing[0].id))
            .limit(1)

          const contact = fullContact[0]
          if (contact) {
            const updates: Record<string, any> = {}
            if (!contact.gender && pax.gender) updates.gender = this.normalizeGender(pax.gender)
            if (!contact.nationality && pax.nationality) updates.nationality = this.sanitizeNationality(pax.nationality)
            if (!contact.dateOfBirth && dob) updates.dateOfBirth = dob
            if (!contact.middleName && pax.middlename) updates.middleName = pax.middlename
            if (!contact.prefix && pax.title) updates.prefix = this.normalizePrefix(pax.title)

            if (Object.keys(updates).length > 0) {
              try {
                await this.contactsService.update(existing[0].id, updates, auth.agencyId, auth.userId)
                this.logger.log(`Updated contact ${existing[0].id} with ${Object.keys(updates).join(', ')}`)
              } catch (e) {
                this.logger.warn(`Failed to update contact ${existing[0].id}: ${(e as Error).message}`)
              }
            }
          }
        } else {
          this.logger.debug(`Skipping additive update for ${pax.firstname} ${pax.lastname} — low confidence match (no DOB)`)
        }

        map.set(pax.paxno, existing[0].id)
      } else {
        // Create new contact
        const contact = await this.contactsService.create(
          {
            firstName: pax.firstname,
            lastName: pax.lastname,
            middleName: pax.middlename || undefined,
            prefix: this.normalizePrefix(pax.title),
            dateOfBirth: dob || undefined,
            gender: this.normalizeGender(pax.gender),
            nationality: this.sanitizeNationality(pax.nationality),
            contactType: 'client',
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
        pricing: {
          grossPrice: cruiseItem.grossprice,
          netPrice: cruiseItem.nettprice,
          price: cruiseItem.price,
          currency: cruiseItem.scurrency,
        },
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
