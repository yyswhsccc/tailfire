/**
 * Create Flight Request DTO
 *
 * Validates incoming flight request data from the OTA consumer portal.
 * Used when a consumer selects flights and provides contact info for advisor follow-up.
 */

import {
  IsString,
  IsEmail,
  IsNumber,
  IsOptional,
  ValidateNested,
  IsObject,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

class FlightSegmentDto {
  @ApiProperty() @IsString() airline!: string
  @ApiProperty() @IsString() flightNumber!: string
  @ApiProperty() @IsString() origin!: string
  @ApiProperty() @IsString() destination!: string
  @ApiProperty() @IsString() departureTime!: string
  @ApiProperty() @IsString() arrivalTime!: string
  @ApiProperty() @IsString() duration!: string
  @ApiProperty() @IsNumber() stops!: number
  @ApiProperty() @IsString() fareClass!: string
  @ApiProperty() @IsNumber() price!: number
  @ApiProperty() @IsString() currency!: string
}

export class CreateFlightRequestDto {
  @ApiProperty() @IsString() name!: string
  @ApiProperty() @IsEmail() email!: string
  @ApiProperty() @IsString() phone!: string
  @ApiProperty() @ValidateNested() @Type(() => FlightSegmentDto) @IsObject() outboundFlight!: FlightSegmentDto
  @ApiPropertyOptional() @ValidateNested() @Type(() => FlightSegmentDto) @IsObject() @IsOptional() returnFlight?: FlightSegmentDto
  @ApiProperty() @IsNumber() travelers!: number
  @ApiProperty() @IsString() travelClass!: string
  @ApiPropertyOptional() @IsString() @IsOptional() specialRequests?: string
  @ApiPropertyOptional() @IsString() @IsOptional() amadeusOfferId?: string
  @ApiPropertyOptional({ default: 'ota', description: 'Attribution source for the request' })
  @IsString() @IsOptional() source?: string
}
