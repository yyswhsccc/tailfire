'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AuthMFAVerifyResponse, Factor } from '@supabase/supabase-js'

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

export function useMfa() {
  const [state, setState] = useState<MfaState>({
    currentLevel: null,
    nextLevel: null,
    factors: [],
    isEnrolled: false,
    needsVerification: false,
    isLoading: false,
  })

  const supabase = createClient()

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
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: friendlyName || 'Tailfire Authenticator',
    })

    if (error || !data) return null

    // Type-narrow to TOTP response
    const totpData = data as any
    if (!totpData.totp) return null

    return {
      factorId: totpData.id,
      qrCode: totpData.totp.qr_code,
      secret: totpData.totp.secret,
      uri: totpData.totp.uri,
    }
  }, [supabase])

  /**
   * Challenge + verify a TOTP code (upgrades session to aal2)
   */
  const verify = useCallback(async (factorId: string, code: string): Promise<boolean> => {
    try {
      // Step 1: Create a challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError || !challengeData) {
        console.error('[MFA] Challenge failed:', challengeError?.message)
        return false
      }

      // Step 2: Verify the code
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      }) as AuthMFAVerifyResponse

      if (verifyError) {
        console.error('[MFA] Verify failed:', verifyError.message)
        return false
      }

      // Session is now aal2 — refresh state (don't block on this)
      refreshState().catch(() => {})
      return true
    } catch (err) {
      console.error('[MFA] Unexpected error:', err)
      return false
    }
  }, [supabase, refreshState])

  /**
   * Unenroll a TOTP factor
   */
  const unenroll = useCallback(async (factorId: string): Promise<boolean> => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) return false
    await refreshState()
    return true
  }, [supabase, refreshState])

  return {
    ...state,
    refreshState,
    enroll,
    verify,
    unenroll,
  }
}
