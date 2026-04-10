"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CruiseProductCard } from "@/components/cards/cruise-product-card";
import { FlightProductCard } from "@/components/cards/flight-product-card";
import { HotelProductCard } from "@/components/cards/hotel-product-card";
import { TourProductCard } from "@/components/cards/tour-product-card";

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
// Shared footer
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Price parser — converts "$1,234" or "CAD 1234" or "1234" to cents
// ---------------------------------------------------------------------------

function parsePriceToCents(price: string | null | undefined): number | null {
  if (!price) return null;
  // Strip currency symbols, letters, spaces, commas — keep digits and dot
  const cleaned = price.replace(/[^0-9.]/g, "");
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return null;
  // If price string looks like it's already in dollars (no cents part or small value)
  return Math.round(parsed * 100);
}

// ---------------------------------------------------------------------------
// Cruise results
// ---------------------------------------------------------------------------

interface CruiseOutput {
  cruises?: Array<{
    id: string;
    cruiseLine: string;
    ship: string;
    shipImage?: string | null;
    departurePort: string;
    itinerary: string;
    departureDate: string;
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
        const rawPrice = c.insidePrice ?? c.balconyPrice ?? c.suitePrice ?? null;
        const priceCents = parsePriceToCents(rawPrice);
        return (
          <CruiseProductCard
            key={i}
            variant="compact"
            id={c.id || `chat-cruise-${i}`}
            name={c.itinerary || `${c.nights}-Night Cruise`}
            shipName={c.ship}
            shipImageUrl={c.shipImage ?? null}
            cruiseLineName={c.cruiseLine}
            sailDate={c.departureDate}
            nights={c.nights}
            route={`From ${c.departurePort}`}
            priceCents={priceCents}
          />
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

/**
 * Parse a route string like "YOW → CZM" or "YOW - CZM" into [origin, destination].
 */
function parseRoute(route: string): [string, string] {
  const parts = route.split(/\s*[→\-–]\s*/);
  return [parts[0]?.trim() ?? "???", parts[1]?.trim() ?? "???"];
}

/**
 * Extract HH:mm from an ISO datetime string or a plain time string.
 */
function extractTime(dateTimeStr: string): string {
  if (!dateTimeStr) return "00:00";
  // ISO: "2026-06-01T08:30:00"
  const isoMatch = dateTimeStr.match(/T(\d{2}:\d{2})/);
  if (isoMatch) return isoMatch[1]!;
  // Plain time like "08:30" or "08:30 AM"
  const timeMatch = dateTimeStr.match(/(\d{1,2}:\d{2})/);
  if (timeMatch) return timeMatch[1]!.padStart(5, "0");
  return "00:00";
}

function FlightResults({ data }: { data: unknown }) {
  const d = data as FlightOutput;
  if (d.error) return <ErrorCard message={d.error} />;
  const flights = d.flights ?? [];
  if (flights.length === 0) return <EmptyCard label="flights" />;

  return (
    <div className="mt-2 space-y-2">
      {flights.map((f, i) => {
        const [origin, destination] = parseRoute(f.route);
        const depTime = extractTime(f.departure);
        const arrTime = extractTime(f.arrival);
        const priceCents = parsePriceToCents(f.price);

        return (
          <FlightProductCard
            key={i}
            variant="compact"
            id={`chat-flight-${i}`}
            airline={f.airline}
            totalDuration={f.duration}
            stops={f.stops ?? 0}
            cabinClass={f.cabin || undefined}
            priceCents={priceCents}
            segments={[
              {
                departureAirport: origin,
                arrivalAirport: destination,
                departureTime: depTime,
                arrivalTime: arrTime,
                duration: f.duration,
                airline: f.airline,
                flightNumber: f.flightNumber || undefined,
              },
            ]}
          />
        );
      })}
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

/**
 * Parse a rating string like "5 star", "4.5/5 rated" into a numeric star count.
 */
function parseStarRating(rating: string): number | undefined {
  const starMatch = rating.match(/^(\d+(?:\.\d+)?)\s*star/i);
  if (starMatch) return Math.min(Math.round(parseFloat(starMatch[1] ?? "0")), 5);
  return undefined;
}

function HotelResults({ data }: { data: unknown }) {
  const d = data as HotelOutput;
  if (d.error) return <ErrorCard message={d.error} />;
  const hotels = d.hotels ?? [];
  if (hotels.length === 0) return <EmptyCard label="hotels" />;

  return (
    <div className="mt-2 space-y-2">
      {hotels.map((h, i) => {
        const priceCents = parsePriceToCents(h.pricePerNight);
        const starRating = parseStarRating(h.rating);

        return (
          <HotelProductCard
            key={i}
            variant="compact"
            id={`chat-hotel-${i}`}
            name={h.name}
            imageUrl={null}
            starRating={starRating}
            location={h.location || undefined}
            boardType={h.boardBasis || undefined}
            priceCents={priceCents}
          />
        );
      })}
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
    imageUrl?: string | null;
    priceFrom: string;
  }>;
  resultCount?: number;
  totalAvailable?: number;
  error?: string;
}

/**
 * Parse a duration string like "7 days", "10D", "2 weeks" into a number of days.
 */
function parseDurationDays(duration: string): number {
  if (!duration) return 1;
  const dayMatch = duration.match(/(\d+)\s*(?:day|d)/i);
  if (dayMatch) return parseInt(dayMatch[1] ?? "1", 10);
  const weekMatch = duration.match(/(\d+)\s*week/i);
  if (weekMatch) return parseInt(weekMatch[1] ?? "1", 10) * 7;
  const numMatch = duration.match(/(\d+)/);
  if (numMatch) return parseInt(numMatch[1] ?? "1", 10);
  return 1;
}

function TourResults({ data }: { data: unknown }) {
  const d = data as TourOutput;
  if (d.error) return <ErrorCard message={d.error} />;
  const tours = d.tours ?? [];
  if (tours.length === 0) return <EmptyCard label="tours" />;

  return (
    <div className="mt-2 space-y-2">
      {tours.map((t, i) => {
        const priceCents = parsePriceToCents(t.priceFrom);
        const durationDays = parseDurationDays(t.duration);

        return (
          <TourProductCard
            key={i}
            variant="compact"
            id={`chat-tour-${i}`}
            name={t.name}
            operatorName={t.operator}
            durationDays={durationDays}
            imageUrl={t.imageUrl ?? null}
            highlights={t.description ? [t.description] : undefined}
            priceCents={priceCents}
          />
        );
      })}
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
