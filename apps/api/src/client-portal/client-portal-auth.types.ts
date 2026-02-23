/**
 * Client Portal Auth Types
 *
 * Separate from admin AuthContext to maintain type safety
 * and prevent accidental cross-use.
 */

export interface ClientAuthContext {
  supabaseUserId: string
  clientPortalUserId: string
  contactId: string
  agencyId: string
  email: string
}
