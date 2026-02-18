"use client"

import { use } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Loader2,
  MessageSquare,
  CheckCircle2,
  Clock,
} from "lucide-react"
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@tailfire/ui-public"
import { useClientItinerary } from "@/hooks/use-client-itinerary"
import { useFeedbackHistory } from "@/hooks/use-client-feedback"
import { ItineraryTimeline } from "@/components/itinerary/ItineraryTimeline"
import { ItineraryApprovalBar } from "@/components/itinerary/ItineraryApprovalBar"

const getStatusColor = (status: string) => {
  switch (status) {
    case "proposing": return "bg-blue-500"
    case "approved": return "bg-green-500"
    case "archived": return "bg-gray-500"
    default: return "bg-gray-600"
  }
}

const formatStatus = (status: string) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "TBD"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

const formatDatetime = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function ItineraryPage({
  params,
}: {
  params: Promise<{ tripId: string; itineraryId: string }>
}) {
  const { tripId, itineraryId } = use(params)
  const { data: itinerary, isLoading, error } = useClientItinerary(tripId, itineraryId)
  const { data: feedback } = useFeedbackHistory(tripId, itineraryId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-phoenix-gold" />
      </div>
    )
  }

  if (error || !itinerary) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Failed to load itinerary.</p>
        <Link href={`/trips/${tripId}`}>
          <Button variant="outline" className="mt-4 border-phoenix-gold/30 text-phoenix-text-light">
            Back to Trip
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/trips/${tripId}`}>
          <Button variant="ghost" size="icon" className="text-phoenix-text-muted hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{itinerary.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge className={`${getStatusColor(itinerary.status)} text-white border-0`}>
              {formatStatus(itinerary.status)}
            </Badge>
            {itinerary.primaryDestinationName && (
              <span className="flex items-center gap-1 text-phoenix-text-muted text-sm">
                <MapPin className="h-3 w-3" />
                {itinerary.primaryDestinationName}
                {itinerary.secondaryDestinationName && ` & ${itinerary.secondaryDestinationName}`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cover photo */}
      {itinerary.coverPhoto && (
        <div className="relative h-56 rounded-lg overflow-hidden mb-8">
          <Image src={itinerary.coverPhoto} alt={itinerary.name} fill className="object-cover" />
        </div>
      )}

      {/* Overview */}
      {itinerary.overview && (
        <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30 mb-8">
          <CardContent className="pt-6">
            <p className="text-phoenix-text-light whitespace-pre-line">{itinerary.overview}</p>
          </CardContent>
        </Card>
      )}

      {/* Dates */}
      {(itinerary.startDate || itinerary.endDate) && (
        <div className="flex items-center gap-2 text-phoenix-text-muted mb-8">
          <Calendar className="h-4 w-4" />
          <span>
            {formatDate(itinerary.startDate)} - {formatDate(itinerary.endDate)}
          </span>
          <span className="text-phoenix-text-muted/50">
            ({itinerary.days.length} days)
          </span>
        </div>
      )}

      {/* Tabs: Timeline & Feedback */}
      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="bg-phoenix-charcoal/50 border border-phoenix-gold/30 p-1 w-full sm:w-auto mb-6">
          <TabsTrigger
            value="timeline"
            className="data-[state=active]:bg-phoenix-gold data-[state=active]:text-white text-phoenix-text-light"
          >
            Timeline ({itinerary.days.length} days)
          </TabsTrigger>
          <TabsTrigger
            value="feedback"
            className="data-[state=active]:bg-phoenix-gold data-[state=active]:text-white text-phoenix-text-light"
          >
            Feedback ({feedback?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <ItineraryTimeline days={itinerary.days} />
        </TabsContent>

        <TabsContent value="feedback">
          {feedback && feedback.length > 0 ? (
            <div className="space-y-4">
              {feedback.map((entry) => (
                <Card key={entry.id} className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        entry.feedbackType === "approval"
                          ? "bg-green-600/20"
                          : "bg-phoenix-orange/20"
                      }`}>
                        {entry.feedbackType === "approval" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-phoenix-orange" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {entry.submittedBy.firstName} {entry.submittedBy.lastName}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              entry.feedbackType === "approval"
                                ? "border-green-500/30 text-green-400"
                                : "border-phoenix-orange/30 text-phoenix-orange"
                            }`}
                          >
                            {entry.feedbackType === "approval" ? "Approved" : "Change Request"}
                          </Badge>
                          {entry.status !== "pending" && (
                            <Badge variant="outline" className="text-xs border-phoenix-gold/30 text-phoenix-text-muted">
                              {formatStatus(entry.status)}
                            </Badge>
                          )}
                        </div>
                        {entry.message && (
                          <p className="text-phoenix-text-light text-sm mt-2">{entry.message}</p>
                        )}
                        {entry.activityNotes && entry.activityNotes.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {entry.activityNotes.map((note, i) => (
                              <div key={i} className="bg-phoenix-charcoal/30 rounded p-2 text-sm">
                                <span className="text-phoenix-gold font-medium">{note.activityName}:</span>{" "}
                                <span className="text-phoenix-text-muted">{note.note}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-2 text-xs text-phoenix-text-muted">
                          <Clock className="h-3 w-3" />
                          {formatDatetime(entry.createdAt)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 mx-auto text-phoenix-text-muted/30 mb-4" />
              <p className="text-phoenix-text-muted">No feedback has been submitted yet.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approval bar (sticky bottom) - only for proposing itineraries */}
      <ItineraryApprovalBar
        tripId={tripId}
        itineraryId={itineraryId}
        status={itinerary.status}
        days={itinerary.days}
      />

      {/* Bottom spacer when approval bar is visible */}
      {itinerary.status === "proposing" && <div className="h-20" />}
    </>
  )
}
