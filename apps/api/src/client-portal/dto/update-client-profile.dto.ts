import { IsString, IsOptional } from 'class-validator'

export class UpdateClientProfileDto {
  @IsOptional() @IsString() firstName?: string
  @IsOptional() @IsString() lastName?: string
  @IsOptional() @IsString() legalFirstName?: string
  @IsOptional() @IsString() legalLastName?: string
  @IsOptional() @IsString() middleName?: string
  @IsOptional() @IsString() preferredName?: string
  @IsOptional() @IsString() prefix?: string
  @IsOptional() @IsString() suffix?: string
  @IsOptional() @IsString() phone?: string
  @IsOptional() @IsString() gender?: string
  @IsOptional() @IsString() pronouns?: string
  @IsOptional() @IsString() dateOfBirth?: string
  @IsOptional() @IsString() passportNumber?: string
  @IsOptional() @IsString() passportExpiry?: string
  @IsOptional() @IsString() passportCountry?: string
  @IsOptional() @IsString() passportIssueDate?: string
  @IsOptional() @IsString() nationality?: string
  @IsOptional() @IsString() redressNumber?: string
  @IsOptional() @IsString() knownTravelerNumber?: string
  @IsOptional() @IsString() address1?: string
  @IsOptional() @IsString() address2?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() state?: string
  @IsOptional() @IsString() postalCode?: string
  @IsOptional() @IsString() country?: string
  @IsOptional() @IsString() dietaryRequirements?: string
  @IsOptional() @IsString() mobilityRequirements?: string
  @IsOptional() @IsString() seatPreference?: string
  @IsOptional() @IsString() cabinPreference?: string
  @IsOptional() @IsString() floorPreference?: string
}
