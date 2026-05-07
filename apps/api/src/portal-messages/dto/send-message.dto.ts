import { IsString, IsOptional, IsUUID } from 'class-validator'

export class SendMessageDto {
  @IsString()
  body!: string

  @IsOptional()
  @IsUUID()
  tripId?: string
}
