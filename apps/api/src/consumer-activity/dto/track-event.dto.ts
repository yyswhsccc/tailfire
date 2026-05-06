import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional, IsObject } from 'class-validator'

export class TrackEventDto {
  @ApiProperty({ description: 'OTA session ID' })
  @IsString()
  sessionId!: string

  @ApiProperty({ description: 'Event type: page_view, search, ai_chat_start, board_save' })
  @IsString()
  event!: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  entityType?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  entitySlug?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  entityName?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  searchQuery?: Record<string, unknown>

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>
}
