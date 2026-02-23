import { IsString, IsOptional, IsBoolean, MaxLength, IsIn } from 'class-validator'

export class UpdateLoyaltyProgramCatalogDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerName?: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  programName?: string

  @IsOptional()
  @IsString()
  @IsIn(['cruise', 'airline', 'hotel', 'other'])
  programType?: 'cruise' | 'airline' | 'hotel' | 'other'

  @IsOptional()
  @IsString()
  logoUrl?: string

  @IsOptional()
  @IsString()
  websiteUrl?: string

  @IsOptional()
  @IsString()
  notes?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
