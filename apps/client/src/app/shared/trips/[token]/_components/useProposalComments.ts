'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProposalCommentDto, ProposalCommentsResponseDto } from '@tailfire/shared-types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

function getLastSeenKey(token: string) {
  return `tailfire_comments_seen_${token}`
}

export function useProposalComments(token: string, itineraryId?: string) {
  const [comments, setComments] = useState<ProposalCommentDto[]>([])
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [lastSeenTimestamp, setLastSeenTimestamp] = useState<string | null>(null)
  const initialLoadDone = useRef(false)

  // Load lastSeen from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(getLastSeenKey(token))
      if (stored) setLastSeenTimestamp(stored)
    } catch {
      // localStorage unavailable
    }
  }, [token])

  const fetchComments = useCallback(async () => {
    try {
      const qs = itineraryId ? `?itineraryId=${itineraryId}` : ''
      const res = await fetch(`${API_URL}/trips/share/${token}/comments${qs}`)
      if (!res.ok) return
      const data: ProposalCommentsResponseDto = await res.json()
      setComments(data.comments)
      setCommentCounts(data.commentCounts)

      // On first load, set lastSeen to now if not already set
      if (!initialLoadDone.current) {
        initialLoadDone.current = true
        try {
          if (!localStorage.getItem(getLastSeenKey(token))) {
            const now = new Date().toISOString()
            localStorage.setItem(getLastSeenKey(token), now)
            setLastSeenTimestamp(now)
          }
        } catch {
          // localStorage unavailable
        }
      }
    } catch {
      // Silently fail — comments are non-critical
    } finally {
      setIsLoading(false)
    }
  }, [token, itineraryId])

  useEffect(() => {
    fetchComments()
    // Poll every 15 seconds
    const interval = setInterval(fetchComments, 15000)
    return () => clearInterval(interval)
  }, [fetchComments])

  const addComment = async (activityId: string | null, content: string, dayId?: string) => {
    const body: Record<string, string> = { content }
    if (activityId) body.activityId = activityId
    if (dayId) body.dayId = dayId
    if (itineraryId) body.itineraryId = itineraryId

    const res = await fetch(`${API_URL}/trips/share/${token}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error('Failed to post comment')
    }

    const comment: ProposalCommentDto = await res.json()

    // Optimistically update local state
    setComments((prev) => [...prev, comment])
    const key = comment.dayId ? `day:${comment.dayId}` : comment.activityId || 'general'
    setCommentCounts((prev) => ({
      ...prev,
      [key]: (prev[key] || 0) + 1,
    }))

    return comment
  }

  /** Mark comments as seen — call when user opens a comment popover */
  const markSeen = useCallback(() => {
    const now = new Date().toISOString()
    setLastSeenTimestamp(now)
    try {
      localStorage.setItem(getLastSeenKey(token), now)
    } catch {
      // localStorage unavailable
    }
  }, [token])

  /** Check if there are unseen comments (from other users, after lastSeen) */
  const hasUnseenComments = useCallback(
    (filterKey?: string) => {
      if (!lastSeenTimestamp) return false
      const relevantComments = filterKey
        ? comments.filter((c) => {
            if (filterKey.startsWith('day:')) return c.dayId === filterKey.slice(4) && !c.activityId
            return c.activityId === filterKey
          })
        : comments
      return relevantComments.some(
        (c) => c.authorType === 'agent' && c.createdAt > lastSeenTimestamp,
      )
    },
    [comments, lastSeenTimestamp],
  )

  return {
    comments,
    commentCounts,
    isLoading,
    addComment,
    refetch: fetchComments,
    markSeen,
    hasUnseenComments,
  }
}
