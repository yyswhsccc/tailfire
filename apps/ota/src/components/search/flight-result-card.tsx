import { Plane, Clock, ArrowRight } from "lucide-react";

import { formatPrice } from "@/lib/format";

// Matches Amadeus flight offer DTO shape returned by the OTA search facade
export interface FlightOffer {
  id: string;
  airline: {
    code: string;
    name: string;
  };
  price: {
    total: number; // cents
    currency: string;
    perTraveler: number; // cents
  };
  itineraries: FlightItinerary[];
  travelClass: string;
  numberOfBookableSeats?: number;
}

export interface FlightItinerary {
  duration: string; // e.g. "PT7H30M"
  segments: FlightSegment[];
}

export interface FlightSegment {
  departure: { iataCode: string; at: string };
  arrival: { iataCode: string; at: string };
  carrierCode: string;
  flightNumber: string;
  numberOfStops: number;
}

interface FlightResultCardProps {
  offer: FlightOffer;
}

/**
 * Simple palette for airline header gradients — keyed on first char of airline code.
 */
const AIRLINE_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  a: { from: "from-blue-900", to: "to-blue-800", accent: "text-blue-300" },
  b: { from: "from-slate-900", to: "to-slate-800", accent: "text-slate-300" },
  c: { from: "from-indigo-900", to: "to-indigo-800", accent: "text-indigo-300" },
  d: { from: "from-gray-900", to: "to-gray-800", accent: "text-gray-300" },
  e: { from: "from-emerald-900", to: "to-emerald-800", accent: "text-emerald-300" },
  f: { from: "from-violet-900", to: "to-violet-800", accent: "text-violet-300" },
  g: { from: "from-teal-900", to: "to-teal-800", accent: "text-teal-300" },
  h: { from: "from-cyan-900", to: "to-cyan-800", accent: "text-cyan-300" },
  j: { from: "from-sky-900", to: "to-sky-800", accent: "text-sky-300" },
  k: { from: "from-amber-900", to: "to-amber-800", accent: "text-amber-300" },
  l: { from: "from-rose-900", to: "to-rose-800", accent: "text-rose-300" },
  m: { from: "from-red-900", to: "to-red-800", accent: "text-red-300" },
  q: { from: "from-purple-900", to: "to-purple-800", accent: "text-purple-300" },
  w: { from: "from-fuchsia-900", to: "to-fuchsia-800", accent: "text-fuchsia-300" },
};

const DEFAULT_COLORS = { from: "from-[#1A1A1A]", to: "to-[#2A2A2A]", accent: "text-[#C59746]" };

function getAirlineColors(code: string) {
  const key = code.charAt(0).toLowerCase();
  return AIRLINE_COLORS[key] ?? DEFAULT_COLORS;
}

/**
 * Parses ISO 8601 duration (PT7H30M) to human-readable "7h 30m".
 */
