/**
 * Loyalty Programs Catalog Types
 *
 * Agency-level loyalty programs managed in the Library.
 */

export interface LoyaltyProgramCatalogDto {
  id: string
  agencyId: string
  providerName: string
  programName: string
  programType: LoyaltyProgramType
  logoUrl: string | null
  websiteUrl: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateLoyaltyProgramCatalogDto {
  providerName: string
  programName: string
  programType: LoyaltyProgramType
  logoUrl?: string
  websiteUrl?: string
  notes?: string
}

export interface UpdateLoyaltyProgramCatalogDto extends Partial<CreateLoyaltyProgramCatalogDto> {
  isActive?: boolean
}

export type LoyaltyProgramType = 'cruise' | 'airline' | 'hotel' | 'other'

export interface LoyaltyProgramCatalogListResponse {
  programs: LoyaltyProgramCatalogDto[]
  total: number
  page: number
  totalPages: number
}
