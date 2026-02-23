import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator'

export class CreatePortalLoyaltyProgramDto {
  @IsOptional()
  @IsUUID()
  loyaltyProgramId?: string

  @IsString()
  @MaxLength(255)
  providerName!: string

  @IsString()
  @MaxLength(255)
  programName!: string

  @IsString()
  @MaxLength(100)
  membershipNumber!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tierLevel?: string

  @IsOptional()
  @IsString()
  notes?: string
}

export class UpdatePortalLoyaltyProgramDto {
  @IsOptional()
  @IsUUID()
  loyaltyProgramId?: string

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
  @MaxLength(100)
  membershipNumber?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tierLevel?: string

  @IsOptional()
  @IsString()
  notes?: string
}
