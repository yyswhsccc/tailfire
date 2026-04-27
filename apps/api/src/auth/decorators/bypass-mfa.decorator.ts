import { SetMetadata } from '@nestjs/common'

export const BYPASS_MFA_KEY = 'bypass_mfa'
export const BypassMfa = () => SetMetadata(BYPASS_MFA_KEY, true)
