"use client"

import { useState } from "react"
import { CheckCircle2, MessageSquare } from "lucide-react"
import { Button } from "@tailfire/ui-public"
import { toast } from "sonner"
import { FeedbackDialog } from "./FeedbackDialog"
import { useSubmitApproval, useSubmitChangeRequest } from "@/hooks/use-client-feedback"
import type { ItineraryDay } from "@/hooks/use-client-itinerary"

interface ItineraryApprovalBarProps {
  tripId: string
  itineraryId: string
  status: string
  days: ItineraryDay[]
}

export function ItineraryApprovalBar({
  tripId,
  itineraryId,
  status,
  days,
}: ItineraryApprovalBarProps) {
  const [approveOpen, setApproveOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)

  const approval = useSubmitApproval(tripId, itineraryId)
  const changeRequest = useSubmitChangeRequest(tripId, itineraryId)

  // Only show for proposing itineraries
  if (status !== "proposing") return null

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-phoenix-charcoal/95 backdrop-blur-sm border-t border-phoenix-gold/30 p-4">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <p className="text-phoenix-text-light text-sm">
            This itinerary is awaiting your review.
          </p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-phoenix-gold/30 text-phoenix-text-light hover:bg-phoenix-gold/10"
              onClick={() => setChangesOpen(true)}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Request Changes
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => setApproveOpen(true)}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve Itinerary
            </Button>
          </div>
        </div>
      </div>

      <FeedbackDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        type="approve"
        days={days}
        isSubmitting={approval.isPending}
        onSubmit={(data) => {
          approval.mutate(data, {
            onSuccess: () => {
              setApproveOpen(false)
              toast.success("Itinerary approved! Your travel advisor has been notified.")
            },
            onError: (err) => {
              toast.error(err instanceof Error ? err.message : "Failed to approve itinerary")
            },
          })
        }}
      />

      <FeedbackDialog
        open={changesOpen}
        onOpenChange={setChangesOpen}
        type="change_request"
        days={days}
        isSubmitting={changeRequest.isPending}
        onSubmit={(data) => {
          changeRequest.mutate(data, {
            onSuccess: () => {
              setChangesOpen(false)
              toast.success("Change request submitted! Your travel advisor will review it.")
            },
            onError: (err) => {
              toast.error(err instanceof Error ? err.message : "Failed to submit change request")
            },
          })
        }}
      />
    </>
  )
}
