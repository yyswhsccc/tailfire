"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft,
  Calendar,
  Filter,
  MapPin,
  Search,
  Loader2,
} from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@tailfire/ui-public"
import { useClientTrips } from "@/hooks/use-client-trips"

const getStatusColor = (status: string) => {
  switch (status) {
    case "booked":
      return "bg-green-600"
    case "quoted":
      return "bg-phoenix-orange"
    case "draft":
      return "bg-blue-600"
    case "in_progress":
      return "bg-emerald-600"
    case "completed":
      return "bg-phoenix-gold"
    case "cancelled":
      return "bg-red-600"
    default:
      return "bg-gray-600"
  }
}

const formatStatus = (status: string) => {
  return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "TBD"
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function TripsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("upcoming")
  const { data: trips, isLoading, error } = useClientTrips()

  const upcomingTrips = trips?.filter(
    (t) => !["completed", "cancelled"].includes(t.status)
  ) ?? []
  const pastTrips = trips?.filter(
    (t) => ["completed", "cancelled"].includes(t.status)
  ) ?? []

  const displayedTrips = activeTab === "upcoming" ? upcomingTrips : pastTrips
  const filteredTrips = displayedTrips.filter(
    (trip) =>
      trip.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-phoenix-gold" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Failed to load trips. Please try again.</p>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                className="text-phoenix-text-muted hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="sr-only">Back to Dashboard</span>
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-white">My Trips</h1>
          </div>
          <p className="text-phoenix-text-muted mt-1 ml-10">
            View and manage your travel itineraries
          </p>
        </div>
        <div className="flex gap-2 ml-10 sm:ml-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-phoenix-text-muted" />
            <Input
              type="search"
              placeholder="Search trips..."
              className="pl-9 bg-phoenix-charcoal/50 border-phoenix-gold/30 text-white w-full sm:w-[200px] lg:w-[300px]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="border-phoenix-gold/30 text-phoenix-gold hover:bg-phoenix-gold/10"
          >
            <Filter className="h-4 w-4 mr-2" /> Filter
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-phoenix-charcoal/50 border border-phoenix-gold/30 p-1 w-full sm:w-auto">
          <TabsTrigger
            value="upcoming"
            className="data-[state=active]:bg-phoenix-gold data-[state=active]:text-white text-phoenix-text-light"
          >
            Upcoming ({upcomingTrips.length})
          </TabsTrigger>
          <TabsTrigger
            value="past"
            className="data-[state=active]:bg-phoenix-gold data-[state=active]:text-white text-phoenix-text-light"
          >
            Past Trips ({pastTrips.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="pt-6">
          {filteredTrips.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredTrips.map((trip) => (
                <Link key={trip.tripId} href={`/trips/${trip.tripId}`}>
                  <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30 overflow-hidden hover:border-phoenix-gold/50 transition-all cursor-pointer">
                    <div className="relative h-48 bg-phoenix-charcoal/30">
                      {trip.coverPhotoUrl ? (
                        <Image
                          src={trip.coverPhotoUrl}
                          alt={trip.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <MapPin className="h-12 w-12 text-phoenix-text-muted/30" />
                        </div>
                      )}
                      <div className="absolute top-3 right-3">
                        <Badge className={`${getStatusColor(trip.status)} text-white border-0`}>
                          {formatStatus(trip.status)}
                        </Badge>
                      </div>
                    </div>
                    <CardContent className="p-4">
                      <div>
                        <h3 className="font-semibold text-white text-lg">{trip.name}</h3>
                        {trip.description && (
                          <p className="text-phoenix-text-muted text-sm mt-1 line-clamp-2">
                            {trip.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-4 text-sm text-phoenix-text-muted">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(trip.startDate)}
                          {trip.endDate && ` - ${formatDate(trip.endDate)}`}
                        </span>
                      </div>

                      <div className="mt-4 pt-4 border-t border-phoenix-gold/20">
                        <Button className="w-full btn-phoenix-primary">View Trip Details</Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <MapPin className="h-12 w-12 mx-auto text-phoenix-text-muted mb-4" />
              <h3 className="text-xl font-medium text-white">No trips found</h3>
              <p className="text-phoenix-text-muted mt-2">
                {searchQuery
                  ? `No trips matching "${searchQuery}"`
                  : "You don't have any trips yet. Contact your travel advisor to get started!"}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
