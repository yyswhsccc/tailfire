"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Filter,
  Plane,
  Search,
} from "lucide-react";
import { usePortalTrips } from "@/hooks/use-portal-data";
import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@tailfire/ui-public";

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "confirmed":
    case "in_progress":
      return "bg-green-600 text-white border-0";
    case "booked":
      return "bg-blue-600 text-white border-0";
    case "completed":
      return "bg-phoenix-gold text-white border-0";
    default:
      return "bg-phoenix-orange text-white border-0";
  }
}

function formatTripStatus(status: string) {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TripsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("upcoming");
  const { data: allTrips = [], isLoading } = usePortalTrips();

  const upcomingTrips = allTrips.filter((t) => t.status !== "completed");
  const pastTrips = allTrips.filter((t) => t.status === "completed");

  const displayedTrips = activeTab === "upcoming" ? upcomingTrips : pastTrips;
  const filteredTrips = displayedTrips.filter((trip) =>
    trip.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              <Skeleton className="h-48 w-full bg-phoenix-charcoal/30 rounded-lg" />
              <Skeleton className="h-48 w-full bg-phoenix-charcoal/30 rounded-lg" />
              <Skeleton className="h-48 w-full bg-phoenix-charcoal/30 rounded-lg" />
            </div>
          ) : filteredTrips.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredTrips.map((trip) => (
                <Card
                  key={trip.id}
                  className="bg-phoenix-charcoal/50 border-phoenix-gold/30 overflow-hidden hover:border-phoenix-gold/50 transition-all"
                >
                  {trip.coverImageUrl ? (
                    <div
                      className="relative h-48 bg-cover bg-center"
                      style={{ backgroundImage: `url(${trip.coverImageUrl})` }}
                    >
                      <div className="absolute top-3 right-3">
                        <Badge className={getStatusBadgeClass(trip.status)}>
                          {formatTripStatus(trip.status)}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="relative h-48 bg-gradient-to-br from-phoenix-gold/20 to-phoenix-charcoal/80 flex items-center justify-center">
                      <Plane className="h-16 w-16 text-phoenix-gold/40" />
                      <div className="absolute top-3 right-3">
                        <Badge className={getStatusBadgeClass(trip.status)}>
                          {formatTripStatus(trip.status)}
                        </Badge>
                      </div>
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div>
                      <h3 className="font-semibold text-white text-lg">
                        {trip.name}
                      </h3>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-sm text-phoenix-text-muted">
                      {trip.startDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(trip.startDate)}
                          {trip.endDate && ` - ${formatDate(trip.endDate)}`}
                        </span>
                      )}
                    </div>

                    {trip.tripType && (
                      <div className="mt-2">
                        <Badge
                          variant="outline"
                          className="border-phoenix-gold/30 text-phoenix-text-muted text-xs"
                        >
                          {trip.tripType}
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Plane className="h-12 w-12 mx-auto text-phoenix-text-muted mb-4" />
              <h3 className="text-xl font-medium text-white">No trips found</h3>
              <p className="text-phoenix-text-muted mt-2">
                {searchQuery
                  ? `No trips matching "${searchQuery}"`
                  : activeTab === "upcoming"
                    ? "You don't have any upcoming trips yet. Your trips will appear here once your advisor creates them."
                    : "No past trips to show."}
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
