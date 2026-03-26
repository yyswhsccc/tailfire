import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "All-Inclusive Resorts | Phoenix Voyages",
  description:
    "Browse all-inclusive resort packages with Phoenix Voyages. Curated sun destinations, beach resorts, and family packages. Talk to an advisor or browse instantly.",
  openGraph: {
    title: "All-Inclusive Resorts | Phoenix Voyages",
    description:
      "Browse all-inclusive resort packages. Curated sun destinations and beach resorts.",
  },
};

export default function AllInclusivesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          ALL-INCLUSIVE RESORTS
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Sun, sand, and everything included — browse packages from our preferred resort partners
        </p>
      </div>

      {/* AI concierge CTA */}
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-[#C59746]/30 bg-[#C59746]/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-[#1A1A1A]">Not sure where to start?</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Our AI concierge can help you narrow down destinations, compare properties, and
            connect you with the right advisor.
          </p>
        </div>
        <a
          href="/contact"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#C59746] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
        >
          <MessageCircle className="size-4" />
          Talk to our AI concierge
        </a>
      </div>

      {/* Responsive iframe — Softvoyage booking widget */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="border-b border-border bg-[#1A1A1A] px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
            Browse All-Inclusive Packages
          </p>
        </div>
        <div className="relative" style={{ minHeight: "600px" }}>
          <iframe
            src="https://booking.softvoyage.com/v5/?LANG=EN&OFFICE=PHXVOY"
            title="All-Inclusive Resort Booking — Powered by Softvoyage"
            style={{
              width: "100%",
              minHeight: "600px",
              border: "none",
              display: "block",
            }}
            loading="lazy"
            allowFullScreen
          />
        </div>
      </div>

      {/* Disclaimer */}
      <p className="mt-4 text-xs text-muted-foreground">
        Prices displayed are in CAD, subject to availability, and may change without notice.
        All bookings made through this tool are serviced by Phoenix Voyages advisors.
      </p>
    </div>
  );
}
