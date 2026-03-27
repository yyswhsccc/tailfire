"use client";

import Link from "next/link";
import {
  Plane,
  Hotel,
  MapPin,
  Calendar,
  Clock,
  Star,
  ArrowRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChatProductCardsProps {
  toolName: string;
  output: unknown;
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export function ChatProductCards({ toolName, output }: ChatProductCardsProps) {
  if (toolName === "searchCruises") return <CruiseResults data={output} />;
  if (toolName === "searchFlights") return <FlightResults data={output} />;
  if (toolName === "searchHotels") return <HotelResults data={output} />;
  if (toolName === "browseTours") return <TourResults data={output} />;
  return null;
}

// ---------------------------------------------------------------------------
// Shared card wrapper
// ---------------------------------------------------------------------------

function CardShell({
  href,
  accentColor,
  children,
}: {
  href: string;
  accentColor?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
    >
      {/* Thin accent stripe */}
      <div
        className="h-1"
        style={{ backgroundColor: accentColor ?? "#1A1A1A" }}
      />
      <div className="px-3 py-2.5">{children}</div>
    </Link>
  );
}

function SectionFooter({
  href,
  label,
  count,
  total,
}: {
  href: string;
  label: string;
  count: number;
  total?: number;
}) {
  return (
    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
      <span>
        Showing {count}
        {total && total > count ? ` of ${total}` : ""} results
      </span>
      <Link
        href={href}
        className="flex items-center gap-0.5 font-medium text-[#C59746] transition-colors hover:text-[#B08638]"
      >
        {label}
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

function PriceBadge({ label, price }: { label?: string; price: string }) {
  return (
    <div className="text-right">
      {label && (
        <div className="text-[10px] uppercase tracking-wide text-gray-400">
          {label}
        </div>
      )}
      <div className="text-sm font-semibold text-[#C59746]">{price}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cruise results
// ---------------------------------------------------------------------------

interface CruiseOutput {
  cruises?: Array<{
    cruiseLine: string;
    ship: string;
    departurePort: string;
    itinerary: string;
    departureDate: string;
    endDate?: string;
    nights: number;
    insidePrice: string | null;
    balconyPrice: string | null;
    suitePrice: string | null;
  }>;
  resultCount?: number;
  totalResults?: number;
  error?: string;
}

function CruiseResults({ data }: { data: unknown }) {
  const d = data as CruiseOutput;
  if (d.error) return <ErrorCard message={d.error} />;
  const cruises = d.cruises ?? [];
  if (cruises.length === 0) return <EmptyCard label="cruises" />;

  return (
    <div className="mt-2 space-y-2">
      {cruises.map((c, i) => {
        const displayPrice =
          c.insidePrice ?? c.balconyPrice ?? c.suitePrice ?? null;
        return (
          <CardShell key={i} href="/search/cruises" accentColor="#1A1A1A">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#C59746]">
                  {c.cruiseLine}
                </div>
                <div className="truncate text-sm font-semibold text-[#1A1A1A]">
                  {c.ship}
                </div>
                <div className="mt-0.5 truncate text-xs text-gray-500">
                  {c.itinerary}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                  <span className="flex items-center gap-0.5">
                    <MapPin className="size-3" />
                    {c.departurePort}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Calendar className="size-3" />
                    {formatDate(c.departureDate)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="size-3" />
                    {c.nights} nights
                  </span>
                </div>
              </div>
              <div className="shrink-0">
                {displayPrice ? (
                  <PriceBadge label="from" price={displayPrice} />
                ) : (
                  <div className="text-xs text-gray-400">Contact for pricing</div>
                )}
              </div>
            </div>
          </CardShell>
        );
      })}
      <SectionFooter
        href="/search/cruises"
        label="View Cruises"
        count={d.resultCount ?? cruises.length}
        total={d.totalResults}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flight results
// ---------------------------------------------------------------------------

interface FlightOutput {
  flights?: Array<{
    airline: string;
    flightNumber: string;
    route: string;
    departure: string;
    arrival: string;
    duration: string;
    stops: number;
    price: string;
    cabin: string;
  }>;
  resultCount?: number;
  error?: string;
}

function FlightResults({ data }: { data: unknown }) {
  const d = data as FlightOutput;
  if (d.error) return <ErrorCard message={d.error} />;
  const flights = d.flights ?? [];
  if (flights.length === 0) return <EmptyCard label="flights" />;

  return (
    <div className="mt-2 space-y-2">
      {flights.map((f, i) => (
        <CardShell key={i} href="/search/flights" accentColor="#2563eb">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Plane className="size-3.5 text-gray-400" />
                <span className="text-sm font-semibold text-[#1A1A1A]">
                  {f.route}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {f.airline}
                {f.flightNumber ? ` \u00b7 ${f.flightNumber}` : ""}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
                {f.departure && (
                  <span className="flex items-center gap-0.5">
                    <Calendar className="size-3" />
                    {formatDateTime(f.departure)}
                  </span>
                )}
                {f.duration && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="size-3" />
                    {f.duration}
                  </span>
                )}
                <span>
                  {f.stops === 0 ? "Direct" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`}
                </span>
                {f.cabin && <span className="uppercase">{f.cabin}</span>}
              </div>
            </div>
            <PriceBadge label="per person" price={f.price} />
          </div>
        </CardShell>
      ))}
      <SectionFooter
        href="/search/flights"
        label="View Flights"
        count={d.resultCount ?? flights.length}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hotel results
// ---------------------------------------------------------------------------

interface HotelOutput {
  hotels?: Array<{
    name: string;
    rating: string;
    location: string;
    pricePerNight: string;
    boardBasis: string;
  }>;
  resultCount?: number;
  error?: string;
}

function HotelResults({ data }: { data: unknown }) {
  const d = data as HotelOutput;
  if (d.error) return <ErrorCard message={d.error} />;
  const hotels = d.hotels ?? [];
  if (hotels.length === 0) return <EmptyCard label="hotels" />;

  return (
    <div className="mt-2 space-y-2">
      {hotels.map((h, i) => (
        <CardShell key={i} href="/search/hotels" accentColor="#059669">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Hotel className="size-3.5 text-gray-400" />
                <span className="truncate text-sm font-semibold text-[#1A1A1A]">
                  {h.name}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                {h.rating && <StarRating rating={h.rating} />}
                {h.location && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="size-3" />
                    {h.location}
                  </span>
                )}
              </div>
              {h.boardBasis && (
                <div className="mt-0.5 text-[11px] text-gray-400">
                  {h.boardBasis}
                </div>
              )}
            </div>
            <PriceBadge label="per night" price={h.pricePerNight} />
          </div>
        </CardShell>
      ))}
      <SectionFooter
        href="/search/hotels"
        label="View Hotels"
        count={d.resultCount ?? hotels.length}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tour results
// ---------------------------------------------------------------------------

interface TourOutput {
  tours?: Array<{
    name: string;
    operator: string;
    duration: string;
    description: string;
    priceFrom: string;
  }>;
  resultCount?: number;
  totalAvailable?: number;
  error?: string;
}

function TourResults({ data }: { data: unknown }) {
  const d = data as TourOutput;
  if (d.error) return <ErrorCard message={d.error} />;
  const tours = d.tours ?? [];
  if (tours.length === 0) return <EmptyCard label="tours" />;

  return (
    <div className="mt-2 space-y-2">
      {tours.map((t, i) => (
        <CardShell key={i} href="/search/tours" accentColor="#7c3aed">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[#1A1A1A]">
                {t.name}
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {t.operator}
                {t.duration ? ` \u00b7 ${t.duration}` : ""}
              </div>
              {t.description && (
                <div className="mt-0.5 line-clamp-2 text-[11px] text-gray-400">
                  {t.description}
                </div>
              )}
            </div>
            <PriceBadge label="from" price={t.priceFrom} />
          </div>
        </CardShell>
      ))}
      <SectionFooter
        href="/search/tours"
        label="View Tours"
        count={d.resultCount ?? tours.length}
        total={d.totalAvailable}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function StarRating({ rating }: { rating: string }) {
  // rating is like "5 star" or "4.2/5 rated" or "unrated"
  const starMatch = rating.match(/^(\d+)\s*star/);
  if (starMatch) {
    const count = Math.min(parseInt(starMatch[1] ?? "0", 10), 5);
    return (
      <span className="flex items-center gap-0.5">
        {Array.from({ length: count }).map((_, i) => (
          <Star
            key={i}
            className="size-3 fill-[#C59746] text-[#C59746]"
          />
        ))}
      </span>
    );
  }
  if (rating !== "unrated") {
    return <span className="text-[11px] text-gray-400">{rating}</span>;
  }
  return null;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
      {message}
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
      No {label} found matching your criteria. Try adjusting your search.
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateTimeStr: string): string {
  try {
    const d = new Date(dateTimeStr);
    return d.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    }) +
      " " +
      d.toLocaleTimeString("en-CA", {
        hour: "numeric",
        minute: "2-digit",
      });
  } catch {
    return dateTimeStr;
  }
}
