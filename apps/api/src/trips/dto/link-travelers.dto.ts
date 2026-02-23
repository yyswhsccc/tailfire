import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class TravelerLinkItemDto {
  @IsUUID()
  tripTravelerId!: string

  @IsOptional()
  @IsUUID()
  contactLoyaltyProgramId?: string
}

export class LinkTravelersClassDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tripTravelerIds?: string[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelerLinkItemDto)
  links?: TravelerLinkItemDto[]
}
