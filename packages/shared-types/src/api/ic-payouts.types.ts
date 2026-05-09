/**
 * IC Commission Payouts Shared Types
 *
 * Response DTOs for IC (Independent Contractor) payout management.
 * Includes tax profiles, payout accounts, authorization, and RCTI contracts.
 *
 * Security Note: Read DTOs (IcTaxProfileDto, IcPayoutAccountDto) NEVER include
 * encrypted fields like sinOrBnEncrypted or detailsEncrypted. Controllers strip
 * these before returning. This codifies that contract on the type side.
 */

// ============================================================================
// ENUMS / TYPES
// ============================================================================

export type IcPayoutRail = 'interac_etransfer' | 'eft' | 'wise' | 'wire' | 'visa_direct'
export type IcPayoutAccountStatus = 'active' | 'archived' | 'unverified'
export type IcPayoutAuthorizationStatus = 'active' | 'superseded' | 'revoked'

// ============================================================================
// ADDRESS DTO
// ============================================================================

export interface IcAddressDto {
  street: string
  city: string
  province: string
  postalCode: string
}

// ============================================================================
// TAX PROFILE DTOs
// ============================================================================

export interface IcTaxProfileDto {
  id: string
  legalName: string
  domicileAddress: IcAddressDto
  domicileProvince: string
  isCorporation: boolean
  sinOrBnMask: string // never the raw SIN/BN
  gstHstRegistered: boolean
  gstHstNumber: string | null
  gstHstEffectiveFrom: string | null
  autoDisburse: boolean
  approvalCeilingCents: number | null
  rctiAuthorizationId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateIcTaxProfileRequest {
  legalName: string
  domicileAddress: IcAddressDto
  domicileProvince: string
  isCorporation: boolean
  sinOrBn: string
  gstHstRegistered: boolean
  gstHstNumber?: string
  gstHstEffectiveFrom?: string
}

export interface UpdateIcTaxProfileRequest {
  legalName?: string
  domicileAddress?: IcAddressDto
  domicileProvince?: string
  gstHstRegistered?: boolean
  gstHstNumber?: string
  approvalCeilingCents?: number
  autoDisburse?: boolean
}

// ============================================================================
// PAYOUT ACCOUNT DTOs
// ============================================================================

export interface IcPayoutAccountDto {
  id: string
  label: string
  currency: string
  rail: IcPayoutRail
  isDefaultForCurrency: boolean
  status: IcPayoutAccountStatus
  detailsMask: string // never the raw destination details
  padAgreementVersion: string | null
  padAcceptedAt: string | null
  createdAt: string
}

export interface CreateIcPayoutAccountRequest {
  label: string
  currency: string
  rail: IcPayoutRail
  details: Record<string, unknown>
  isDefaultForCurrency?: boolean
  padAgreementVersion?: string
}

// ============================================================================
// AUTHORIZATION DTOs (RCTI, PAD)
// ============================================================================

export interface IcPayoutAuthorizationDto {
  id: string
  agreementVersion: string
  acceptedAt: string
  status: IcPayoutAuthorizationStatus
}

export interface AcceptIcPayoutAuthorizationRequest {
  payerTaxRegistrationAttested: boolean
  recipientTaxRegistrationAttested: boolean
  // signature PNG arrives as multipart file; not in this DTO
}
