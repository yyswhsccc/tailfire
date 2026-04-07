'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserPlus, UserCheck, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  usePendingShareRequests,
  useResolveShareRequest,
  useReassignContactOwner,
} from '@/hooks/use-contact-share-requests'

interface PendingAccessRequestsProps {
  contactId: string
}

export function PendingAccessRequests({ contactId }: PendingAccessRequestsProps) {
  const { data: allPending = [] } = usePendingShareRequests()
  const resolveRequest = useResolveShareRequest()
  const reassignOwner = useReassignContactOwner()
  const [processingId, setProcessingId] = useState<string | null>(null)

  const pendingForContact = allPending.filter(r => r.contactId === contactId)

  if (pendingForContact.length === 0) return null

  const handleApprove = async (requestId: string) => {
    setProcessingId(requestId)
    try {
      await resolveRequest.mutateAsync({ requestId, status: 'approved' })
      toast.success('Access granted — contact shared with full access')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve request'
      toast.error(message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReassign = async (requestId: string, requesterId: string) => {
    setProcessingId(requestId)
    try {
      await reassignOwner.mutateAsync({ contactId, ownerId: requesterId })
      await resolveRequest.mutateAsync({ requestId, status: 'approved' })
      toast.success('Contact ownership reassigned')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reassign contact'
      toast.error(message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleDeny = async (requestId: string) => {
    setProcessingId(requestId)
    try {
      await resolveRequest.mutateAsync({ requestId, status: 'denied' })
      toast.success('Access request denied')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to deny request'
      toast.error(message)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-2">
      {pendingForContact.map((request) => (
        <div key={request.id} className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <UserPlus className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900">Access Request</p>
            <p className="text-sm text-blue-800 mt-0.5">
              <strong>{request.requesterName}</strong> requested access to this contact
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={() => handleApprove(request.id)}
              disabled={processingId === request.id}
            >
              {processingId === request.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <UserCheck className="h-3.5 w-3.5 mr-1" />
                  Share
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleReassign(request.id, request.requesterId)}
              disabled={processingId === request.id}
            >
              Reassign
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDeny(request.id)}
              disabled={processingId === request.id}
              className="text-ash-400 hover:text-red-600"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
