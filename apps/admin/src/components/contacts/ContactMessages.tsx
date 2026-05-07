'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Send, Loader2, User, MessageCircle } from 'lucide-react'

interface PortalMessage {
  id: string
  contactId: string
  tripId: string | null
  senderType: 'agent' | 'consumer'
  senderId: string | null
  senderName: string | null
  body: string
  readAt: string | null
  createdAt: string
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)

  if (diffDays === 0) return date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString('en-CA', { weekday: 'short' })
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

interface ContactMessagesProps {
  contactId: string
}

export function ContactMessages({ contactId }: ContactMessagesProps) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: messages, isLoading, error } = useQuery({
    queryKey: ['contact', contactId, 'portal-messages'],
    queryFn: () => api.get<PortalMessage[]>(`/admin/contacts/${contactId}/messages`),
    enabled: Boolean(contactId),
    refetchInterval: 15000, // Poll every 15s for new consumer replies
  })

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      api.post<PortalMessage>(`/admin/contacts/${contactId}/messages`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', contactId, 'portal-messages'] })
      setInput('')
    },
  })

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sendMutation.isPending) return
    await sendMutation.mutateAsync(input.trim())
  }

  // Sort chronologically (oldest first for chat display)
  const sortedMessages = [...(messages || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  return (
    <div className="flex h-[600px] flex-col">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border border-ash-200 bg-ash-50 p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-5 animate-spin text-phoenix-gold-600" />
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
            Unable to load messages. Please try again.
          </div>
        )}

        {!isLoading && !error && sortedMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageCircle className="size-10 text-ash-300" />
            <p className="mt-3 text-sm font-medium text-ash-500">No messages yet</p>
            <p className="mt-1 text-xs text-ash-400">
              Send a message to start a conversation with this contact.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {sortedMessages.map((msg) => {
            const isAgent = msg.senderType === 'agent'
            return (
              <div key={msg.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                {!isAgent && (
                  <div className="mr-2 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-ash-200">
                    <User className="size-3.5 text-ash-600" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    isAgent
                      ? 'bg-[#1A1A1A] text-white'
                      : 'border border-ash-200 bg-white text-ash-900'
                  }`}
                >
                  {!isAgent && msg.senderName && (
                    <p className="mb-0.5 text-xs font-medium text-phoenix-gold-600">{msg.senderName}</p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  <div className={`mt-1 flex items-center gap-2 text-xs ${isAgent ? 'text-white/50' : 'text-ash-400'}`}>
                    <span>{formatTime(msg.createdAt)}</span>
                    {isAgent && msg.readAt && (
                      <span className="text-white/40">Read</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Send form */}
      <form onSubmit={handleSend} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message to send to the portal..."
          disabled={sendMutation.isPending}
          className="flex-1 rounded-full border border-ash-200 bg-white px-4 py-2.5 text-sm text-ash-900 placeholder:text-ash-400 focus:border-phoenix-gold-400 focus:outline-none focus:ring-1 focus:ring-phoenix-gold-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sendMutation.isPending}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-phoenix-gold-500 text-white hover:bg-phoenix-gold-600 disabled:opacity-50"
        >
          {sendMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      </form>

      {sendMutation.isError && (
        <p className="mt-2 text-xs text-red-500">Failed to send message. Please try again.</p>
      )}
    </div>
  )
}
