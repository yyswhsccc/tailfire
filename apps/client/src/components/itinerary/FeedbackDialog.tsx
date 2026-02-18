"use client"

import { useState } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@tailfire/ui-public"
import type { ItineraryDay } from "@/hooks/use-client-itinerary"

interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "approve" | "change_request"
  days: ItineraryDay[]
  onSubmit: (data: {
    message?: string
    activityNotes?: { activityId: string; activityName: string; note: string }[]
  }) => void
  isSubmitting: boolean
}

export function FeedbackDialog({
  open,
  onOpenChange,
  type,
  days,
  onSubmit,
  isSubmitting,
}: FeedbackDialogProps) {
  const [message, setMessage] = useState("")
  const [activityNotes, setActivityNotes] = useState<Record<string, string>>({})

  const allActivities = days.flatMap((day) =>
    day.activities.map((a) => ({ id: a.id, name: a.name, dayTitle: day.title || `Day ${day.dayNumber}` }))
  )

  const handleSubmit = () => {
    const notes = Object.entries(activityNotes)
      .filter(([, note]) => note.trim())
      .map(([activityId, note]) => {
        const activity = allActivities.find((a) => a.id === activityId)
        return {
          activityId,
          activityName: activity?.name || "Unknown",
          note: note.trim(),
        }
      })

    onSubmit({
      message: message.trim() || undefined,
      activityNotes: notes.length > 0 ? notes : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-phoenix-charcoal border-phoenix-gold/30 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">
            {type === "approve" ? "Approve Itinerary" : "Request Changes"}
          </DialogTitle>
          <DialogDescription className="text-phoenix-text-muted">
            {type === "approve"
              ? "Add an optional comment before approving this itinerary."
              : "Describe what changes you'd like to see. You can add notes for specific activities."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label className="text-phoenix-text-light">
              Overall Comment {type === "approve" && "(optional)"}
            </Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === "approve"
                  ? "Looks great! We're excited for this trip."
                  : "Please describe the changes you'd like..."
              }
              className="mt-2 bg-phoenix-charcoal/50 border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted min-h-[100px]"
            />
          </div>

          {type === "change_request" && allActivities.length > 0 && (
            <div>
              <Label className="text-phoenix-text-light mb-2 block">
                Per-Activity Notes (optional)
              </Label>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {allActivities.map((activity) => (
                  <div key={activity.id} className="flex flex-col gap-1">
                    <span className="text-sm text-phoenix-text-muted">
                      {activity.dayTitle} &mdash; {activity.name}
                    </span>
                    <Textarea
                      value={activityNotes[activity.id] || ""}
                      onChange={(e) =>
                        setActivityNotes((prev) => ({
                          ...prev,
                          [activity.id]: e.target.value,
                        }))
                      }
                      placeholder="Add a note for this activity..."
                      className="bg-phoenix-charcoal/50 border-phoenix-gold/30 text-white placeholder:text-phoenix-text-muted text-sm min-h-[60px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-phoenix-gold/30 text-phoenix-text-light"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={
              type === "approve"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "btn-phoenix-primary"
            }
          >
            {isSubmitting
              ? "Submitting..."
              : type === "approve"
                ? "Approve Itinerary"
                : "Submit Change Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
