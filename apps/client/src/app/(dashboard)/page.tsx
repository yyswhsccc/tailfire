"use client";

import Link from "next/link";
import {
  Briefcase,
  Calendar,
  FileText,
  ArrowRight,
  Plane,
  Mail,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePortalProfile, usePortalTrips, usePortalDocuments } from "@/hooks/use-portal-data";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Skeleton,
} from "@tailfire/ui-public";

const quickActions = [
  { icon: Briefcase, label: "My Trips", href: "/trips", color: "text-blue-400" },
  { icon: FileText, label: "Documents", href: "/documents", color: "text-orange-400" },
  { icon: User, label: "My Profile", href: "/travelers", color: "text-purple-400" },
];

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

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = usePortalProfile();
  const { data: trips = [], isLoading: tripsLoading } = usePortalTrips();
  const { data: documents = [], isLoading: docsLoading } = usePortalDocuments();

  const displayName = profile?.displayName || user?.name || "Traveler";
  const firstName = displayName.split(" ")[0];

  const agent = profile?.agent;
  const advisorName = agent?.name || "Your Travel Advisor";
  const advisorInitials = advisorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const recentDocs = documents.slice(0, 3);

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-white font-display">
          Welcome back, {firstName}!
        </h1>
        <p className="text-phoenix-text-muted mt-1">
          Here&apos;s an overview of your travel plans
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href}>
              <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30 hover:border-phoenix-gold/50 transition-all cursor-pointer group">
                <CardContent className="p-4 flex flex-col items-center text-center">
                  <div className="h-12 w-12 rounded-full bg-phoenix-gold/10 flex items-center justify-center mb-3 group-hover:bg-phoenix-gold/20 transition-colors">
                    <Icon className={`h-6 w-6 ${action.color}`} />
                  </div>
                  <span className="text-sm text-phoenix-text-light group-hover:text-white transition-colors">
                    {action.label}
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Trips */}
        <div className="lg:col-span-2">
          <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white flex items-center gap-2">
                  <Plane className="h-5 w-5 text-phoenix-gold" />
                  Upcoming Trips
                </CardTitle>
                <CardDescription className="text-phoenix-text-muted">
                  Your scheduled adventures
                </CardDescription>
              </div>
              <Link href="/trips">
                <Button variant="ghost" className="text-phoenix-gold hover:bg-phoenix-gold/10">
                  View All <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              {tripsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full bg-phoenix-charcoal/30" />
                  <Skeleton className="h-24 w-full bg-phoenix-charcoal/30" />
                </div>
              ) : trips.length === 0 ? (
                <div className="text-center py-8">
                  <Plane className="h-12 w-12 text-phoenix-text-muted mx-auto mb-3" />
                  <p className="text-phoenix-text-muted">No trips yet</p>
                  <p className="text-sm text-phoenix-text-muted mt-1">
                    Your trips will appear here once your advisor creates them.
                  </p>
                </div>
              ) : (
                trips.map((trip) => (
                  <div
                    key={trip.id}
                    className="p-4 rounded-lg border border-phoenix-gold/20 bg-phoenix-charcoal/30 hover:border-phoenix-gold/40 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-white">{trip.name}</h3>
                          <Badge className={getStatusBadgeClass(trip.status)}>
                            {formatTripStatus(trip.status)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-phoenix-text-muted">
                          {trip.startDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {formatDate(trip.startDate)}
                              {trip.endDate && ` - ${formatDate(trip.endDate)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Your Advisor */}
          <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
            <CardHeader>
              <CardTitle className="text-white text-lg">Your Travel Advisor</CardTitle>
            </CardHeader>
            <CardContent>
              {profileLoading ? (
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16 rounded-full bg-phoenix-charcoal/30" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32 bg-phoenix-charcoal/30" />
                    <Skeleton className="h-3 w-24 bg-phoenix-charcoal/30" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-phoenix-gold">
                    <AvatarFallback className="bg-phoenix-gold text-white text-xl">
                      {advisorInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-medium text-white">{advisorName}</h3>
                    {agent?.email && (
                      <a
                        href={`mailto:${agent.email}`}
                        className="text-sm text-phoenix-gold hover:underline flex items-center gap-1 mt-1"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {agent.email}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Documents */}
          <Card className="bg-phoenix-charcoal/50 border-phoenix-gold/30">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-phoenix-gold" />
                Recent Documents
              </CardTitle>
              <Link href="/documents">
                <Button variant="ghost" size="sm" className="text-phoenix-gold hover:bg-phoenix-gold/10">
                  View All
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full bg-phoenix-charcoal/30" />
                  <Skeleton className="h-10 w-full bg-phoenix-charcoal/30" />
                </div>
              ) : recentDocs.length === 0 ? (
                <p className="text-sm text-phoenix-text-muted text-center py-4">
                  No documents yet
                </p>
              ) : (
                <div className="space-y-3">
                  {recentDocs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-phoenix-gold/10 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-phoenix-gold/20 flex items-center justify-center">
                          <FileText className="h-4 w-4 text-phoenix-gold" />
                        </div>
                        <div>
                          <p className="text-sm text-white truncate max-w-[200px]">{doc.fileName}</p>
                          <p className="text-xs text-phoenix-text-muted">
                            {doc.documentType || "Document"}
                          </p>
                        </div>
                      </div>
                      {doc.uploadedAt && (
                        <span className="text-xs text-phoenix-text-muted">
                          {formatDate(doc.uploadedAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
