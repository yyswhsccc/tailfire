import { IsArray, IsString, IsUUID, ArrayMinSize } from 'class-validator'

export class BulkReassignTripsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  tripIds!: string[]

  @IsString()
  @IsUUID('4')
  newOwnerId!: string
}
