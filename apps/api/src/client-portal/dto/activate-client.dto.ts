import { IsString } from 'class-validator'

export class ActivateClientDto {
  @IsString()
  inviteToken!: string
}
