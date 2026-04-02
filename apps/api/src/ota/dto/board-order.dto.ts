/**
 * Board Order DTO
 *
 * Defines the display ordering of components and inspiration cards
 * on the consumer trip builder board.
 */

import { IsArray, ValidateNested, IsString, IsIn } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

class BoardOrderItemDto {
  @ApiProperty({ enum: ['component', 'inspiration'], description: 'Item type' })
  @IsIn(['component', 'inspiration'])
  type!: 'component' | 'inspiration'

  @ApiProperty({ description: 'Component or inspiration card ID' })
  @IsString()
  id!: string
}

export class UpdateBoardOrderDto {
  @ApiProperty({ type: [BoardOrderItemDto], description: 'Ordered list of board items' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BoardOrderItemDto)
  boardOrder!: BoardOrderItemDto[]
}
