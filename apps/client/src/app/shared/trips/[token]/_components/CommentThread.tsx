'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button, Textarea } from '@tailfire/ui-public'
import type { ProposalCommentDto } from '@tailfire/shared-types'

function formatCommentTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function CommentThread({
  comments,
  onSubmit,
  placeholder = 'Add a comment...',
}: {
  comments: ProposalCommentDto[]
  onSubmit: (content: string) => Promise<void>
  placeholder?: string
}) {
  const [content, setContent] = useState('')
  const [isSending, setIsSending] = useState(false)

  const handleSubmit = async () => {
    const trimmed = content.trim()
    if (!trimmed || isSending) return

    setIsSending(true)
    try {
      await onSubmit(trimmed)
      setContent('')
    } catch {
      // Keep content so user can retry
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Existing comments */}
      {comments.length > 0 && (
        <div className="max-h-60 overflow-y-auto space-y-2">
          {comments.map((comment) => (
            <div key={comment.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-medium ${
                    comment.authorType === 'agent' ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {comment.authorName}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatCommentTime(comment.createdAt)}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5">{comment.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          className="min-h-[60px] resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!content.trim() || isSending}
          className="shrink-0 self-end"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
