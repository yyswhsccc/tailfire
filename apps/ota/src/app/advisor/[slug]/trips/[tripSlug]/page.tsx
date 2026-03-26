import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { publicFetch } from "@/lib/api";
import type { AdvisorProfile } from "@/types/advisor";
import type { PublishedTrip } from "@/types/published-trip";

export const revalidate = 3600; // ISR: revalidate every hour

interface TripDetailPageProps {
  params: Promise<{ slug: string; tripSlug: string }>;
}

async function fetchAdvisor(slug: string): Promise<AdvisorProfile | null> {
  try {
    return await publicFetch<AdvisorProfile>(
      `/advisor-profiles/by-slug/${slug}`,
      { next: { tags: ["advisors", `advisor-${slug}`] } },
    );
  } catch {
    return null;
  }
}

async function fetchPublishedTrip(tripSlug: string): Promise<PublishedTrip | null> {
  try {
    return await publicFetch<PublishedTrip>(
      `/ota/published-trips/by-slug/${tripSlug}`,
      { next: { tags: ["published-trips", `published-trip-${tripSlug}`] } },
    );
  } catch {
    return null;
  }
}

// ─── Snapshot helpers ───────────────────────────────────────────────────────

function getString(
  snapshot: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    if (typeof snapshot[key] === "string" && snapshot[key]) {
      return snapshot[key] as string;
    }
  }
  return null;
}

function getNumber(
  snapshot: Record<string, unknown>,
  ...keys: string[]
): number | null {
  for (const key of keys) {
    if (typeof snapshot[key] === "number") return snapshot[key] as number;
  }
  return null;
}

function extractTitle(snapshot: Record<string, unknown>): string {
  return getString(snapshot, "name", "title", "tripName") ?? "Curated Trip";
}

function extractDescription(snapshot: Record<string, unknown>): string | null {
  return getString(snapshot, "description", "overview", "summary", "intro");
}

function extractDuration(snapshot: Record<string, unknown>): string | null {
  const nights = getNumber(snapshot, "nights", "durationNights", "duration");
  if (nights != null) return `${nights} night${nights !== 1 ? "s" : ""}`;
  const days = getNumber(snapshot, "days", "durationDays");
  if (days != null) return `${days} day${days !== 1 ? "s" : ""}`;
  return getString(snapshot, "durationText", "duration");
}

function extractDestinations(snapshot: Record<string, unknown>): string[] {
  const raw = snapshot.destinations ?? snapshot.ports ?? snapshot.stops;
  if (Array.isArray(raw)) {
    return raw
      .map((d) => (typeof d === "string" ? d : (d as Record<string, unknown>)?.name))
      .filter((d): d is string => typeof d === "string" && d.length > 0);
  }
  const single = getString(snapshot, "destination", "location", "region");
  return single ? [single] : [];
}

interface SnapshotDay {
  day?: number;
  date?: string;
  title?: string;
  name?: string;
  description?: string;
  activities?: string[];
  location?: string;
}

function extractItineraryDays(
  snapshot: Record<string, unknown>,
): SnapshotDay[] {
  const raw = snapshot.itinerary ?? snapshot.days ?? snapshot.schedule;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is SnapshotDay =>
      d !== null && typeof d === "object",
  );
}

function extractStartingPriceCents(
  snapshot: Record<string, unknown>,
): number | null {
  if (
    snapshot.pricing &&
    typeof snapshot.pricing === "object" &&
    snapshot.pricing !== null
  ) {
    const p = snapshot.pricing as Record<string, unknown>;
    const val = getNumber(p, "fromPriceCents", "priceCents");
    if (val != null) return val;
  }
  return getNumber(
    snapshot,
    "fromPriceCents",
    "priceCents",
    "startingPriceCents",
  );
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(cents / 100);
}

function getBadgeContent(
  trip: PublishedTrip,
  firstName: string,
): { label: string; gold: boolean } {
  switch (trip.publishType) {
    case "hosted":
      return { label: `Hosted by ${firstName}`, gold: true };
    case "featured":
      return { label: `${firstName}'s Pick`, gold: true };
    case "recommended":
      return { label: "Recommended", gold: false };
    case "custom":
      return { label: trip.headline ?? "Featured Trip", gold: false };
  }
}

