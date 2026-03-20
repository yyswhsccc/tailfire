import { SetMetadata } from '@nestjs/common'

export const BYPASS_IMPERSONATION_KEY = 'bypass-impersonation'
export const BypassImpersonation = () => SetMetadata(BYPASS_IMPERSONATION_KEY, true)
