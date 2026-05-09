'use client'

import { useEffect, useRef } from 'react'
import { trackSearch } from '@/lib/tracking'

interface TrackSearchEventProps {
  entityType: string
  query: Record<string, unknown>
  resultCount: number
}

/**
 * Client-side companion that fires a `search` consumer-activity event once
 * per render of a server-rendered search results page. The dedupe key
 * prevents duplicate events when React strict-mode double-invokes effects
 * or when the parent re-renders without a meaningful query change.
 */
export function TrackSearchEvent({ entityType, query, resultCount }: TrackSearchEventProps) {
  const lastKey = useRef<string>('')

  useEffect(() => {
    const key = `${entityType}:${JSON.stringify(query)}:${resultCount}`
    if (key === lastKey.current) return
    lastKey.current = key
    trackSearch(entityType, query, resultCount)
  }, [entityType, query, resultCount])

  return null
}
