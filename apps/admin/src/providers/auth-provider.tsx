'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

/**
 * Custom JWT claims added by our hook function
 */
export interface AuthClaims {
  userId: string
  agencyId: string
  role: 'admin' | 'user'
}

interface AuthContextType {
  user: User | null
  session: Session | null
  /**
   * Real JWT claims for the signed-in user. Use these for impersonation
   * controls (start/end/extend/status) and anywhere you specifically need
   * the ACTUAL identity — not the impersonated view.
   */
  claims: AuthClaims | null
  /**
   * Effective identity for UI gating. When the admin is impersonating an
   * agent this surfaces the impersonated user's role + agencyId + userId so
   * that role-based UI (admin-only buttons, tabs, copy) automatically swaps
   * without forging a JWT. When NOT impersonating, equals `claims`.
   *
   * Default everything in the UI to read from this. Reach for `claims`
   * (or `actualIsAdmin` on useUser) only for impersonation control flows.
   */
  effectiveClaims: AuthClaims | null
  aal: 'aal1' | 'aal2' | null
  mfaEnrolled: boolean
  isLoading: boolean
  signOut: () => Promise<void>
  recordLogin: (accessTokenOverride?: string) => void
}

/**
 * Response shape from GET /admin/impersonate/status. Kept local to the
 * provider so callers don't import it directly — `useImpersonation` is
 * the public surface for impersonation control.
 */
interface ImpersonationStatusResponse {
  active: boolean
  targetUserId?: string
  targetRole?: 'admin' | 'user' | null
  targetAgencyId?: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Extract custom claims from JWT token
 */
function extractClaims(session: Session | null): AuthClaims | null {
  if (!session?.access_token) return null

  try {
    const parts = session.access_token.split('.')
    if (parts.length < 2 || !parts[1]) return null

    const decoded = JSON.parse(atob(parts[1]))

    if (!decoded.agency_id || !decoded.role) {
      console.warn('JWT missing custom claims (agency_id or role)')
      return null
    }

    return {
      userId: decoded.user_id || decoded.sub,
      agencyId: decoded.agency_id,
      role: decoded.role as 'admin' | 'user',
    }
  } catch (error) {
    console.error('Failed to decode JWT:', error)
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [claims, setClaims] = useState<AuthClaims | null>(null)
  const [impersonatedClaims, setImpersonatedClaims] = useState<AuthClaims | null>(null)
  const [aal, setAal] = useState<'aal1' | 'aal2' | null>(null)
  const [mfaEnrolled, setMfaEnrolled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loginRecorded, setLoginRecorded] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  // Effective claims:
  //   - while impersonating an agent → claims for the target user (lets all
  //     role-based UI behave like the agent's session)
  //   - otherwise → the real signed-in user's claims
  // Memoised so React-Query / consumers that key on identity stay stable.
  const effectiveClaims = useMemo<AuthClaims | null>(
    () => impersonatedClaims ?? claims,
    [impersonatedClaims, claims],
  )

  /**
   * Check MFA assurance level — non-blocking with timeout
   * The Supabase SDK MFA calls can hang due to navigator lock contention.
   */
  const checkMfaLevel = async () => {
    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
      const check = supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      const result = await Promise.race([check, timeout])
      if (result && 'data' in result && result.data) {
        setAal(result.data.currentLevel)
        setMfaEnrolled(result.data.nextLevel === 'aal2')
      }
    } catch {
      // MFA check is non-critical
    }
  }

  /**
   * Record login — call this AFTER MFA verification (or when MFA is not required).
   * Moved out of SIGNED_IN event to avoid recording pre-MFA logins.
   */
  const recordLogin = (accessTokenOverride?: string) => {
    if (loginRecorded) return
    const token = accessTokenOverride || session?.access_token
    if (!token) return

    setLoginRecorded(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
    fetch(`${apiUrl}/user-profiles/me/record-login`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {/* non-critical */})
  }

  // Fetch impersonation status and project it into impersonatedClaims.
  // Called on initial load, on auth change, and whenever localStorage
  // signals an impersonation start/end. We use the same status endpoint
  // that the existing useImpersonation hook polls so the two stay in sync.
  const refreshImpersonatedClaims = async (currentRealClaims: AuthClaims | null) => {
    // Only admins can impersonate. Skip the request for non-admins so we
    // don't waste a roundtrip for every agent login.
    if (!currentRealClaims || currentRealClaims.role !== 'admin') {
      setImpersonatedClaims(null)
      return
    }
    try {
      const { api } = await import('@/lib/api')
      const status = await api.get<ImpersonationStatusResponse>('/admin/impersonate/status')
      if (status.active && status.targetUserId && status.targetRole && status.targetAgencyId) {
        setImpersonatedClaims({
          userId: status.targetUserId,
          agencyId: status.targetAgencyId,
          role: status.targetRole,
        })
      } else {
        setImpersonatedClaims(null)
      }
    } catch {
      // Best-effort: if status fails (e.g. transient API blip) we fall back
      // to real claims rather than getting stuck in an impersonated UI.
      setImpersonatedClaims(null)
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      const c = extractClaims(session)
      setClaims(c)
      setIsLoading(false)
      // Non-blocking MFA check — don't delay app load
      if (session) checkMfaLevel()
      // Non-blocking impersonation hydration
      if (session) void refreshImpersonatedClaims(c)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      const c = extractClaims(session)
      setClaims(c)
      setIsLoading(false)

      if (session) {
        checkMfaLevel() // Non-blocking
        void refreshImpersonatedClaims(c)
      } else {
        setAal(null)
        setMfaEnrolled(false)
        setLoginRecorded(false)
        setImpersonatedClaims(null)
      }

      // recordLogin is called explicitly by MFA pages after aal2 verification,
      // or by non-MFA flows. Do NOT fire here — SIGNED_IN fires before MFA.
    })

    // Cross-tab + same-tab signal: useImpersonation flips
    // localStorage['impersonate-user-id'] on start/end. Re-hydrate when it
    // changes so the UI swaps immediately without waiting for the next
    // status poll.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'impersonate-user-id') {
        void refreshImpersonatedClaims(claims)
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
    }

    return () => {
      subscription.unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
      }
    }
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    // End any active impersonation session BEFORE signing out so the row in
    // impersonation_sessions doesn't dangle. ImpersonationGuard rejects all
    // requests on next admin login if an unended session row still matches.
    if (typeof window !== 'undefined' && localStorage.getItem('impersonate-user-id')) {
      try {
        const { api } = await import('@/lib/api')
        await api.delete('/admin/impersonate')
      } catch {
        // Best-effort: continue with sign-out even if the call fails so the
        // user isn't stuck. The reconcile cron will eventually clean up stale
        // sessions.
      } finally {
        localStorage.removeItem('impersonate-user-id')
        setImpersonatedClaims(null)
      }
    }
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, claims, effectiveClaims, aal, mfaEnrolled, isLoading, signOut, recordLogin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
