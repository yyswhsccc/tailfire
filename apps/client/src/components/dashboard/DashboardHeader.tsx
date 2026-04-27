"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, Menu, User, X, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePortalProfile } from "@/hooks/use-portal-data";
import phoenixLogo from "@/assets/phoenix-logo.svg";
import {
  Button,
  Avatar,
  AvatarImage,
  AvatarFallback,
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
  const { data: profile } = usePortalProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const displayName = profile?.displayName || user?.name || "Traveler";
  const userInitials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-50 bg-phoenix-charcoal/95 backdrop-blur-sm border-b border-phoenix-gold/30">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <Image
              src={phoenixLogo}
              alt="Phoenix Voyages"
              width={36}
              height={36}
              className="h-9 w-9"
            />
            <span className="font-display text-base font-bold tracking-[0.15em] text-white hidden sm:inline">
              PHOENIX VOYAGES
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:block">
            <DashboardNav />
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-3">
            {/* Browse Trips external link */}
            <a
              href={process.env.NEXT_PUBLIC_OTA_URL || "https://ota.phoenixvoyages.ca"}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1 text-sm text-phoenix-text-light transition-colors hover:text-phoenix-gold"
            >
              Browse Trips
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 hover:bg-phoenix-gold/10"
                >
                  <Avatar className="h-8 w-8 border border-phoenix-gold/50">
                    {profile?.photoUrl ? (
                      <AvatarImage src={profile.photoUrl} alt={displayName} />
                    ) : null}
                    <AvatarFallback className="bg-phoenix-gold/20 text-phoenix-gold text-sm">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-white text-sm">
                    {displayName}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-phoenix-charcoal border-phoenix-gold/30"
              >
                <DropdownMenuLabel className="text-white">
                  <div className="flex flex-col">
                    <span>{displayName}</span>
                    <span className="text-xs text-phoenix-text-muted font-normal">
                      {user?.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-phoenix-gold/30" />
                <DropdownMenuItem asChild>
                  <Link
                    href="/travelers"
                    className="hover:bg-phoenix-gold/10 cursor-pointer text-phoenix-text-light"
                  >
                    <User className="h-4 w-4 mr-2" />
                    My Profile
                  </Link>
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
