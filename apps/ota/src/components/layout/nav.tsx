"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/layout/mobile-nav";
import { openChat } from "@/components/chat/chat-widget";
import { TripBasketIndicator } from "@/components/trip-builder/trip-basket-indicator";
// Use the gold Phoenix Voyages consumer logo
const phoenixLogo = "/phoenix-voyages-logo.png";

// Grouped navigation structure
export interface NavItem {
  label: string;
  href: string;
  children?: Array<{ label: string; href: string; description?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Offers", href: "/deals" },
  {
    label: "Cruises",
    href: "/search/cruises",
    children: [
      { label: "Search Cruises", href: "/search/cruises", description: "Find your perfect sailing" },
      { label: "Cruise Lines", href: "/cruise-lines", description: "Browse 52 cruise lines" },
    ],
  },
  {
    label: "Destinations",
    href: "/destinations",
    children: [
      { label: "All Destinations", href: "/destinations", description: "Explore worldwide" },
      { label: "Regions", href: "/regions", description: "Browse by cruise region" },
    ],
  },
  { label: "Flights", href: "/search/flights" },
  { label: "Hotels", href: "/search/hotels" },
  { label: "Tours", href: "/search/tours" },
  { label: "Advisors", href: "/advisors" },
  { label: "Join Us", href: "/join" },
];

// Flat links for backward compat
export const NAV_LINKS = NAV_ITEMS.flatMap((item) =>
  item.children
    ? item.children.map((child) => ({ label: child.label, href: child.href }))
    : [{ label: item.label, href: item.href }],
);

function NavDropdown({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-muted hover:text-[#C59746]"
      >
        {item.label}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-white py-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {item.children!.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 transition-colors hover:bg-muted"
            >
              <span className="text-sm font-medium text-[#1A1A1A]">{child.label}</span>
              {child.description && (
                <span className="block text-xs text-[#888]">{child.description}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const portalUrl = process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL || 'https://my.phoenixvoyages.ca';

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user?.app_metadata?.portal_user);
    });
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-white">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={phoenixLogo}
            alt="Phoenix Voyages"
            width={36}
            height={36}
            className="h-9 w-9"
          />
          <span className="font-display text-lg font-bold tracking-[0.15em] text-[#1A1A1A]">
            PHOENIX VOYAGES
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-0.5 lg:flex">
          {NAV_ITEMS.map((item) =>
            item.children ? (
              <NavDropdown key={item.href} item={item} />
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-muted hover:text-[#C59746]"
              >
                {item.label}
              </Link>
            ),
          )}
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-2 lg:flex">
          <TripBasketIndicator />
          <a
            href={isAuthenticated ? portalUrl : `${portalUrl}/login`}
            className="text-sm text-[#1A1A1A] transition-colors hover:text-[#C59746]"
          >
            {isAuthenticated ? 'My Account' : 'Sign In'}
          </a>
          <Button
            className="bg-[#C59746] text-white hover:bg-[#B08638]"
            size="default"
            onClick={() => openChat("Hi! I'm looking for help planning a trip.")}
          >
            Talk to AI
          </Button>
        </div>

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" />
        </Button>
      </nav>

      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} isAuthenticated={isAuthenticated} />
    </header>
  );
}