// ─── Metadata ───────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: TripDetailPageProps): Promise<Metadata> {
  const { slug, tripSlug } = await params;

  const [advisor, trip] = await Promise.all([
    fetchAdvisor(slug),
    fetchPublishedTrip(tripSlug),
  ]);

  if (!trip) {
    return { title: "Trip Not Found | Phoenix Voyages" };
  }

  const title = extractTitle(trip.renderedSnapshot);
  const description =
    extractDescription(trip.renderedSnapshot) ??
    (advisor
      ? `A curated trip by ${advisor.displayName} at Phoenix Voyages.`
      : "A curated trip from Phoenix Voyages.");

  return {
    title: `${title} | Phoenix Voyages`,
    description,
    openGraph: {
      title: `${title} | Phoenix Voyages`,
      description,
      type: "website",
      url: `/advisor/${slug}/trips/${tripSlug}`,
      ...(trip.heroImageUrl
        ? { images: [{ url: trip.heroImageUrl, width: 1200, height: 630 }] }
        : {}),
    },
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function TripDetailPage({ params }: TripDetailPageProps) {
  const { slug, tripSlug } = await params;

  const [advisor, trip] = await Promise.all([
    fetchAdvisor(slug),
    fetchPublishedTrip(tripSlug),
  ]);

  if (!trip) {
    notFound();
  }

  const snapshot = trip.renderedSnapshot;
  const tripTitle = extractTitle(snapshot);
  const description = extractDescription(snapshot);
  const duration = extractDuration(snapshot);
  const destinations = extractDestinations(snapshot);
  const itineraryDays = extractItineraryDays(snapshot);
  const startingPriceCents = extractStartingPriceCents(snapshot);

  const firstName = advisor?.displayName.split(" ")[0] ?? "Your Advisor";
  const badge = getBadgeContent(trip, firstName);

  const ctaText = trip.callToAction || "Inquire About This Trip";

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="relative h-64 w-full bg-[#1A1A1A] sm:h-80 lg:h-96">
        {trip.heroImageUrl ? (
          <Image
            src={trip.heroImageUrl}
            alt={tripTitle}
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#1A1A1A] to-[#3A2A10]">
            <span className="text-6xl opacity-20">&#9992;</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

        {/* Overlay content */}
        <div className="absolute inset-0 flex flex-col justify-end px-4 pb-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-4xl">
            {/* Badge */}
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

            <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">
              {tripTitle}
            </h1>

            {/* Quick facts row */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/80">
              {duration && <span>{duration}</span>}
              {destinations.length > 0 && (
                <>
                  {duration && <span className="opacity-50">&middot;</span>}
                  <span>{destinations.join(", ")}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating price + CTA card */}
      <div className="-mt-6 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl bg-white p-5 shadow-lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {startingPriceCents != null ? (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Starting from
                    </p>
                    <p className="mt-0.5 text-2xl font-bold text-[#1A1A1A]">
                      {formatPrice(startingPriceCents)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        /person
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Contact for pricing
                  </p>
                )}
              </div>

              <Link
                href={`/advisor/${slug}#contact`}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#C59746] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] sm:w-auto"
              >
                {ctaText}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
        {/* Advisor attribution */}
        {advisor && (
          <div className="mt-8 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#C59746] to-[#E89E4A] text-xs font-bold text-white">
              {advisor.displayName
                .split(" ")
                .map((p) => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Curated by</p>
              <Link
                href={`/advisor/${advisor.slug}`}
                className="text-sm font-semibold text-[#C59746] hover:text-[#B08638]"
              >
                {advisor.displayName}
              </Link>
              {advisor.title && (
                <p className="text-xs text-muted-foreground">{advisor.title}</p>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {description && (
          <div className="mt-8">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[#1A1A1A]">
              About This Trip
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        )}

        {/* Destinations */}
        {destinations.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[#1A1A1A]">
              Destinations
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {destinations.map((dest) => (
                <span
                  key={dest}
                  className="rounded-full bg-gray-100 px-3.5 py-1.5 text-xs font-medium text-[#1A1A1A]"
                >
                  {dest}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Itinerary */}
        {itineraryDays.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[#1A1A1A]">
              Itinerary
            </h2>
            <div className="mt-4 space-y-4">
              {itineraryDays.map((day, index) => {
                const dayLabel =
                  day.day != null
                    ? `Day ${day.day}`
                    : day.date
                      ? new Date(day.date).toLocaleDateString("en-CA", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      : `Day ${index + 1}`;
                const dayTitle =
                  day.title ?? day.name ?? day.location ?? null;
                const dayDescription = day.description ?? null;
                const dayActivities = Array.isArray(day.activities)
                  ? day.activities
                  : [];

                return (
                  <div
                    key={index}
                    className="flex gap-4 rounded-lg border border-border p-4"
                  >
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#C59746]">
                        {dayLabel}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      {dayTitle && (
                        <p className="text-sm font-semibold text-[#1A1A1A]">
                          {dayTitle}
                        </p>
                      )}
                      {dayDescription && (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {dayDescription}
                        </p>
                      )}
                      {dayActivities.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {dayActivities.map((activity, ai) => (
                            <li
                              key={ai}
                              className="flex items-start gap-1.5 text-sm text-muted-foreground"
                            >
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C59746]" />
                              {activity}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-12 rounded-xl bg-[#faf6f0] p-6 text-center">
          <h3 className="font-display text-lg font-bold text-[#1A1A1A]">
            Interested in this trip?
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {firstName} can tailor this itinerary to match your dates, group
            size, and preferences.
          </p>
          <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href={`/advisor/${slug}#contact`}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#C59746] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] sm:w-auto"
            >
              {ctaText}
            </Link>
            <Link
              href={`/advisor/${slug}/trips`}
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-white px-6 py-2.5 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-gray-50 sm:w-auto"
            >
              View All Trips
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
