"use client";

import Link from "next/link";
import {
  Briefcase,
  Calendar,
  CreditCard,
  FileText,
  MessageSquare,
  Users,
  ArrowRight,
  Plane,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useConsultant } from "@/context/consultant-context";
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
  Progress,
} from "@tailfire/ui-public";

// Mock data for dashboard
const upcomingTrips = [
  {
    id: "trip-1",
    name: "Mediterranean Cruise",
    destination: "Greece & Italy",
    startDate: "June 15, 2025",
    endDate: "June 28, 2025",
    status: "Confirmed",
    progress: 85,
  },
  {
    id: "trip-2",
    name: "Safari Adventure",
    destination: "Tanzania",
    startDate: "September 5, 2025",
    endDate: "September 15, 2025",
    status: "Pending Payment",
    progress: 45,
  },
];

const recentDocuments = [
  { id: "doc-1", name: "E-Tickets - Mediterranean", type: "PDF", date: "May 1" },
  { id: "doc-2", name: "Travel Insurance", type: "PDF", date: "May 5" },
  { id: "doc-3", name: "Shore Excursions", type: "PDF", date: "May 10" },
];

const quickActions = [
  { icon: Briefcase, label: "My Trips", href: "/trips", color: "text-blue-400" },
  { icon: Users, label: "Travelers", href: "/travelers", color: "text-green-400" },
  { icon: MessageSquare, label: "Messages", href: "/messages", color: "text-purple-400" },
  { icon: FileText, label: "Documents", href: "/documents", color: "text-orange-400" },
  { icon: CreditCard, label: "Payments", href: "/payments", color: "text-pink-400" },
  { icon: Calendar, label: "Preferences", href: "/preferences", color: "text-cyan-400" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { consultant } = useConsultant();

  const advisorInitials = consultant.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white font-display">
            Welcome back, {user?.user_metadata?.full_name?.split(" ")[0] || "there"}!
          </h1>
          <p className="text-phoenix-text-muted mt-1">
            Here&apos;s an overview of your travel plans
          </p>
        </div>
        <Link href="/messages">
          <Button className="btn-phoenix-primary">
            <MessageSquare className="h-4 w-4 mr-2" />
            Message Your Advisor
          </Button>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
              {upcomingTrips.map((trip) => (
                <div
                  key={trip.id}
                  className="p-4 rounded-lg border border-phoenix-gold/20 bg-phoenix-charcoal/30 hover:border-phoenix-gold/40 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white">{trip.name}</h3>
                        <Badge
                          className={
                            trip.status === "Confirmed"
                              ? "bg-green-600 text-white border-0"
                              : "bg-phoenix-orange text-white border-0"
                          }
                        >
                          {trip.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-phoenix-text-muted">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {trip.destination}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {trip.startDate}
                        </span>
                      </div>
                    </div>
                    <div className="w-full sm:w-32">
                      <div className="flex justify-between text-xs text-phoenix-text-muted mb-1">
                        <span>Progress</span>
                        <span>{trip.progress}%</span>
                      </div>
                      <Progress value={trip.progress} className="h-2" />
                    </div>
                  </div>
                </div>
              ))}
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
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-phoenix-gold">
                  <AvatarFallback className="bg-phoenix-gold text-white text-xl">
                    {advisorInitials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-medium text-white">{consultant.name}</h3>
                  <p className="text-sm text-phoenix-text-muted">
                    {consultant.title || "Travel Consultant"}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Link href="/messages">
                  <Button className="w-full btn-phoenix-primary">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Send Message
                  </Button>
                </Link>
              </div>
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
              <div className="space-y-3">
                {recentDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-phoenix-gold/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-phoenix-gold/20 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-phoenix-gold" />
                      </div>
                      <div>
                        <p className="text-sm text-white">{doc.name}</p>
                        <p className="text-xs text-phoenix-text-muted">{doc.type}</p>
                      </div>
                    </div>
                    <span className="text-xs text-phoenix-text-muted">{doc.date}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
