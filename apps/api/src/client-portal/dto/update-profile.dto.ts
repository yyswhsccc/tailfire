import { IsOptional, IsString, IsDateString } from 'class-validator'

/**
 * Client-editable contact fields (whitelist).
 * Only these fields can be updated by the client through the portal.
 */
export class UpdateClientProfileDto {
  @IsOptional() @IsString() legalFirstName?: string
  @IsOptional() @IsString() legalLastName?: string
  @IsOptional() @IsString() middleName?: string
  @IsOptional() @IsString() preferredName?: string
  @IsOptional() @IsString() prefix?: string
  @IsOptional() @IsString() suffix?: string
  @IsOptional() @IsString() gender?: string
  @IsOptional() @IsString() pronouns?: string
  @IsOptional() @IsDateString() dateOfBirth?: string
  @IsOptional() @IsString() passportNumber?: string
  @IsOptional() @IsDateString() passportExpiry?: string
  @IsOptional() @IsString() passportCountry?: string
  @IsOptional() @IsDateString() passportIssueDate?: string
  @IsOptional() @IsString() nationality?: string
  @IsOptional() @IsString() redressNumber?: string
  @IsOptional() @IsString() knownTravelerNumber?: string
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsString() addressLine1?: string
  @IsOptional() @IsString() addressLine2?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() province?: string
  @IsOptional() @IsString() postalCode?: string
  @IsOptional() @IsString() country?: string
  @IsOptional() @IsString() dietaryRequirements?: string
  @IsOptional() @IsString() mobilityRequirements?: string
  @IsOptional() @IsString() seatPreference?: string
  @IsOptional() @IsString() cabinPreference?: string
  @IsOptional() @IsString() floorPreference?: string
}
