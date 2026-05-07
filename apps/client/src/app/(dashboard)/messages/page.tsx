'use client'

import { useState, useRef, useEffect } from 'react'
import { usePortalMessages, useSendMessage } from '@/hooks/use-portal-messages'
import { MessageCircle, Send, Loader2, User } from 'lucide-react'

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)

  if (diffDays === 0) return date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return date.toLocaleDateString('en-CA', { weekday: 'short' })
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

export default function MessagesPage() {
  const { data: messages, isLoading, error } = usePortalMessages()
  const sendMessage = useSendMessage()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sendMessage.isPending) return
    await sendMessage.mutateAsync({ body: input.trim() })
    setInput('')
  }

  // Reverse messages for chronological order (API returns newest first)
  const sortedMessages = [...(messages || [])].reverse()

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4">
        <MessageCircle className="size-6 text-[#C59746]" />
        <div>
          <h1 className="text-xl font-bold text-[#1A1A1A]">Messages</h1>
          <p className="text-xs text-gray-500">Chat with your travel advisor</p>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-5 animate-spin text-[#C59746]" />
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
            Unable to load messages. Please try again.
          </div>
        )}

        {!isLoading && !error && sortedMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MessageCircle className="size-10 text-gray-200" />
            <p className="mt-3 text-sm font-medium text-gray-500">No messages yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Send a message to your travel advisor below.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {sortedMessages.map((msg) => {
            const isMe = msg.senderType === 'consumer'
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                  <div className="mr-2 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#C59746]">
                    <User className="size-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isMe
                    ? 'bg-[#1A1A1A] text-white'
                    : 'border border-gray-200 bg-white text-[#1A1A1A]'
                }`}>
                  {!isMe && msg.senderName && (
                    <p className="mb-0.5 text-xs font-medium text-[#C59746]">{msg.senderName}</p>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  <p className={`mt-1 text-xs ${isMe ? 'text-white/50' : 'text-gray-400'}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Input area */}
      <form onSubmit={handleSend} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={sendMessage.isPending}
          className="flex-1 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-gray-400 focus:border-[#C59746] focus:outline-none focus:ring-1 focus:ring-[#C59746] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sendMessage.isPending}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#C59746] text-white hover:bg-[#B08638] disabled:opacity-50"
        >
          {sendMessage.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      </form>
    </div>
  )
}
