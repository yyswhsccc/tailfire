import Link from "next/link";
import Image from "next/image";
import { Facebook, Instagram, Twitter } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import phoenixLogo from "@/assets/phoenix-logo.svg";

const FOOTER_SECTIONS = [
  {
    title: "Travel",
    links: [
      { label: "Cruises", href: "/search/cruises" },
      { label: "Flights", href: "/search/flights" },
      { label: "Hotels", href: "/search/hotels" },
      { label: "Tours", href: "/search/tours" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Join Us", href: "/join" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
] as const;

const SOCIAL_LINKS = [
  { label: "Facebook", href: "#", icon: Facebook },
  { label: "Instagram", href: "#", icon: Instagram },
  { label: "Twitter", href: "#", icon: Twitter },
] as const;

export function Footer() {
  return (
    <footer className="bg-[#1A1A1A] text-gray-400">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Top section: logo + link columns */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-5">
          {/* Brand column */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src={phoenixLogo}
                alt="Phoenix Voyages"
                width={36}
                height={36}
                className="h-9 w-9 brightness-0 invert"
              />
              <span className="font-display text-lg font-bold tracking-[0.15em] text-[#C59746]">
                PHOENIX VOYAGES
              </span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              Discover, Soar, Repeat
            </p>

            {/* Social links */}
            <div className="mt-6 flex gap-4">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="text-gray-500 transition-colors hover:text-[#C59746]"
                >
                  <social.icon className="size-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="font-display text-sm font-bold tracking-wider text-[#C59746]">
                {section.title}
              </h3>
              <ul className="mt-4 space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 transition-colors hover:text-[#C59746]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8 bg-gray-800" />

        {/* Bottom section */}
        <div className="flex flex-col items-center justify-between gap-4 text-center text-xs text-gray-500 md:flex-row md:text-left">
          <p>TICO Registration #XXXXX</p>
          <p>&copy; 2026 Phoenix Voyages. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
