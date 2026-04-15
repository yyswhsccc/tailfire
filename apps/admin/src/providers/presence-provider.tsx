'use client'

/**
 * Presence Provider
 *
 * Uses Supabase Realtime Presence to track which users are currently online.
 * Joins a shared "presence:agency" channel and broadcasts the current user's
 * presence. Other clients receive join/leave events to maintain an online set.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './auth-provider'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface PresenceState {
  userId: string
  firstName?: string
  lastName?: string
  email?: string
}

interface PresenceContextValue {
  /** Set of user IDs currently online */
  onlineUserIds: Set<string>
  /** Check if a specific user is online */
  isOnline: (userId: string) => boolean
}

const PresenceContext = createContext<PresenceContextValue | undefined>(undefined)

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { claims, user } = useAuth()
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const supabase = useMemo(() => createClient(), [])

  const userId = claims?.userId
  const agencyId = claims?.agencyId

  useEffect(() => {
    if (!userId || !agencyId) return

    let channel: RealtimeChannel | null = null

    const setupPresence = () => {
      channel = supabase.channel(`presence:${agencyId}`, {
        config: { presence: { key: userId } },
      })

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel!.presenceState<PresenceState>()
          const ids = new Set<string>()
          for (const key of Object.keys(state)) {
            ids.add(key)
          }
          setOnlineUserIds(ids)
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel!.track({
              userId,
              email: user?.email,
            } satisfies PresenceState)
          }
        })
    }

    setupPresence()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [userId, agencyId, supabase, user?.email])

  const isOnline = useCallback(
    (id: string) => onlineUserIds.has(id),
    [onlineUserIds],
  )

  const value = useMemo(
    () => ({ onlineUserIds, isOnline }),
    [onlineUserIds, isOnline],
  )

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  const context = useContext(PresenceContext)
  if (context === undefined) {
    throw new Error('usePresence must be used within a PresenceProvider')
  }
  return context
}
