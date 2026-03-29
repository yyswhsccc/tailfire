import { IsOptional, IsString, IsInt, Min, Max, IsArray, IsIn } from 'class-validator'
import { Type, Transform } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class VacationHotelSearchDto {
  @ApiPropertyOptional({ description: 'Search text (hotel name)' })
  @IsOptional()
  @IsString()
  q?: string

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number

  @ApiPropertyOptional({ description: 'Page size (max 50)', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  pageSize?: number

  @ApiPropertyOptional({ description: 'Filter by departure gateway airport code (e.g., YYZ)' })
  @IsOptional()
  @IsString()
  gatewayCode?: string

  @ApiPropertyOptional({ description: 'Filter by destination ID' })
  @IsOptional()
  @IsString()
  destinationId?: string

  @ApiPropertyOptional({ description: 'Minimum star rating' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  minStars?: number

  @ApiPropertyOptional({ description: 'Maximum star rating' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  maxStars?: number

  @ApiPropertyOptional({ description: 'Filter by amenities (e.g., beach,spa)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!value) return undefined
    if (Array.isArray(value)) return value
    return typeof value === 'string' ? value.split(',').map((s: string) => s.trim()) : [value]
  })
  amenities?: string[]

  @ApiPropertyOptional({ description: 'Sort field', enum: ['name', 'starRating', 'monarcRating'] })
  @IsOptional()
  @IsIn(['name', 'starRating', 'monarcRating'])
  sortBy?: 'name' | 'starRating' | 'monarcRating'

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc'
}

export interface VacationHotelSearchResponseDto {
  items: VacationHotelSummary[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface VacationHotelSummary {
  id: string
  name: string
  destination: string
  starRating: number | null
  imageUrl: string | null
  amenities: Record<string, boolean> | null
  monarcRating: string | null
  monarcReviewCount: number | null
}

export interface VacationHotelDetail extends VacationHotelSummary {
  hotelChain: string | null
  enrichment: VacationEnrichmentData | null
}

export interface VacationEnrichmentData {
  googleRating: string | null
  googleReviewCount: number | null
  tripadvisorRating: string | null
  tripadvisorReviewCount: number | null
  tripadvisorLink: string | null
  latitude: string | null
  longitude: string | null
  address: string | null
  website: string | null
  phone: string | null
  photos: string[]
  enrichedAt: string | null
  isStale: boolean
}
