/**
 * Auth Types
 *
 * Type definitions for authentication context.
 */

export type UserStatus = 'active' | 'pending' | 'locked'

export interface AuthContext {
  userId: string
  email: string
  agencyId: string
  role: 'admin' | 'user'
  userStatus: UserStatus
}

export interface PortalAuthContext {
  userId: string
  email: string
  contactId: string
  agencyId: string
}

export interface PortalJwtPayload {
  sub: string
  email: string
  user_id?: string
  portal_user?: boolean
  contact_id?: string
  agency_id?: string
  iat: number
  exp: number
  aud: string
  iss: string
  app_metadata?: {
    portal_user?: boolean
    contact_id?: string
    agency_id?: string
    provider?: string
    providers?: string[]
  }
}

export interface JwtPayload {
  sub: string // user id
  email: string
  agency_id?: string
  role: 'admin' | 'user' | 'authenticated'
  user_id?: string
  user_status?: UserStatus
  iat: number
  exp: number
  aud: string
  iss: string
  // Supabase standard location for custom claims
  app_metadata?: {
    agency_id?: string
    role?: 'admin' | 'user'
    user_status?: UserStatus
    provider?: string
    providers?: string[]
  }
  user_metadata?: {
    email_verified?: boolean
  }
}
