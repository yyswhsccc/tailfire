import Link from "next/link";
import Image from "next/image";

import type { PublishedTrip } from "@/types/published-trip";

interface TripShowcaseCardProps {
  trip: PublishedTrip;
  advisorSlug: string;
  advisorName: string;
}

function extractTripTitle(snapshot: Record<string, unknown>): string {
  if (typeof snapshot.name === "string" && snapshot.name) return snapshot.name;
  if (typeof snapshot.title === "string" && snapshot.title) return snapshot.title;
  if (typeof snapshot.tripName === "string" && snapshot.tripName)
    return snapshot.tripName;
  return "Curated Trip";
}

function extractStartingPrice(
  snapshot: Record<string, unknown>,
): number | null {
  // Common patterns: pricing.fromPriceCents, fromPriceCents, priceCents, pricing.priceCents
  if (
    snapshot.pricing &&
    typeof snapshot.pricing === "object" &&
    snapshot.pricing !== null
  ) {
    const pricing = snapshot.pricing as Record<string, unknown>;
    if (typeof pricing.fromPriceCents === "number")
      return pricing.fromPriceCents;
    if (typeof pricing.priceCents === "number") return pricing.priceCents;
  }
  if (typeof snapshot.fromPriceCents === "number")
    return snapshot.fromPriceCents;
  if (typeof snapshot.priceCents === "number") return snapshot.priceCents;
  if (typeof snapshot.startingPriceCents === "number")
    return snapshot.startingPriceCents;
  return null;
}

function getBadgeContent(
  trip: PublishedTrip,
  advisorFirstName: string,
): { label: string; gold: boolean } {
  switch (trip.publishType) {
    case "hosted":
      return { label: `Hosted by ${advisorFirstName}`, gold: true };
    case "featured":
      return { label: `${advisorFirstName}'s Pick`, gold: true };
    case "recommended":
      return { label: "Recommended", gold: false };
    case "custom":
      return { label: trip.headline ?? "Featured Trip", gold: false };
  }
}

export function TripShowcaseCard({
  trip,
  advisorSlug,
  advisorName,
}: TripShowcaseCardProps) {
  const firstName = advisorName.split(" ")[0] ?? advisorName;
  const title = extractTripTitle(trip.renderedSnapshot);
  const startingPriceCents = extractStartingPrice(trip.renderedSnapshot);
  const badge = getBadgeContent(trip, firstName);

  const formattedPrice =
    startingPriceCents != null
      ? new Intl.NumberFormat("en-CA", {
          style: "currency",
          currency: "CAD",
        }).format(startingPriceCents / 100)
      : null;

  return (
    <Link
      href={`/advisor/${advisorSlug}/trips/${trip.slug}`}
      className="group overflow-hidden rounded-xl border border-border bg-white transition-shadow hover:shadow-lg"
    >
      {/* Hero image area */}
      <div className="relative h-44 w-full bg-[#1A1A1A]">
        {trip.heroImageUrl ? (
          <Image
            src={trip.heroImageUrl}
            alt={title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#1A1A1A] to-[#3A2A10]">
            <span className="text-4xl opacity-40">&#9992;</span>
          </div>
        )}

        {/* Publish type badge */}
        <div className="absolute left-3 top-3 z-10">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] shadow-sm ${
              badge.gold
                ? "bg-[#C59746] text-white"
                : "bg-white/90 text-[#1A1A1A]"
            }`}
          >
            {badge.gold && (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            )}
            {badge.label}
          </span>
        </div>

        {/* Gradient overlay with title */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4">
          <h3 className="text-base font-semibold leading-tight text-white">
            {title}
          </h3>
        </div>
      </div>

      {/* Content area */}
      <div className="p-4">
        <div className="flex items-end justify-between">
          {formattedPrice != null ? (
            <p className="text-sm text-muted-foreground">
              Starting from{" "}
              <span className="text-base font-bold text-[#1A1A1A]">
                {formattedPrice}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Contact for pricing</p>
          )}
          <span className="text-sm font-semibold text-[#C59746] transition-colors group-hover:text-[#E89E4A]">
            View &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
