import { IsString, IsInt, IsBoolean, Min, Max } from 'class-validator'
import { IsValidEmailHost } from '../../common/validators/is-valid-email-host.validator'

export class TestConnectionDto {
  @IsString()
  @IsValidEmailHost()
  imapHost!: string

  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort!: number

  @IsBoolean()
  imapTls!: boolean

  @IsString()
  username!: string

  @IsString()
  password!: string
}
