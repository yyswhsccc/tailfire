import { IsString, IsInt, IsBoolean, IsOptional, Min, Max, Matches } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class VacationLiveSearchDto {
  @ApiProperty({ description: 'Departure gateway airport code', example: 'YYZ' })
  @IsString()
  gatewayCode: string

  @ApiProperty({ description: 'Destination ID(s) from catalog', example: '2' })
  @IsString()
  destDep: string

  @ApiProperty({ description: 'Departure date YYYYMMDD', example: '20260405' })
  @IsString()
  @Matches(/^\d{8}$/)
  dateDep: string

  @ApiProperty({ description: 'Duration in nights', example: '7' })
  @IsString()
  duration: string

  @ApiPropertyOptional({ description: 'Number of adults', default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  @Type(() => Number)
  nbAdults?: number

  @ApiPropertyOptional({ description: 'Number of rooms', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  @Type(() => Number)
  nbRooms?: number

  @ApiPropertyOptional({ description: 'All-inclusive only', default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  allInclusive?: boolean
}
