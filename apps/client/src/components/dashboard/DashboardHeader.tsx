"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Bell,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useConsultant } from "@/context/consultant-context";
import {
  Button,
  Avatar,
  AvatarFallback,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@tailfire/ui-public";
import { DashboardNav } from "./DashboardNav";

export function DashboardHeader() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { consultant } = useConsultant();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "U";

  return (
    <header className="sticky top-0 z-50 bg-phoenix-charcoal/95 backdrop-blur-sm border-b border-phoenix-gold/30">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="Phoenix Voyages"
              width={150}
              height={40}
              className="h-10 w-auto"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:block">
            <DashboardNav />
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {/* Messages */}
            <Link href="/messages">
              <Button
                variant="ghost"
                size="icon"
                className="text-phoenix-text-muted hover:text-white relative"
              >
                <MessageSquare className="h-5 w-5" />
                <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-phoenix-gold text-white text-xs">
                  2
                </Badge>
                <span className="sr-only">Messages</span>
              </Button>
            </Link>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-phoenix-text-muted hover:text-white relative"
                >
                  <Bell className="h-5 w-5" />
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-phoenix-orange text-white text-xs">
                    3
                  </Badge>
                  <span className="sr-only">Notifications</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-80 bg-phoenix-charcoal border-phoenix-gold/30"
              >
                <DropdownMenuLabel className="text-white">
                  Notifications
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-phoenix-gold/30" />
                <DropdownMenuItem className="hover:bg-phoenix-gold/10 cursor-pointer">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-white">Payment Reminder</p>
                    <p className="text-xs text-phoenix-text-muted">
                      Safari Adventure final payment due in 14 days
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-phoenix-gold/10 cursor-pointer">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-white">Document Ready</p>
                    <p className="text-xs text-phoenix-text-muted">
                      Your e-tickets are now available
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-phoenix-gold/10 cursor-pointer">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm text-white">New Message</p>
                    <p className="text-xs text-phoenix-text-muted">
                      {consultant.name} sent you a message
                    </p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-phoenix-gold/30" />
                <DropdownMenuItem className="hover:bg-phoenix-gold/10 cursor-pointer justify-center">
                  <span className="text-phoenix-gold text-sm">
                    View all notifications
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 hover:bg-phoenix-gold/10"
                >
                  <Avatar className="h-8 w-8 border border-phoenix-gold/50">
                    <AvatarFallback className="bg-phoenix-gold/20 text-phoenix-gold text-sm">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-white text-sm">
                    {user?.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-phoenix-charcoal border-phoenix-gold/30"
              >
                <DropdownMenuLabel className="text-white">
                  <div className="flex flex-col">
                    <span>{user?.name}</span>
                    <span className="text-xs text-phoenix-text-muted font-normal">
                      {user?.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-phoenix-gold/30" />
                <DropdownMenuItem
                  className="hover:bg-phoenix-gold/10 cursor-pointer text-phoenix-text-light"
                  onClick={() => router.push("/settings")}
                >
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="hover:bg-phoenix-gold/10 cursor-pointer text-phoenix-text-light"
                  onClick={() => router.push("/settings")}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-phoenix-gold/30" />
                <DropdownMenuItem
                  className="hover:bg-phoenix-gold/10 cursor-pointer text-phoenix-text-light"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile menu trigger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden text-phoenix-text-muted hover:text-white"
                >
                  {mobileMenuOpen ? (
                    <X className="h-6 w-6" />
                  ) : (
                    <Menu className="h-6 w-6" />
                  )}
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="bg-phoenix-charcoal border-phoenix-gold/30 w-80"
              >
                <div className="mt-8">
                  <DashboardNav mobile onNavigate={() => setMobileMenuOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