function formatDuration(duration: string): string {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return duration;
  const hours = match[1] ? `${match[1]}h` : "";
  const mins = match[2] ? `${match[2]}m` : "";
  return [hours, mins].filter(Boolean).join(" ") || duration;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getStopsLabel(itinerary: FlightItinerary): string {
  const totalStops = itinerary.segments.length - 1;
  if (totalStops === 0) return "Nonstop";
  if (totalStops === 1) return "1 stop";
  return `${totalStops} stops`;
}

function formatClassLabel(travelClass: string): string {
  return travelClass
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function FlightResultCard({ offer }: FlightResultCardProps) {
  const colors = getAirlineColors(offer.airline.code);
  const outbound = offer.itineraries[0];
  const inbound = offer.itineraries[1];

  const firstSegmentOut = outbound?.segments[0];
  const lastSegmentOut = outbound?.segments[outbound.segments.length - 1];
  const firstSegmentIn = inbound?.segments[0];
  const lastSegmentIn = inbound?.segments[inbound.segments.length - 1];

  const originCode = firstSegmentOut?.departure.iataCode ?? "";
  const destinationCode = lastSegmentOut?.arrival.iataCode ?? "";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Dark gradient header */}
      <div className={`bg-gradient-to-r ${colors.from} ${colors.to} px-5 py-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Airline name */}
            <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${colors.accent}`}>
              {offer.airline.name || offer.airline.code}
            </p>
            {/* Route */}
            <div className="mt-1 flex items-center gap-2">
              <h3 className="text-base font-semibold text-white sm:text-lg">
                {originCode}
              </h3>
              <ArrowRight className="size-4 shrink-0 text-white/60" />
              <h3 className="text-base font-semibold text-white sm:text-lg">
                {destinationCode}
              </h3>
            </div>
            {/* Class */}
            <p className="mt-1 text-xs text-white/60">{formatClassLabel(offer.travelClass)}</p>
          </div>

          {/* Price */}
          <div className="shrink-0 text-right">
            <p className="text-xl font-bold text-white sm:text-2xl">
              {formatPrice(offer.price.total, offer.price.currency)}
            </p>
            <p className="text-[10px] text-white/60">/person</p>
          </div>
        </div>
      </div>

      {/* White body */}
      <div className="px-5 py-4">
        <div className="space-y-3">
          {/* Outbound leg */}
          {outbound && firstSegmentOut && lastSegmentOut && (
            <ItineraryRow
              label={inbound ? "Outbound" : undefined}
              departure={firstSegmentOut.departure.iataCode}
              arrival={lastSegmentOut.arrival.iataCode}
              departureTime={formatTime(firstSegmentOut.departure.at)}
              arrivalTime={formatTime(lastSegmentOut.arrival.at)}
              duration={formatDuration(outbound.duration)}
              stops={getStopsLabel(outbound)}
            />
          )}

          {/* Return leg */}
          {inbound && firstSegmentIn && lastSegmentIn && (
            <ItineraryRow
              label="Return"
              departure={firstSegmentIn.departure.iataCode}
              arrival={lastSegmentIn.arrival.iataCode}
              departureTime={formatTime(firstSegmentIn.departure.at)}
              arrivalTime={formatTime(lastSegmentIn.arrival.at)}
              duration={formatDuration(inbound.duration)}
              stops={getStopsLabel(inbound)}
            />
          )}
        </div>

        {/* CTA row */}
        <div className="mt-4 flex items-center justify-between gap-3">
          {offer.numberOfBookableSeats != null && offer.numberOfBookableSeats <= 5 && (
            <p className="text-xs font-medium text-amber-600">
              Only {offer.numberOfBookableSeats} seat{offer.numberOfBookableSeats === 1 ? "" : "s"} left
            </p>
          )}
          <div className="ml-auto">
            <a
              href="/contact"
              className="inline-flex h-9 items-center rounded-lg bg-[#C59746] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
            >
              Inquire
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENT: itinerary row
// ============================================================================

function ItineraryRow({
  label,
  departure,
  arrival,
  departureTime,
  arrivalTime,
  duration,
  stops,
}: {
  label?: string;
  departure: string;
  arrival: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
      {label && (
        <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]">
          {label}
        </span>
      )}
      <span className="font-semibold text-[#1A1A1A]">{departureTime}</span>
      <span className="text-xs">{departure}</span>
      <span className="inline-flex items-center gap-1">
        <span className="h-px w-8 bg-border" />
        <Plane className="size-3 -rotate-12 text-muted-foreground/60" />
        <span className="h-px w-8 bg-border" />
      </span>
      <span className="font-semibold text-[#1A1A1A]">{arrivalTime}</span>
      <span className="text-xs">{arrival}</span>
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3" />
        {duration}
      </span>
      <span className={stops === "Nonstop" ? "font-medium text-emerald-600" : ""}>{stops}</span>
    </div>
  );
}
