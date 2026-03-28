/**
 * Sailing Detail DTOs
 *
 * Response DTOs for sailing detail API.
 * Includes full sailing info, itinerary, prices, and ship images (paginated).
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// ============================================================================
// ITINERARY STOP DTO
// ============================================================================

export class ItineraryStopDto {
  @ApiProperty({ description: 'Day number (1-indexed)' })
  dayNumber!: number

  @ApiProperty({ description: 'Port name or "At Sea"' })
  portName!: string

  @ApiPropertyOptional({ description: 'Port UUID (null for sea days)' })
  portId!: string | null

  @ApiProperty({ description: 'Is this a sea day' })
  isSeaDay!: boolean

  @ApiPropertyOptional({ description: 'Arrival time (HH:mm)' })
  arrivalTime!: string | null

  @ApiPropertyOptional({ description: 'Departure time (HH:mm)' })
  departureTime!: string | null

  @ApiPropertyOptional({ description: 'Destination slug for port drill-down links' })
  destinationSlug?: string | null
}

// ============================================================================
// CABIN PRICE DTO
// ============================================================================

export class CabinPriceDto {
  @ApiProperty({ description: 'Cabin code' })
  cabinCode!: string

  @ApiProperty({ description: 'Normalized category (inside/oceanview/balcony/suite)' })
  cabinCategory!: string

  @ApiProperty({ description: 'Occupancy (default: 2)' })
  occupancy!: number

  @ApiProperty({ description: 'Base price (CAD cents)' })
  basePriceCents!: number

  @ApiProperty({ description: 'Taxes (CAD cents)' })
  taxesCents!: number

  @ApiProperty({ description: 'Total price (base + taxes) in CAD cents' })
  totalPriceCents!: number

  @ApiProperty({ description: 'Is price per person (vs per cabin)' })
  isPerPerson!: boolean
}

// ============================================================================
// SHIP IMAGE DTO (for paginated images)
// ============================================================================

export class ShipImageDto {
  @ApiProperty({ description: 'Image UUID' })
  id!: string

  @ApiProperty({ description: 'Image URL' })
  url!: string

  @ApiPropertyOptional({ description: 'Thumbnail URL' })
  thumbnailUrl!: string | null

  @ApiPropertyOptional({ description: 'Alt text' })
  altText!: string | null

  @ApiProperty({ description: 'Image type (ship, cabin, deck, dining, etc.)' })
  imageType!: string

  @ApiProperty({ description: 'Is hero/featured image' })
  isHero!: boolean
}

export class ShipImagesResponseDto {
  @ApiProperty({ type: [ShipImageDto] })
  images!: ShipImageDto[]

  @ApiProperty({ description: 'Pagination metadata' })
  pagination!: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasMore: boolean
  }
}

// ============================================================================
// SHIP IMAGE METADATA DTO (for ship images from metadata)
// ============================================================================

export class ShipImageMetadataDto {
  @ApiPropertyOptional({ description: 'Standard resolution URL' })
  url!: string | null

  @ApiPropertyOptional({ description: 'HD resolution URL' })
  urlHd!: string | null

  @ApiPropertyOptional({ description: '2K resolution URL' })
  url2k!: string | null

  @ApiPropertyOptional({ description: 'Image caption' })
  caption!: string | null

  @ApiProperty({ description: 'Is this the default ship image' })
  isDefault!: boolean
}

// ============================================================================
// SHIP DETAIL DTO
// ============================================================================

export class ShipDetailDto {
  @ApiProperty({ description: 'Ship UUID' })
  id!: string

  @ApiProperty({ description: 'Ship name' })
  name!: string

  @ApiPropertyOptional({ description: 'Ship slug' })
  slug!: string

  @ApiPropertyOptional({ description: 'Ship class' })
  shipClass!: string | null

  @ApiPropertyOptional({ description: 'Main image URL' })
  imageUrl!: string | null

  @ApiPropertyOptional({ description: 'Year built' })
  yearBuilt!: number | null

  @ApiPropertyOptional({ description: 'Gross tonnage' })
  tonnage!: number | null

  @ApiPropertyOptional({ description: 'Passenger capacity' })
  passengerCapacity!: number | null

  @ApiPropertyOptional({ description: 'Crew count' })
  crewCount!: number | null

  @ApiPropertyOptional({ type: [String], description: 'Amenities list' })
  amenities!: string[] | null

  @ApiPropertyOptional({
    type: [ShipImageMetadataDto],
    description: 'All ship images (multiple resolutions with captions)',
  })
  images!: ShipImageMetadataDto[] | null
}

// ============================================================================
// CRUISE LINE DETAIL DTO
// ============================================================================

export class CruiseLineDetailDto {
  @ApiProperty({ description: 'Cruise line UUID' })
  id!: string

  @ApiProperty({ description: 'Cruise line name' })
  name!: string

  @ApiPropertyOptional({ description: 'Cruise line slug' })
  slug!: string

  @ApiPropertyOptional({ description: 'Logo URL' })
  logoUrl!: string | null

  @ApiPropertyOptional({ description: 'Website URL' })
  websiteUrl!: string | null
}

// ============================================================================
// REGION DTO
// ============================================================================

export class RegionDto {
  @ApiProperty({ description: 'Region UUID' })
  id!: string

  @ApiProperty({ description: 'Region name' })
  name!: string

  @ApiProperty({ description: 'Is primary region for this sailing' })
  isPrimary!: boolean
}

// ============================================================================
// PORT DETAIL DTO
// ============================================================================

export class PortDetailDto {
  @ApiProperty({ description: 'Port UUID' })
  id!: string

  @ApiProperty({ description: 'Port name' })
  name!: string

  @ApiPropertyOptional({ description: 'Country' })
  country!: string | null

  @ApiPropertyOptional({ description: 'Latitude' })
  latitude!: number | null

  @ApiPropertyOptional({ description: 'Longitude' })
  longitude!: number | null
}

// ============================================================================
// ALTERNATE SAILING DTO
// ============================================================================

export class AlternateSailingBasicDto {
  @ApiProperty({ description: 'Alternate sailing UUID' })
  id!: string

  @ApiProperty({ description: 'Sailing name' })
  name!: string

  @ApiProperty({ description: 'Number of nights' })
  nights!: number

  @ApiProperty({ description: 'Ship info' })
  ship!: {
    id: string
    name: string
  }
}

export class AlternateSailingDto {
  @ApiProperty({ description: 'Alternate sailing record UUID' })
  id!: string

  @ApiPropertyOptional({ description: 'Resolved alternate sailing UUID (null if not yet imported)' })
  alternateSailingId!: string | null

  @ApiProperty({ description: 'Provider sailing ID' })
  providerIdentifier!: string

  @ApiPropertyOptional({ description: 'Alternate sail date (YYYY-MM-DD)' })
  alternateSailDate!: string | null

  @ApiPropertyOptional({ description: 'Alternate nights' })
  alternateNights!: number | null

  @ApiPropertyOptional({ description: 'Alternate lead price (CAD cents)' })
  alternateLeadPriceCents!: number | null

  @ApiPropertyOptional({
    type: AlternateSailingBasicDto,
    description: 'Full sailing details (if resolved)',
  })
  sailing!: AlternateSailingBasicDto | null
}

export class AlternateSailingsResponseDto {
  @ApiProperty({ description: 'Source sailing UUID' })
  sailingId!: string

  @ApiProperty({ type: [AlternateSailingDto], description: 'Alternate sailings' })
  alternates!: AlternateSailingDto[]
}

// ============================================================================
// CABIN LOCATION DTO (for interactive deck plans)
// ============================================================================

export class CabinLocationDto {
  @ApiProperty({ description: 'Cabin ID' })
  cabinId!: string

  @ApiProperty({ description: 'X1 coordinate (left)' })
  x1!: number

  @ApiProperty({ description: 'Y1 coordinate (top)' })
  y1!: number

  @ApiProperty({ description: 'X2 coordinate (right)' })
  x2!: number

  @ApiProperty({ description: 'Y2 coordinate (bottom)' })
  y2!: number
}

// ============================================================================
// SHIP DECK DTO (for deck plans endpoint)
// ============================================================================

export class ShipDeckDto {
  @ApiProperty({ description: 'Deck UUID' })
  id!: string

  @ApiProperty({ description: 'Deck name' })
  name!: string

  @ApiPropertyOptional({ description: 'Deck number' })
  deckNumber!: number | null

  @ApiPropertyOptional({ description: 'Deck plan image URL' })
  deckPlanUrl!: string | null

  @ApiPropertyOptional({ description: 'Deck description' })
  description!: string | null

  @ApiProperty({ description: 'Display order' })
  displayOrder!: number

  @ApiProperty({
    type: [CabinLocationDto],
    description: 'Cabin locations for interactive deck plan',
  })
  cabinLocations!: CabinLocationDto[]
}

export class ShipDecksResponseDto {
  @ApiProperty({ description: 'Ship UUID' })
  shipId!: string

  @ApiProperty({ type: [ShipDeckDto], description: 'Ship decks with cabin locations' })
  decks!: ShipDeckDto[]
}

// ============================================================================
// CABIN IMAGE DTO (for cabin gallery endpoint)
// ============================================================================

export class CabinImageDto {
  @ApiProperty({ description: 'Image UUID' })
  id!: string

  @ApiProperty({ description: 'Image URL' })
  imageUrl!: string

  @ApiPropertyOptional({ description: 'HD resolution URL' })
  imageUrlHd!: string | null

  @ApiPropertyOptional({ description: '2K resolution URL' })
  imageUrl2k!: string | null

  @ApiPropertyOptional({ description: 'Image caption' })
  caption!: string | null

  @ApiProperty({ description: 'Display order (0-indexed)' })
  displayOrder!: number

  @ApiProperty({ description: 'Is default/hero image' })
  isDefault!: boolean
}

export class CabinImagesResponseDto {
  @ApiProperty({ description: 'Cabin type UUID' })
  cabinTypeId!: string

  @ApiProperty({ type: [CabinImageDto], description: 'Cabin gallery images' })
  images!: CabinImageDto[]
}

// ============================================================================
// MAIN SAILING DETAIL RESPONSE DTO
// ============================================================================

export class SailingDetailResponseDto {
  @ApiProperty({ description: 'Sailing UUID' })
  id!: string

  @ApiProperty({ description: 'Provider (e.g., traveltek)' })
  provider!: string

  @ApiProperty({ description: 'Provider-specific sailing ID' })
  providerIdentifier!: string

  @ApiProperty({ description: 'Sailing name/title' })
  name!: string

  @ApiProperty({ description: 'Sail date (YYYY-MM-DD)' })
  sailDate!: string

  @ApiProperty({ description: 'End date (YYYY-MM-DD)' })
  endDate!: string

  @ApiProperty({ description: 'Number of nights' })
  nights!: number

  @ApiProperty({ description: 'Ship details' })
  ship!: ShipDetailDto

  @ApiProperty({ description: 'Cruise line details' })
  cruiseLine!: CruiseLineDetailDto

  @ApiProperty({ description: 'Embark port' })
  embarkPort!: PortDetailDto | null

  @ApiPropertyOptional({ description: 'Embark port name (fallback when port not in DB)' })
  embarkPortName!: string | null

  @ApiProperty({ description: 'Disembark port' })
  disembarkPort!: PortDetailDto | null

  @ApiPropertyOptional({ description: 'Disembark port name (fallback when port not in DB)' })
  disembarkPortName!: string | null

  @ApiProperty({ type: [RegionDto], description: 'Associated regions' })
  regions!: RegionDto[]

  @ApiProperty({ type: [ItineraryStopDto], description: 'Itinerary (day-by-day stops)' })
  itinerary!: ItineraryStopDto[]

  @ApiProperty({ description: 'Price summary (CAD cents, NULL if not available)' })
  priceSummary!: {
    cheapestInside: number | null
    cheapestOceanview: number | null
    cheapestBalcony: number | null
    cheapestSuite: number | null
  }

  @ApiProperty({ type: [CabinPriceDto], description: 'All cabin prices' })
  prices!: CabinPriceDto[]

  @ApiProperty({ description: 'Last sync timestamp (ISO 8601)' })
  lastSyncedAt!: string

  @ApiProperty({ description: 'Is pricing currently being updated' })
  pricesUpdating!: boolean

  @ApiPropertyOptional({ description: 'Market ID (Traveltek)' })
  marketId!: number | null

  @ApiPropertyOptional({ description: 'Is no-fly cruise (embark from UK)' })
  noFly!: boolean | null

  @ApiPropertyOptional({ description: 'Departs from UK' })
  departUk!: boolean | null

  @ApiPropertyOptional({ description: 'Additional metadata' })
  metadata!: {
    bookingUrl?: string
    cruiseCode?: string
    itineraryName?: string
    promoText?: string
    [key: string]: unknown
  } | null

  @ApiProperty({ description: 'Created timestamp' })
  createdAt!: string

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt!: string
}
