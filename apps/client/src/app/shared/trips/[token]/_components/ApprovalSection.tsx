'use client'

import { useState, useEffect } from 'react'
import { Check, MessageCircle } from 'lucide-react'
import { Button, Card, CardContent } from '@tailfire/ui-public'
import type { ProposalCommentDto } from '@tailfire/shared-types'
import { CommentThread } from './CommentThread'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

export function ApprovalSection({
  token,
  initialStatus,
  generalComments,
  onAddComment,
  isMulti = false,
  clientSelectedId = null,
  selectedItineraryName = null,
  onChangeSelection,
}: {
  token: string
  initialStatus: string
  generalComments: ProposalCommentDto[]
  onAddComment: (content: string) => Promise<void>
  isMulti?: boolean
  clientSelectedId?: string | null
  selectedItineraryName?: string | null
  onChangeSelection?: () => void
}) {
  const [status, setStatus] = useState(initialStatus)

  // Sync status when switching itineraries (prop changes)
  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus])
  const [isApproving, setIsApproving] = useState(false)
  const [showCommentForm, setShowCommentForm] = useState(false)

  const handleApprove = async () => {
    setIsApproving(true)
    try {
      const res = await fetch(`${API_URL}/trips/share/${token}/approve`, {
        method: 'POST',
      })
      if (res.ok) {
        setStatus('approved')
      }
    } catch {
      // Silently fail
    } finally {
      setIsApproving(false)
    }
  }

  if (status === 'approved') {
    return (
      <Card className="bg-green-500/10 border-green-500/30">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <Check className="h-4 w-4 text-green-400" />
          </div>
          <div>
            <p className="font-medium text-green-400">Proposal Approved</p>
            <p className="text-sm text-green-400/70">
              You approved this proposal. Your travel advisor will be in touch.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6 space-y-4">
        <h3 className="font-display text-lg font-bold text-foreground">Ready to proceed?</h3>
        {isMulti && !clientSelectedId && (
          <p className="text-sm text-muted-foreground">
            Please select your preferred itinerary option above before approving.
          </p>
        )}
        {isMulti && clientSelectedId && selectedItineraryName && (
          <p className="text-sm text-muted-foreground">
            You selected: <strong className="text-foreground">{selectedItineraryName}</strong>.{' '}
            {onChangeSelection && (
              <button
                onClick={onChangeSelection}
                className="text-primary hover:underline"
              >
                Change
              </button>
            )}
          </p>
        )}
        {!isMulti && (
          <p className="text-sm text-muted-foreground">
            Review the proposal above and let your advisor know your decision.
          </p>
        )}
        <div className="flex gap-3">
          <Button
            onClick={handleApprove}
            disabled={isApproving || (isMulti && !clientSelectedId)}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Check className="h-4 w-4 mr-1.5" />
            {isApproving ? 'Approving...' : 'Approve Proposal'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowCommentForm(!showCommentForm)}
          >
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Request Changes
          </Button>
        </div>

        {showCommentForm && (
          <div className="pt-2">
            <CommentThread
              comments={generalComments}
              onSubmit={onAddComment}
              placeholder="Describe the changes you'd like..."
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
