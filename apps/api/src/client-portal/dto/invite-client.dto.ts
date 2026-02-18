import { IsEmail, IsString, IsUUID } from 'class-validator'

export class InviteClientDto {
  @IsUUID()
  contactId!: string

  @IsEmail()
  email!: string

  @IsString()
  firstName!: string

  @IsString()
  lastName!: string
}
