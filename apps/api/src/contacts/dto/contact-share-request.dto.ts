import { IsEnum, IsOptional, IsString } from 'class-validator'

export class ResolveShareRequestDto {
  @IsEnum(['approved', 'denied'])
  status!: 'approved' | 'denied'

  @IsOptional()
  @IsString()
  reason?: string
}
