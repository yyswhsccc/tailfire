'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useUser } from './use-user'

interface ImpersonationStatus {
  active: boolean
  sessionId?: string
  targetUserId?: string
  targetName?: string
  expiresAt?: string
  createdAt?: string
}

export function useImpersonation() {
  // Use actualIsAdmin — `isAdmin` from useUser is the EFFECTIVE role and
  // would flip to false the moment we start impersonating an agent, which
  // would then hide the banner / disable Exit. The real admin's role must
  // drive impersonation controls.
  const { actualIsAdmin } = useUser()
  const [status, setStatus] = useState<ImpersonationStatus>({ active: false })
  const [loading, setLoading] = useState(false)

  const checkStatus = useCallback(async () => {
    if (!actualIsAdmin) return
    try {
      const data = await api.get<ImpersonationStatus>('/admin/impersonate/status')
      setStatus(data)
      // Clear stale localStorage key when session is no longer active
      // Prevents 401s on all requests after natural session expiry
      if (!data.active && typeof window !== 'undefined' && localStorage.getItem('impersonate-user-id')) {
        localStorage.removeItem('impersonate-user-id')
      }
    } catch {
      setStatus({ active: false })
      // Also clear on error (e.g., session expired server-side)
      if (typeof window !== 'undefined' && localStorage.getItem('impersonate-user-id')) {
        localStorage.removeItem('impersonate-user-id')
      }
    }
  }, [actualIsAdmin])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Only poll when actively impersonating
  useEffect(() => {
    if (!status.active) return
    const interval = setInterval(checkStatus, 30000)
    return () => clearInterval(interval)
  }, [status.active, checkStatus])

  const start = async (userId: string, role?: string) => {
    setLoading(true)
    try {
      await api.post(`/admin/impersonate/${userId}`)
      if (typeof window !== 'undefined') {
        localStorage.setItem('impersonate-user-id', userId)
      }
      // Non-admin users (role='user') have no access to /dashboard's admin-only
      // widgets; route them to /trips which is the day-to-day agent view.
      // From there they can navigate to /portal/payouts/onboarding etc.
      const destination = role === 'admin' ? '/dashboard' : '/trips'
      window.location.href = destination
    } finally {
      setLoading(false)
    }
  }

  const extend = async () => {
    await api.post('/admin/impersonate/extend')
    await checkStatus()
  }

  const end = async () => {
    await api.delete('/admin/impersonate')
    if (typeof window !== 'undefined') {
      localStorage.removeItem('impersonate-user-id')
    }
    setStatus({ active: false })
    window.location.reload()
  }

  return { ...status, start, extend, end, loading, checkStatus }
}
