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
  claims: AuthClaims | null
  aal: 'aal1' | 'aal2' | null
  mfaEnrolled: boolean
  isLoading: boolean
  signOut: () => Promise<void>
  recordLogin: (accessTokenOverride?: string) => void
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
  const [aal, setAal] = useState<'aal1' | 'aal2' | null>(null)
  const [mfaEnrolled, setMfaEnrolled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loginRecorded, setLoginRecorded] = useState(false)

  const supabase = useMemo(() => createClient(), [])

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

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setClaims(extractClaims(session))
      setIsLoading(false)
      // Non-blocking MFA check — don't delay app load
      if (session) checkMfaLevel()
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setClaims(extractClaims(session))
      setIsLoading(false)

      if (session) {
        checkMfaLevel() // Non-blocking
      } else {
        setAal(null)
        setMfaEnrolled(false)
        setLoginRecorded(false)
      }

      // Record login on sign-in (fire-and-forget, non-blocking)
      if (event === 'SIGNED_IN' && session?.access_token) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1'
        fetch(`${apiUrl}/user-profiles/me/record-login`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {/* non-critical */})
        setLoginRecorded(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, claims, aal, mfaEnrolled, isLoading, signOut, recordLogin }}>
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
