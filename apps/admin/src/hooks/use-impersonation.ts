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
  const { isAdmin } = useUser()
  const [status, setStatus] = useState<ImpersonationStatus>({ active: false })
  const [loading, setLoading] = useState(false)

  const checkStatus = useCallback(async () => {
    if (!isAdmin) return
    try {
      const data = await api.get<ImpersonationStatus>('/admin/impersonate/status')
      setStatus(data)
    } catch {
      setStatus({ active: false })
    }
  }, [isAdmin])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Only poll when actively impersonating
  useEffect(() => {
    if (!status.active) return
    const interval = setInterval(checkStatus, 30000)
    return () => clearInterval(interval)
  }, [status.active, checkStatus])

  const start = async (userId: string) => {
    setLoading(true)
    try {
      await api.post(`/admin/impersonate/${userId}`)
      if (typeof window !== 'undefined') {
        localStorage.setItem('impersonate-user-id', userId)
      }
      window.location.reload()
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
