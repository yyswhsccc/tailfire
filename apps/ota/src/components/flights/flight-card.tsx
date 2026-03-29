"use client";

import { useEffect, useRef } from "react";
import { Plane, Luggage, ArrowRight } from "lucide-react";

import {
  useFlightSearch,
  type FlightOffer,
  type PriceMetrics,
  type DelayPrediction,
} from "./flight-search-store";
import { formatPrice, countStops, parseDuration, formatDuration, formatIsoDuration } from "@/lib/flight-utils";
import { serviceFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Airline color map
// ---------------------------------------------------------------------------

const AIRLINE_COLORS: Record<string, string> = {
  A: "#003366",
  B: "#1a5276",
  C: "#2c3e50",
  D: "#1b4f72",
  E: "#145a32",
  F: "#4a235a",
  J: "#283747",
  K: "#1c2833",
  L: "#0e6655",
  N: "#784212",
  Q: "#6c3483",
  R: "#922b21",
  S: "#1a5276",
  U: "#0b5345",
  W: "#186a3b",
};

const DEFAULT_AIRLINE_COLOR = "#1A1A1A";

function getAirlineColor(code: string): string {
  const firstLetter = code.charAt(0).toUpperCase();
  return AIRLINE_COLORS[firstLetter] ?? DEFAULT_AIRLINE_COLOR;
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Price indicator
// ---------------------------------------------------------------------------

function getPriceIndicator(
  price: number,
  metrics: PriceMetrics | null,
): { label: string; className: string } | null {
  if (!metrics) return null;
  if (price <= metrics.firstQuartile) {
    return { label: "Low price", className: "bg-emerald-100 text-emerald-800" };
  }
  if (price <= metrics.thirdQuartile) {
    return { label: "Typical", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "High price", className: "bg-red-100 text-red-800" };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FlightCardProps {
  offer: FlightOffer;
  onSelect?: (offer: FlightOffer) => void;
  isUpsell?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlightCard({ offer, onSelect, isUpsell }: FlightCardProps) {
  const priceMetrics = useFlightSearch((s) => s.priceMetrics);
  const delayPredictions = useFlightSearch((s) => s.delayPredictions);
  const setDelayPredictions = useFlightSearch((s) => s.setDelayPredictions);
  const fetchedRef = useRef(false);

  // First segment for display
  const firstSeg = offer.segments[0];
  const lastSeg = offer.segments[offer.segments.length - 1];
  if (!firstSeg || !lastSeg) return null;

  const carrier = firstSeg.carrier;
  const flightNumber = firstSeg.flightNumber;
  const flightKey = `${carrier}${flightNumber}`;
  const stops = countStops(offer.segments);

  // Total duration across all segments
  const totalDuration = offer.segments.reduce((acc, s) => acc + parseDuration(s.duration), 0);
  const durationLabel = totalDuration > 0 ? formatDuration(totalDuration) : formatIsoDuration(firstSeg.duration);

  // Delay prediction
  const prediction: DelayPrediction | undefined = delayPredictions.get(flightKey);

  // Lazy-fetch delay prediction on mount
  useEffect(() => {
    if (fetchedRef.current) return;
    if (delayPredictions.has(flightKey)) return;
    if (!firstSeg.aircraft) return;

    fetchedRef.current = true;

    const depDate = firstSeg.departure.at.split("T")[0];
    const depTime = firstSeg.departure.at.split("T")[1]?.substring(0, 5) ?? "";
    const arrDate = lastSeg.arrival.at.split("T")[0];
    const arrTime = lastSeg.arrival.at.split("T")[1]?.substring(0, 5) ?? "";

    const params = new URLSearchParams({
      carrierCode: carrier,
      flightNumber,
      departureDate: depDate ?? "",
      departureTime: depTime,
      arrivalDate: arrDate ?? "",
      arrivalTime: arrTime,
      aircraftCode: firstSeg.aircraft ?? "",
      originLocationCode: firstSeg.departure.iataCode,
      destinationLocationCode: lastSeg.arrival.iataCode,
      duration: firstSeg.duration,
    });

    serviceFetch<{ prediction: DelayPrediction | null }>(
      `/ota/search/flight-delay?${params.toString()}`,
    )
      .then((data) => {
        if (data.prediction) {
          const updated = new Map(useFlightSearch.getState().delayPredictions);
          updated.set(flightKey, data.prediction);
          setDelayPredictions(updated);
        }
      })
      .catch(() => {
        // Silently ignore — delay prediction is optional enrichment
      });
  }, [flightKey, carrier, flightNumber, firstSeg, lastSeg, delayPredictions, setDelayPredictions]);

  // Price info
  const priceNum = parseFloat(offer.price.perTraveler);
  const priceIndicator = getPriceIndicator(priceNum, priceMetrics);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(offer)}
      className={cn(
        "group flex w-full items-stretch rounded-xl border text-left transition-all",
        "hover:shadow-md hover:border-primary/40",
        isUpsell
          ? "border-[#C59746] bg-[#C59746]/5"
          : "border-border bg-card",
      )}
    >
      {/* Zone 1 — Airline Badge */}
      <div
        className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-l-xl px-2 py-4"
        style={{ backgroundColor: getAirlineColor(carrier) }}
      >
        <span className="text-sm font-bold text-white">{carrier}</span>
        <Plane className="h-4 w-4 text-white/80" />
      </div>

      {/* Zone 2 — Flight Details */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-4 py-3">
        {/* Times row */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold whitespace-nowrap">
            {formatTime(firstSeg.departure.at)}
          </span>

          {/* Duration bar */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-0">
            <span className="text-[10px] text-muted-foreground">{durationLabel}</span>
            <div className="relative h-px w-full bg-border">
              <div className="absolute -right-0.5 -top-[3px] h-[7px] w-[7px] rounded-full border border-border bg-background" />
            </div>
          </div>

          <span className="text-lg font-bold whitespace-nowrap">
            {formatTime(lastSeg.arrival.at)}
          </span>
        </div>

        {/* Route row */}
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {firstSeg.departure.iataCode}
          </span>
          <ArrowRight className="h-3 w-3" />
          <span className="font-medium text-foreground">
            {lastSeg.arrival.iataCode}
          </span>
          <span className="mx-0.5">·</span>
          {stops === 0 ? (
            <span className="font-medium text-emerald-600">Nonstop</span>
          ) : (
            <span>
              {stops} stop{stops > 1 ? "s" : ""}
            </span>
          )}
          <span className="mx-0.5">·</span>
          <span>
            {firstSeg.carrierName ?? carrier} {flightNumber}
          </span>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1">
          {offer.fareFamily && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {offer.fareFamily}
            </span>
          )}

          <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px]">
            <Luggage className="h-3 w-3" />
            {offer.baggageAllowance?.checked
              ? `${offer.baggageAllowance.checked.quantity} bag${offer.baggageAllowance.checked.quantity > 1 ? "s" : ""}`
              : "1 bag"}
          </span>

          {prediction && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                prediction.onTimePercentage >= 80
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800",
              )}
            >
              {prediction.onTimePercentage >= 80
                ? `${prediction.onTimePercentage}% on time`
                : "Often delayed"}
            </span>
          )}

          {isUpsell && (
            <span className="rounded bg-[#C59746]/20 px-1.5 py-0.5 text-[10px] font-medium text-[#C59746]">
              Premium
            </span>
          )}
        </div>
      </div>

      {/* Zone 3 — Price */}
      <div className="flex w-28 shrink-0 flex-col items-end justify-center gap-1 px-4 py-3">
        <span className="text-lg font-bold">
          {formatPrice(offer.price.perTraveler, offer.price.currency)}
        </span>
        <span className="text-[10px] text-muted-foreground">per person</span>
        {priceIndicator && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium",
              priceIndicator.className,
            )}
          >
            {priceIndicator.label}
          </span>
        )}
      </div>
    </button>
  );
}
