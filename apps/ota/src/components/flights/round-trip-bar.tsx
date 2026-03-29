"use client";

import { ArrowRight } from "lucide-react";
import { useFlightSearch } from "./flight-search-store";
import { formatPrice, countStops } from "@/lib/flight-utils";

export function RoundTripBar() {
  const selectedOutbound = useFlightSearch((s) => s.selectedOutbound);
  const changeOutbound = useFlightSearch((s) => s.changeOutbound);

  if (!selectedOutbound) return null;

  const firstSeg = selectedOutbound.segments[0];
  const lastSeg = selectedOutbound.segments[selectedOutbound.segments.length - 1];
  if (!firstSeg || !lastSeg) return null;

  const origin = firstSeg.departure.iataCode;
  const dest = lastSeg.arrival.iataCode;
  const carrier = firstSeg.carrier;

  const depTime = new Date(firstSeg.departure.at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const arrTime = new Date(lastSeg.arrival.at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const stops = countStops(selectedOutbound.segments);
  const stopsLabel = stops === 0 ? "Nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`;
  const priceLabel = formatPrice(
    selectedOutbound.price.perTraveler,
    selectedOutbound.price.currency,
  );

  return (
    <div className="rounded-xl border border-[#C59746]/30 bg-[#C59746]/5 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Airline badge */}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1A1A1A] text-white text-xs font-bold">
          {carrier}
        </div>

        <div className="flex flex-col gap-0.5">
          {/* Route + times */}
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span>{origin}</span>
            <ArrowRight className="size-3.5 text-muted-foreground" />
            <span>{dest}</span>
            <span className="text-muted-foreground font-normal">
              {depTime} – {arrTime}
            </span>
          </div>

          {/* Subtitle */}
          <p className="text-xs text-muted-foreground">
            {stopsLabel} · {priceLabel}/person
          </p>
        </div>
      </div>

      {/* Change button */}
      <button
        type="button"
        onClick={changeOutbound}
        className="text-sm font-medium text-[#C59746] hover:underline"
      >
        Change
      </button>
    </div>
  );
}
