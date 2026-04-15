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
  isLoading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Extract custom claims from JWT token
 */
function extractClaims(session: Session | null): AuthClaims | null {
  if (!session?.access_token) return null

  try {
    // JWT structure: header.payload.signature
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
  const [isLoading, setIsLoading] = useState(true)

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setClaims(extractClaims(session))
      setIsLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setClaims(extractClaims(session))
      setIsLoading(false)

      // Record login timestamp on sign-in (fire-and-forget)
      if (event === 'SIGNED_IN' && session?.access_token) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'
        fetch(`${apiUrl}/user-profiles/me/record-login`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => {/* non-critical */})
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, claims, isLoading, signOut }}>
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
