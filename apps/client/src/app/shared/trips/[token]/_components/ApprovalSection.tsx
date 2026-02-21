'use client'

import { useState, useEffect } from 'react'
import { Check, MessageCircle, X } from 'lucide-react'
import { Button, Card, CardContent, Textarea } from '@tailfire/ui-public'
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
  const [isDeclining, setIsDeclining] = useState(false)
  const [showCommentForm, setShowCommentForm] = useState(false)
  const [showDeclineForm, setShowDeclineForm] = useState(false)
  const [declineReason, setDeclineReason] = useState('')

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

  const handleDecline = async () => {
    setIsDeclining(true)
    try {
      const body: Record<string, string> = {}
      if (declineReason.trim()) body.reason = declineReason.trim()

      const res = await fetch(`${API_URL}/trips/share/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setStatus('declined')
      }
    } catch {
      // Silently fail
    } finally {
      setIsDeclining(false)
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

  if (status === 'declined') {
    return (
      <Card className="bg-red-500/10 border-red-500/30">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
            <X className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <p className="font-medium text-red-400">Proposal Declined</p>
            <p className="text-sm text-red-400/70">
              You declined this proposal. Your travel advisor has been notified.
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
            disabled={isApproving || isDeclining || (isMulti && !clientSelectedId)}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Check className="h-4 w-4 mr-1.5" />
            {isApproving ? 'Approving...' : 'Approve Proposal'}
          </Button>
          <Button
            variant="outline"
            onClick={() => { setShowCommentForm(!showCommentForm); setShowDeclineForm(false) }}
          >
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Request Changes
          </Button>
          <Button
            variant="outline"
            className="text-red-400 border-red-500/30 hover:bg-red-500/10"
            onClick={() => { setShowDeclineForm(!showDeclineForm); setShowCommentForm(false) }}
            disabled={isDeclining}
          >
            <X className="h-4 w-4 mr-1.5" />
            Decline
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

        {showDeclineForm && (
          <div className="pt-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to decline this proposal? You can optionally provide a reason.
            </p>
            <Textarea
              placeholder="Reason for declining (optional)..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDecline}
                disabled={isDeclining}
              >
                {isDeclining ? 'Declining...' : 'Confirm Decline'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowDeclineForm(false); setDeclineReason('') }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
