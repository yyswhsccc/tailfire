"use client";

import { Plane, Clock, ArrowRight } from "lucide-react";

import { AddToTripButton } from "@/components/trip-builder/add-to-trip-button";
import type { TripComponent } from "@/components/trip-builder/trip-basket-store";

// Matches NormalizedFlightOffer from packages/shared-types/src/api/flights.types.ts
export interface FlightOffer {
  id: string;
  source: string;
  segments: FlightSegment[];
  price: {
    currency: string;
    total: string; // dollar amount as string e.g. "1234.56"
    perTraveler: string;
    base?: string;
  };
  validatingAirline: string;
  fareClass?: string;
  fareFamily?: string;
  cabin?: string; // ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
  fareRules?: { exchangeable: boolean; refundable: boolean };
  baggageAllowance?: {
    checked?: { quantity: number; weight?: string };
    cabin?: { quantity: number };
  };
}

export interface FlightSegment {
  departure: { iataCode: string; terminal?: string; at: string };
  arrival: { iataCode: string; terminal?: string; at: string };
  carrier: string;
  carrierName?: string;
  flightNumber: string;
  aircraft?: string;
  duration: string; // ISO 8601 e.g. "PT7H30M"
  stops: number;
  cabin?: string;
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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getSegmentStopsLabel(segments: FlightSegment[]): string {
  const totalStops = segments.reduce((sum, s) => sum + s.stops, 0) + (segments.length - 1);
  if (totalStops === 0) return "Nonstop";
  if (totalStops === 1) return "1 stop";
  return `${totalStops} stops`;
}

function formatClassLabel(cabin: string | undefined): string {
  if (!cabin) return "";
  return cabin
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Format a dollar-amount string (e.g. "1234.56") as currency.
 * Falls back to formatPrice(cents) if the value looks like cents.
 */
function formatDollarString(amount: string, currency: string): string {
  const val = parseFloat(amount);
  if (isNaN(val)) return amount;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(val);
}

/**
 * Compute total duration across multiple segments by summing ISO 8601 durations.
 */
function totalDurationMinutes(segments: FlightSegment[]): number {
  let total = 0;
  for (const seg of segments) {
    const match = seg.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (match) {
      total += (parseInt(match[1] ?? "0") * 60) + parseInt(match[2] ?? "0");
    }
  }
  return total;
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ") || "0m";
}

export function FlightResultCard({ offer }: FlightResultCardProps) {
  const airlineCode = offer.segments[0]?.carrier ?? offer.validatingAirline;
  const airlineName = offer.segments[0]?.carrierName ?? offer.validatingAirline;
  const colors = getAirlineColors(airlineCode);

  // All segments are in a flat array. For display, show first -> last as the route.
  const firstSegment = offer.segments[0];
  const lastSegment = offer.segments[offer.segments.length - 1];

  const originCode = firstSegment?.departure.iataCode ?? "";
  const destinationCode = lastSegment?.arrival.iataCode ?? "";
  const totalMins = totalDurationMinutes(offer.segments);

  // Build TripComponent for basket
  const tripComponent: TripComponent = {
    id: offer.id,
    type: "flight",
    data: {
      segments: offer.segments.map((seg) => ({
        departureAt: seg.departure.at,
        arrivalAt: seg.arrival.at,
        airline: seg.carrier,
        flightNumber: seg.flightNumber,
        origin: seg.departure.iataCode,
        destination: seg.arrival.iataCode,
        duration: seg.duration,
        cabin: seg.cabin,
        aircraft: seg.aircraft,
      })),
      price: offer.price,
    },
    display: {
      title: `${originCode} \u2192 ${destinationCode}`,
      subtitle: `${airlineName} ${firstSegment?.flightNumber ?? ""}`.trim(),
      price: formatDollarString(offer.price.perTraveler, offer.price.currency),
    },
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Dark gradient header */}
      <div className={`bg-gradient-to-r ${colors.from} ${colors.to} px-5 py-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Airline name */}
            <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${colors.accent}`}>
              {airlineName}
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
            {offer.cabin && (
              <p className="mt-1 text-xs text-white/60">{formatClassLabel(offer.cabin)}</p>
            )}
          </div>

          {/* Price */}
          <div className="shrink-0 text-right">
            <p className="text-xl font-bold text-white sm:text-2xl">
              {formatDollarString(offer.price.perTraveler, offer.price.currency)}
            </p>
            <p className="text-[10px] text-white/60">/person</p>
          </div>
        </div>
      </div>

      {/* White body */}
      <div className="px-5 py-4">
        <div className="space-y-3">
          {/* Flight segments summary */}
          {firstSegment && lastSegment && (
            <ItineraryRow
              departure={firstSegment.departure.iataCode}
              arrival={lastSegment.arrival.iataCode}
              departureTime={formatTime(firstSegment.departure.at)}
              arrivalTime={formatTime(lastSegment.arrival.at)}
              duration={formatMinutes(totalMins)}
              stops={getSegmentStopsLabel(offer.segments)}
            />
          )}
        </div>

        {/* Extra info row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {offer.fareFamily && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{offer.fareFamily}</span>
          )}
          {offer.fareRules?.refundable && (
            <span className="text-emerald-600 font-medium">Refundable</span>
          )}
          {offer.baggageAllowance?.checked && (
            <span>{offer.baggageAllowance.checked.quantity} checked bag{offer.baggageAllowance.checked.quantity !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* CTA row */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <AddToTripButton component={tripComponent} size="sm" />
          <a
            href="/contact"
            className="inline-flex h-9 items-center rounded-lg bg-[#C59746] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
          >
            Inquire
          </a>
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
