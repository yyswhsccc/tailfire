import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator'

export class CreateLoyaltyProgramCatalogDto {
  @IsString()
  @MaxLength(255)
  providerName!: string

  @IsString()
  @MaxLength(255)
  programName!: string

  @IsString()
  @IsIn(['cruise', 'airline', 'hotel', 'other'])
  programType!: 'cruise' | 'airline' | 'hotel' | 'other'

  @IsOptional()
  @IsString()
  logoUrl?: string

  @IsOptional()
  @IsString()
  websiteUrl?: string

  @IsOptional()
  @IsString()
  notes?: string
}
