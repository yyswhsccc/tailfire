"use client"

import { use } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Loader2,
  FileText,
  ChevronRight,
} from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Avatar,
  AvatarFallback,
} from "@tailfire/ui-public"
import { useClientTrip } from "@/hooks/use-client-trips"

const getStatusColor = (status: string) => {
  switch (status) {
    case "active": return "bg-green-600"
    case "planning": return "bg-phoenix-orange"
    case "draft": return "bg-blue-600"
    case "travelling": return "bg-emerald-600"
    case "travelled": return "bg-phoenix-gold"
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

export default function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>
}) {
  const { tripId } = use(params)
  const { data: trip, isLoading, error } = useClientTrip(tripId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-phoenix-gold" />
      </div>
    )
  }

  if (error || !trip) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Failed to load trip details.</p>
        <Link href="/trips">
          <Button variant="outline" className="mt-4 border-phoenix-gold/30 text-phoenix-text-light">
            Back to Trips
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-2 mb-6">
        <Link href="/trips">
          <Button variant="ghost" size="icon" className="text-phoenix-text-muted hover:text-white shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white md:text-2xl">{trip.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge className={`${getStatusColor(trip.status)} text-white border-0`}>
              {formatStatus(trip.status)}
            </Badge>
            {trip.tripType && (
              <span className="text-phoenix-text-muted text-sm capitalize">{trip.tripType}</span>
            )}
          </div>
        </div>
      </div>

      {/* Cover photo */}
      {trip.coverPhotoUrl && (
        <div className="relative h-64 rounded-lg overflow-hidden mb-8">
          <Image src={trip.coverPhotoUrl} alt={trip.name} fill className="object-cover" />
        </div>
      )}

      {/* Trip info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-phoenix-gold" />
              <div>
                <p className="text-phoenix-text-muted text-sm">Dates</p>
                <p className="text-white">
                  {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-phoenix-gold" />
              <div>
                <p className="text-phoenix-text-muted text-sm">Travelers</p>
                <p className="text-white">{trip.travelers.length} travelers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-phoenix-gold" />
              <div>
                <p className="text-phoenix-text-muted text-sm">Itineraries</p>
                <p className="text-white">{trip.itineraries.length} options</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {trip.description && (
        <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30 mb-8">
          <CardContent className="pt-6">
            <p className="text-phoenix-text-light">{trip.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Itineraries */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Itineraries</h2>
        {trip.itineraries.length === 0 ? (
          <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
            <CardContent className="pt-6 text-center">
              <p className="text-phoenix-text-muted">No itineraries available yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {trip.itineraries.map((itin) => (
              <Link key={itin.id} href={`/trips/${tripId}/itineraries/${itin.id}`}>
                <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30 hover:border-phoenix-gold/50 transition-all cursor-pointer">
                  <CardContent className="pt-6 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-white">{itin.name}</h3>
                        <Badge className={`${getStatusColor(itin.status)} text-white border-0 text-xs`}>
                          {formatStatus(itin.status)}
                        </Badge>
                      </div>
                      {itin.primaryDestinationName && (
                        <div className="flex items-center gap-1 text-phoenix-text-muted text-sm mt-1">
                          <MapPin className="h-3 w-3" />
                          {itin.primaryDestinationName}
                        </div>
                      )}
                      {itin.description && (
                        <p className="text-phoenix-text-muted text-sm mt-2 line-clamp-2">
                          {itin.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 text-phoenix-text-muted" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Travelers */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Travelers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trip.travelers.map((traveler) => (
            <Card key={traveler.id} className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
              <CardContent className="pt-6 flex items-center gap-3">
                <Avatar className="h-10 w-10 border border-phoenix-gold/30">
                  <AvatarFallback className="bg-phoenix-charcoal text-phoenix-gold text-sm">
                    {(traveler.firstName?.[0] || "") + (traveler.lastName?.[0] || "")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-white font-medium">
                    {traveler.preferredName || `${traveler.firstName} ${traveler.lastName}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-phoenix-gold/30 text-phoenix-text-muted">
                      {formatStatus(traveler.role)}
                    </Badge>
                    <span className="text-xs text-phoenix-text-muted capitalize">{traveler.travelerType}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
