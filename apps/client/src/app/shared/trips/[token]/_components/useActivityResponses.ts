'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ClientActivityResponseType } from '@tailfire/shared-types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

export function useActivityResponses(token: string, publishedVersion: number | null) {
  const [responseMap, setResponseMap] = useState<Record<string, ClientActivityResponseType>>({})
  const [isLoading, setIsLoading] = useState(true)

  const fetchResponses = useCallback(async () => {
    if (!publishedVersion) {
      setIsLoading(false)
      return
    }
    try {
      const res = await fetch(`${API_URL}/trips/share/${token}/responses`)
      if (!res.ok) return
      const data = await res.json()
      setResponseMap(data.responseMap || {})
    } catch {
      // Silently fail — responses are non-critical
    } finally {
      setIsLoading(false)
    }
  }, [token, publishedVersion])

  useEffect(() => {
    fetchResponses()
    // Poll every 15 seconds
    const interval = setInterval(fetchResponses, 15000)
    return () => clearInterval(interval)
  }, [fetchResponses])

  const submitResponse = async (
    activityId: string,
    response: ClientActivityResponseType,
    note?: string,
  ) => {
    const res = await fetch(`${API_URL}/trips/share/${token}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId, response, note }),
    })

    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}))
      throw new Error(errorBody.message || `Failed to submit response (${res.status})`)
    }

    // Optimistic update
    setResponseMap((prev) => ({ ...prev, [activityId]: response }))

    return res.json()
  }

  return { responseMap, isLoading, submitResponse, refetch: fetchResponses }
}
