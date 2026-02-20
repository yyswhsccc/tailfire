'use client'

import { useState } from 'react'
import { Send, MessageCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useProposalComments, usePostAgentComment } from '@/hooks/use-proposal-comments'

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function ActivityCommentsPanel({
  tripId,
  itineraryId,
  activityId,
}: {
  tripId: string
  itineraryId: string
  activityId: string
}) {
  const [replyContent, setReplyContent] = useState('')
  const { data, isLoading } = useProposalComments(tripId, itineraryId, activityId)
  const postComment = usePostAgentComment(tripId, itineraryId)

  const comments = data?.comments ?? []

  const handleSubmit = async () => {
    const content = replyContent.trim()
    if (!content) return

    await postComment.mutateAsync({ activityId, content })
    setReplyContent('')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        Loading comments...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <MessageCircle className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No comments yet</p>
          <p className="text-xs mt-1">Client comments will appear here when they share feedback.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback
                  className={
                    comment.authorType === 'client'
                      ? 'bg-blue-100 text-blue-700 text-xs'
                      : 'bg-gray-100 text-gray-700 text-xs'
                  }
                >
                  {getInitials(comment.authorName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium truncate">{comment.authorName}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${
                      comment.authorType === 'client'
                        ? 'border-blue-200 text-blue-600'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {comment.authorType === 'client' ? 'Client' : 'Agent'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply input */}
      <div className="flex gap-2 pt-2 border-t">
        <Textarea
          placeholder="Reply to client..."
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          rows={2}
          className="resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <Button
          size="sm"
          className="shrink-0 self-end"
          onClick={handleSubmit}
          disabled={!replyContent.trim() || postComment.isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
