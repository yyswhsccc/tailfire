import { IsUUID } from 'class-validator'

export class SelectItineraryDto {
  @IsUUID()
  itineraryId!: string
}
