import { Injectable, Logger } from '@nestjs/common'
import { eq, and, ilike, gte, lte, or, asc, desc } from 'drizzle-orm'
import { addDays, parseISO, format } from 'date-fns'
import { DatabaseService } from '../db/database.service'
import { schema } from '@tailfire/database'
import type { CruisePortCall } from '@tailfire/shared-types'
import type { SailingMatchResult, CruiseCatalogEnrichment } from './catalog-matcher.types'

const {
  cruiseSailings,
  cruiseShips,
  cruiseShipImages,
  cruiseShipDecks,
  cruiseLines,
  cruisePorts,
  cruiseRegions,
  cruiseSailingRegions,
  cruiseSailingStops,
} = schema

@Injectable()
export class CatalogMatcherService {
  private readonly logger = new Logger(CatalogMatcherService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Normalize a name for fuzzy matching: trim, lowercase, strip punctuation.
   */
  normalizeName(name: string | null | undefined): string {
    if (!name) return ''
    return name.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
  }

  /**
   * Match cruise data against catalog sailings using multi-tier strategy.
   *
   * Tiers (in order of reliability):
   * 1. Voyage code + date (±7 days)
   * 2. Ship + cruise line + date + nights (±1 day)
   * 3. Ship + date + nights (±1 day)
   * 4. Cruise line + embark port + date + nights (±1 day)
   *
   * Returns match result or null if no confident match.
   */
  async matchCatalogSailing(params: {
    cruiseLineName?: string | null
    shipName?: string | null
    departureDate?: string | null
    voyageCode?: string | null
    nights?: number | null
    departurePort?: string | null
  }): Promise<SailingMatchResult | null> {
    const { cruiseLineName, shipName, departureDate, voyageCode, nights, departurePort } = params

    if (!departureDate) return null

    const sailDateParsed = parseISO(departureDate)

    // Tier 1: Voyage code + date (±7 days)
    if (voyageCode) {
      const dateLow = format(addDays(sailDateParsed, -7), 'yyyy-MM-dd')
      const dateHigh = format(addDays(sailDateParsed, 7), 'yyyy-MM-dd')

      const candidates = await this.db.client
        .select({
          id: cruiseSailings.id,
          sailDate: cruiseSailings.sailDate,
          endDate: cruiseSailings.endDate,
          providerIdentifier: cruiseSailings.providerIdentifier,
          cruiseLineId: cruiseSailings.cruiseLineId,
          shipId: cruiseSailings.shipId,
          embarkPortId: cruiseSailings.embarkPortId,
          disembarkPortId: cruiseSailings.disembarkPortId,
          nights: cruiseSailings.nights,
        })
        .from(cruiseSailings)
        .where(
          and(
            eq(cruiseSailings.voyageCode, voyageCode),
            gte(cruiseSailings.sailDate, dateLow),
            lte(cruiseSailings.sailDate, dateHigh),
            eq(cruiseSailings.isActive, true),
          ),
        )
        .limit(5)

      if (candidates.length === 1) {
        return {
          sailingId: candidates[0]!.id,
          strategy: 'voyage_code+date',
          score: 5,
          candidateCount: 1,
          sailDate: candidates[0]!.sailDate,
          endDate: candidates[0]!.endDate,
          providerIdentifier: candidates[0]!.providerIdentifier,
          cruiseLineId: candidates[0]!.cruiseLineId,
          shipId: candidates[0]!.shipId,
          embarkPortId: candidates[0]!.embarkPortId,
          disembarkPortId: candidates[0]!.disembarkPortId,
        }
      }
    }

    const dateLow1 = format(addDays(sailDateParsed, -1), 'yyyy-MM-dd')
    const dateHigh1 = format(addDays(sailDateParsed, 1), 'yyyy-MM-dd')

    // Tier 2: Ship + cruise line + date + nights (±1 day)
    if (shipName && cruiseLineName && nights) {
      const normalizedShip = this.normalizeName(shipName)
      const normalizedLine = this.normalizeName(cruiseLineName)

      const candidates = await this.db.client
        .select({
          id: cruiseSailings.id,
          sailDate: cruiseSailings.sailDate,
          endDate: cruiseSailings.endDate,
          providerIdentifier: cruiseSailings.providerIdentifier,
          cruiseLineId: cruiseSailings.cruiseLineId,
          shipId: cruiseSailings.shipId,
          embarkPortId: cruiseSailings.embarkPortId,
          disembarkPortId: cruiseSailings.disembarkPortId,
          nights: cruiseSailings.nights,
        })
        .from(cruiseSailings)
        .innerJoin(cruiseShips, eq(cruiseSailings.shipId, cruiseShips.id))
        .innerJoin(cruiseLines, eq(cruiseSailings.cruiseLineId, cruiseLines.id))
        .where(
          and(
            ilike(cruiseShips.name, `%${normalizedShip}%`),
            ilike(cruiseLines.name, `%${normalizedLine}%`),
            gte(cruiseSailings.sailDate, dateLow1),
            lte(cruiseSailings.sailDate, dateHigh1),
            eq(cruiseSailings.nights, nights),
            eq(cruiseSailings.isActive, true),
          ),
        )
        .limit(5)

      if (candidates.length === 1) {
        return {
          sailingId: candidates[0]!.id,
          strategy: 'ship+line+date+nights',
          score: 4,
          candidateCount: 1,
          sailDate: candidates[0]!.sailDate,
          endDate: candidates[0]!.endDate,
          providerIdentifier: candidates[0]!.providerIdentifier,
          cruiseLineId: candidates[0]!.cruiseLineId,
          shipId: candidates[0]!.shipId,
          embarkPortId: candidates[0]!.embarkPortId,
          disembarkPortId: candidates[0]!.disembarkPortId,
        }
      }
    }

    // Tier 3: Ship + date + nights (±1 day)
    if (shipName && nights) {
      const normalizedShip = this.normalizeName(shipName)

      const candidates = await this.db.client
        .select({
          id: cruiseSailings.id,
          sailDate: cruiseSailings.sailDate,
          endDate: cruiseSailings.endDate,
          providerIdentifier: cruiseSailings.providerIdentifier,
          cruiseLineId: cruiseSailings.cruiseLineId,
          shipId: cruiseSailings.shipId,
          embarkPortId: cruiseSailings.embarkPortId,
          disembarkPortId: cruiseSailings.disembarkPortId,
          nights: cruiseSailings.nights,
        })
        .from(cruiseSailings)
        .innerJoin(cruiseShips, eq(cruiseSailings.shipId, cruiseShips.id))
        .where(
          and(
            ilike(cruiseShips.name, `%${normalizedShip}%`),
            gte(cruiseSailings.sailDate, dateLow1),
            lte(cruiseSailings.sailDate, dateHigh1),
            eq(cruiseSailings.nights, nights),
            eq(cruiseSailings.isActive, true),
          ),
        )
        .limit(5)

      if (candidates.length === 1) {
        return {
          sailingId: candidates[0]!.id,
          strategy: 'ship+date+nights',
          score: 3,
          candidateCount: 1,
          sailDate: candidates[0]!.sailDate,
          endDate: candidates[0]!.endDate,
          providerIdentifier: candidates[0]!.providerIdentifier,
          cruiseLineId: candidates[0]!.cruiseLineId,
          shipId: candidates[0]!.shipId,
          embarkPortId: candidates[0]!.embarkPortId,
          disembarkPortId: candidates[0]!.disembarkPortId,
        }
      }
    }

    // Tier 4: Cruise line + embark port + date + nights (±1 day)
    if (cruiseLineName && departurePort && nights) {
      const normalizedLine = this.normalizeName(cruiseLineName)
      const normalizedPort = this.normalizeName(departurePort)

      const candidates = await this.db.client
        .select({
          id: cruiseSailings.id,
          sailDate: cruiseSailings.sailDate,
          endDate: cruiseSailings.endDate,
          providerIdentifier: cruiseSailings.providerIdentifier,
          cruiseLineId: cruiseSailings.cruiseLineId,
          shipId: cruiseSailings.shipId,
          embarkPortId: cruiseSailings.embarkPortId,
          disembarkPortId: cruiseSailings.disembarkPortId,
          nights: cruiseSailings.nights,
        })
        .from(cruiseSailings)
        .innerJoin(cruiseLines, eq(cruiseSailings.cruiseLineId, cruiseLines.id))
        .leftJoin(cruisePorts, eq(cruiseSailings.embarkPortId, cruisePorts.id))
        .where(
          and(
            ilike(cruiseLines.name, `%${normalizedLine}%`),
            or(
              ilike(cruisePorts.name, `%${normalizedPort}%`),
              ilike(cruiseSailings.embarkPortName, `%${normalizedPort}%`),
            ),
            gte(cruiseSailings.sailDate, dateLow1),
            lte(cruiseSailings.sailDate, dateHigh1),
            eq(cruiseSailings.nights, nights),
            eq(cruiseSailings.isActive, true),
          ),
        )
        .limit(5)

      if (candidates.length === 1) {
        return {
          sailingId: candidates[0]!.id,
          strategy: 'line+port+date+nights',
          score: 3,
          candidateCount: 1,
          sailDate: candidates[0]!.sailDate,
          endDate: candidates[0]!.endDate,
          providerIdentifier: candidates[0]!.providerIdentifier,
          cruiseLineId: candidates[0]!.cruiseLineId,
          shipId: candidates[0]!.shipId,
          embarkPortId: candidates[0]!.embarkPortId,
          disembarkPortId: candidates[0]!.disembarkPortId,
        }
      }
    }

    return null
  }

  /**
   * Enrich a cruise activity from the Traveltek catalog.
   * Fetches: sailing stops → port calls, region, ship image/class, port timezones & GPS coordinates.
   * Synthesizes dates from sailDate + dayNumber for each stop.
   */
  async enrichCruiseFromSailing(match: {
    sailingId: string
    sailDate: string
    endDate: string
    providerIdentifier: string
    cruiseLineId: string
    shipId: string
    embarkPortId: string | null
    disembarkPortId: string | null
  }): Promise<CruiseCatalogEnrichment> {
    const result: CruiseCatalogEnrichment = {
      portCallsJson: [] as CruisePortCall[],
      cruiseLineId: match.cruiseLineId,
      cruiseShipId: match.shipId,
      cruiseRegionId: null,
      region: null,
      shipImageUrl: null,
      shipClass: null,
      shipGalleryImages: [],
      deckPlanImages: [],
      cruiseLineLogo: null,
      departurePortId: match.embarkPortId,
      arrivalPortId: match.disembarkPortId,
      departureTimezone: null,
      arrivalTimezone: null,
      departurePort: null,
      arrivalPort: null,
      canonicalSailDate: match.sailDate,
      canonicalEndDate: match.endDate,
    }

    // 1. Fetch sailing stops and synthesize dates from sailDate + dayNumber
    try {
      const stops = await this.db.client
        .select({
          dayNumber: cruiseSailingStops.dayNumber,
          portName: cruiseSailingStops.portName,
          portId: cruiseSailingStops.portId,
          isSeaDay: cruiseSailingStops.isSeaDay,
          arrivalTime: cruiseSailingStops.arrivalTime,
          departureTime: cruiseSailingStops.departureTime,
          sequenceOrder: cruiseSailingStops.sequenceOrder,
          portLatitude: cruisePorts.metadata,
        })
        .from(cruiseSailingStops)
        .leftJoin(cruisePorts, eq(cruiseSailingStops.portId, cruisePorts.id))
        .where(eq(cruiseSailingStops.sailingId, match.sailingId))
        .orderBy(asc(cruiseSailingStops.dayNumber), asc(cruiseSailingStops.sequenceOrder))

      const sailDateParsed = parseISO(match.sailDate)

      result.portCallsJson = stops.map((stop) => {
        const stopDate = format(addDays(sailDateParsed, stop.dayNumber - 1), 'yyyy-MM-dd')
        const portMeta = stop.portLatitude as Record<string, any> | null

        return {
          day: stop.dayNumber,
          portName: stop.portName,
          portId: stop.portId || undefined,
          arriveDate: stopDate,
          departDate: stopDate,
          arriveTime: stop.arrivalTime || '',
          departTime: stop.departureTime || '',
          isSeaDay: stop.isSeaDay || false,
          latitude: portMeta?.latitude ? String(portMeta.latitude) : undefined,
          longitude: portMeta?.longitude ? String(portMeta.longitude) : undefined,
        }
      })
    } catch (e) {
      this.logger.warn(`Failed to fetch sailing stops for ${match.sailingId}: ${(e as Error).message}`)
    }

    // 2. Region lookup from sailing_regions
    try {
      const [sailingRegion] = await this.db.client
        .select({ regionId: cruiseSailingRegions.regionId })
        .from(cruiseSailingRegions)
        .where(eq(cruiseSailingRegions.sailingId, match.sailingId))
        .orderBy(desc(cruiseSailingRegions.isPrimary))
        .limit(1)

      if (sailingRegion) {
        result.cruiseRegionId = sailingRegion.regionId

        const [region] = await this.db.client
          .select({ name: cruiseRegions.name })
          .from(cruiseRegions)
          .where(eq(cruiseRegions.id, sailingRegion.regionId))
          .limit(1)

        if (region) {
          result.region = region.name
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to enrich region for sailing ${match.sailingId}: ${(e as Error).message}`)
    }

    // 3. Ship enrichment (image, class, gallery, deck plans)
    try {
      const [ship] = await this.db.client
        .select({
          imageUrl: cruiseShips.imageUrl,
          shipClass: cruiseShips.shipClass,
        })
        .from(cruiseShips)
        .where(eq(cruiseShips.id, match.shipId))
        .limit(1)

      if (ship) {
        result.shipImageUrl = ship.imageUrl
        result.shipClass = ship.shipClass
      }

      // Ship gallery images from normalized table
      const galleryImages = await this.db.client
        .select({
          imageUrl: cruiseShipImages.imageUrl,
          altText: cruiseShipImages.altText,
          isHero: cruiseShipImages.isHero,
        })
        .from(cruiseShipImages)
        .where(and(
          eq(cruiseShipImages.shipId, match.shipId),
          eq(cruiseShipImages.isActive, true),
        ))
        .orderBy(asc(cruiseShipImages.displayOrder))

      result.shipGalleryImages = galleryImages.map((img) => ({
        url: img.imageUrl,
        caption: img.altText || undefined,
        isHero: img.isHero,
      }))

      // Deck plan images
      const decks = await this.db.client
        .select({
          deckPlanUrl: cruiseShipDecks.deckPlanUrl,
          name: cruiseShipDecks.name,
        })
        .from(cruiseShipDecks)
        .where(and(
          eq(cruiseShipDecks.shipId, match.shipId),
          eq(cruiseShipDecks.isActive, true),
        ))
        .orderBy(asc(cruiseShipDecks.displayOrder))

      result.deckPlanImages = decks
        .filter((d) => d.deckPlanUrl)
        .map((d) => ({
          url: d.deckPlanUrl!,
          caption: `Deck Plan — ${d.name}`,
        }))
    } catch (e) {
      this.logger.warn(`Failed to enrich ship for sailing ${match.sailingId}: ${(e as Error).message}`)
    }

    // 3b. Cruise line logo
    try {
      const [line] = await this.db.client
        .select({ metadata: cruiseLines.metadata })
        .from(cruiseLines)
        .where(eq(cruiseLines.id, match.cruiseLineId))
        .limit(1)

      const lineMeta = line?.metadata as Record<string, any> | null
      if (lineMeta?.logo_url) {
        result.cruiseLineLogo = lineMeta.logo_url
      }
    } catch (e) {
      this.logger.warn(`Failed to enrich cruise line logo: ${(e as Error).message}`)
    }

    // 4. Port timezone enrichment + port names
    try {
      if (match.embarkPortId) {
        const [embarkPort] = await this.db.client
          .select({ metadata: cruisePorts.metadata, name: cruisePorts.name })
          .from(cruisePorts)
          .where(eq(cruisePorts.id, match.embarkPortId))
          .limit(1)

        const embarkMeta = embarkPort?.metadata as Record<string, any> | null
        if (embarkMeta?.timezone) {
          result.departureTimezone = embarkMeta.timezone
        }
        if (embarkPort?.name) {
          result.departurePort = embarkPort.name
        }
      }

      if (match.disembarkPortId) {
        const [disembarkPort] = await this.db.client
          .select({ metadata: cruisePorts.metadata, name: cruisePorts.name })
          .from(cruisePorts)
          .where(eq(cruisePorts.id, match.disembarkPortId))
          .limit(1)

        const disembarkMeta = disembarkPort?.metadata as Record<string, any> | null
        if (disembarkMeta?.timezone) {
          result.arrivalTimezone = disembarkMeta.timezone
        }
        if (disembarkPort?.name) {
          result.arrivalPort = disembarkPort.name
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to enrich port timezones: ${(e as Error).message}`)
    }

    return result
  }
}
