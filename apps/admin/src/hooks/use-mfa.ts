'use client'

import { useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Factor } from '@supabase/supabase-js'

interface MfaState {
  currentLevel: 'aal1' | 'aal2' | null
  nextLevel: 'aal1' | 'aal2' | null
  factors: Factor[]
  isEnrolled: boolean
  needsVerification: boolean
  isLoading: boolean
}

interface EnrollResult {
  factorId: string
  qrCode: string
  secret: string
  uri: string
}

/**
 * Get the current access token without going through the lock-protected SDK.
 * Reads directly from the Supabase cookie storage.
 */
async function getAccessToken(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}

/**
 * Call Supabase Auth REST API directly, bypassing the SDK lock mechanism.
 * This prevents lock contention between MFA operations and session refresh.
 */
async function mfaRestCall(path: string, body?: Record<string, unknown>): Promise<any> {
  const token = await getAccessToken()
  if (!token) throw new Error('No auth session')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const res = await fetch(`${supabaseUrl}/auth/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey!,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || err.msg || `MFA API error ${res.status}`)
  }

  return res.json()
}

export function useMfa() {
  const [state, setState] = useState<MfaState>({
    currentLevel: null,
    nextLevel: null,
    factors: [],
    isEnrolled: false,
    needsVerification: false,
    isLoading: false,
  })

  const supabase = useMemo(() => createClient(), [])

  /**
   * Refresh MFA state from Supabase
   */
  const refreshState = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }))
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (error) throw error

      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const totpFactors = factorsData?.totp ?? []

      setState({
        currentLevel: data.currentLevel,
        nextLevel: data.nextLevel,
        factors: totpFactors,
        isEnrolled: totpFactors.length > 0,
        needsVerification: data.currentLevel === 'aal1' && data.nextLevel === 'aal2',
        isLoading: false,
      })

      return data
    } catch {
      setState(prev => ({ ...prev, isLoading: false }))
      return null
    }
  }, [supabase])

  /**
   * Enroll a new TOTP factor
   */
  const enroll = useCallback(async (friendlyName?: string): Promise<EnrollResult | null> => {
    try {
      const result = await mfaRestCall('/factors', {
        factor_type: 'totp',
        friendly_name: friendlyName || 'Tailfire Authenticator',
      })

      if (!result?.totp) {
        console.error('[MFA] Enroll: no TOTP data in response', result)
        return null
      }

      return {
        factorId: result.id,
        qrCode: result.totp.qr_code,
        secret: result.totp.secret,
        uri: result.totp.uri,
      }
    } catch (err) {
      console.error('[MFA] Enroll failed:', err)
      return null
    }
  }, [])

  /**
   * Challenge + verify a TOTP code (upgrades session to aal2).
   * Uses direct REST API calls to bypass Supabase SDK lock contention.
   */
  const verify = useCallback(async (factorId: string, code: string): Promise<boolean> => {
    try {
      // Step 1: Create challenge via REST
      console.log('[MFA] Creating challenge for factor:', factorId)
      const challengeResult = await mfaRestCall(`/factors/${factorId}/challenge`, {})
      console.log('[MFA] Challenge created:', challengeResult.id)

      // Step 2: Verify via REST
      console.log('[MFA] Verifying code...')
      const verifyResult = await mfaRestCall(`/factors/${factorId}/verify`, {
        challenge_id: challengeResult.id,
        code,
      })
      console.log('[MFA] Verify result:', verifyResult ? 'success' : 'failed')

      // Session tokens updated — refresh the Supabase client session
      if (verifyResult?.access_token) {
        await supabase.auth.setSession({
          access_token: verifyResult.access_token,
          refresh_token: verifyResult.refresh_token,
        })
      }

      // Refresh state (non-blocking)
      refreshState().catch(() => {})
      return true
    } catch (err: any) {
      console.error('[MFA] Challenge/Verify failed:', err.message)
      return false
    }
  }, [supabase, refreshState])

  /**
   * Unenroll a TOTP factor
   */
  const unenroll = useCallback(async (factorId: string): Promise<boolean> => {
    try {
      await mfaRestCall(`/factors/${factorId}`)
      // Actually need DELETE method for unenroll
      const token = await getAccessToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/factors/${factorId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
      })
      if (!res.ok) return false
      await refreshState()
      return true
    } catch {
      return false
    }
  }, [refreshState])

  return {
    ...state,
    refreshState,
    enroll,
    verify,
    unenroll,
  }
}
