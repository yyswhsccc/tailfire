"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/layout/mobile-nav";
import phoenixLogo from "@/assets/phoenix-logo.svg";

const NAV_LINKS = [
  { label: "Deals", href: "/deals" },
  { label: "Cruises", href: "/search/cruises" },
  { label: "Flights", href: "/search/flights" },
  { label: "Hotels", href: "/search/hotels" },
  { label: "Tours", href: "/search/tours" },
  { label: "Advisors", href: "/advisors" },
  { label: "Join Us", href: "/join" },
] as const;

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

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

        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-muted hover:text-[#C59746]"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:block">
          <Button
            className="bg-[#C59746] text-white hover:bg-[#B08638]"
            size="default"
          >
            Talk to AI
          </Button>
        </div>

        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu className="size-5" />
        </Button>
      </nav>

      {/* Mobile sheet */}
      <MobileNav open={mobileOpen} onOpenChange={setMobileOpen} />
    </header>
  );
}

export { NAV_LINKS };
