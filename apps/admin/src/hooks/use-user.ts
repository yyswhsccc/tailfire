/**
 * User Hook
 *
 * Returns the EFFECTIVE identity for UI gating. When an admin is
 * impersonating an agent, isAdmin/agencyId/userId reflect the impersonated
 * user — not the underlying admin. This keeps role-based UI consistent
 * with the API-side impersonation behaviour.
 *
 * For impersonation controls (start/end/extend/status) and anywhere you
 * specifically need the ACTUAL signed-in admin's identity, use
 * `actualIsAdmin` or read `claims` directly from `useAuth()`.
 */

import { useAuth, type AuthClaims } from '@/providers/auth-provider'
import type { User } from '@supabase/supabase-js'

interface UseUserReturn {
  user: User | null
  /** Effective claims (impersonated when active, else real). */
  claims: AuthClaims | null
  isLoading: boolean
  isAuthenticated: boolean
  /** Effective role === 'admin'. False while impersonating an agent. */
  isAdmin: boolean
  /** Real signed-in user's role === 'admin'. Use for impersonation controls. */
  actualIsAdmin: boolean
  /** True iff the real user is admin AND currently impersonating someone. */
  isImpersonating: boolean
  agencyId: string | null
  userId: string | null
}

export function useUser(): UseUserReturn {
  const { user, claims, effectiveClaims, isLoading } = useAuth()

  const effective = effectiveClaims ?? claims

  return {
    user,
    claims: effective,
    isLoading,
    isAuthenticated: !!user && !!effective,
    isAdmin: effective?.role === 'admin',
    actualIsAdmin: claims?.role === 'admin',
    isImpersonating: !!effectiveClaims && effectiveClaims !== claims,
    agencyId: effective?.agencyId ?? null,
    userId: effective?.userId ?? null,
  }
}
