"use client";

import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useFlightSearch, type FlightOffer } from "./flight-search-store";
import { formatPrice, countStops, formatIsoDuration } from "@/lib/flight-utils";

// ---------------------------------------------------------------------------
// Internal helper — renders one flight segment (outbound or return)
// ---------------------------------------------------------------------------

function ConfirmSegment({
  offer,
  label,
}: {
  offer: FlightOffer;
  label: "DEPARTURE" | "RETURN";
}) {
  const firstSeg = offer.segments[0];
  const lastSeg = offer.segments[offer.segments.length - 1];
  if (!firstSeg || !lastSeg) return null;

  const origin = firstSeg.departure.iataCode;
  const dest = lastSeg.arrival.iataCode;

  const depDate = new Date(firstSeg.departure.at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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

  const stops = countStops(offer.segments);
  const stopsLabel = stops === 0 ? "Nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`;

  const flightNumbers = offer.segments
    .map((s) => `${s.carrier} ${s.flightNumber}`)
    .join(", ");

  const totalDuration = offer.segments.reduce((acc, s) => {
    const match = s.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    const h = parseInt(match?.[1] || "0", 10);
    const m = parseInt(match?.[2] || "0", 10);
    return acc + h * 60 + m;
  }, 0);

  const priceFormatted = formatPrice(offer.price.perTraveler, offer.price.currency);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            {/* Route */}
            <div className="flex items-center gap-2 text-lg font-bold">
              <span>{origin}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span>{dest}</span>
            </div>

            {/* Date + times */}
            <p className="text-sm text-muted-foreground">
              {depDate} · {depTime} – {arrTime}
              {totalDuration > 0 && (
                <span className="ml-1">
                  ({formatIsoDuration(`PT${Math.floor(totalDuration / 60)}H${totalDuration % 60}M`)})
                </span>
              )}
            </p>

            <Separator />

            {/* Flight number + stops */}
            <p className="text-sm text-muted-foreground">
              {flightNumbers} · {stopsLabel}
            </p>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {offer.fareFamily && (
                <Badge variant="secondary">
                  {offer.fareFamily}
                </Badge>
              )}
              {offer.baggageAllowance?.checked && (
                <Badge variant="secondary">
                  {offer.baggageAllowance.checked.quantity} checked bag
                  {offer.baggageAllowance.checked.quantity !== 1 ? "s" : ""}
                </Badge>
              )}
              {stops === 0 && (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                  Nonstop
                </Badge>
              )}
              {offer.fareRules?.refundable && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Refundable
                </Badge>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="text-right shrink-0">
            <p className="text-lg font-bold">{priceFormatted}</p>
            <p className="text-xs text-muted-foreground">per person</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FlightConfirmation() {
  const selectedOutbound = useFlightSearch((s) => s.selectedOutbound);
  const selectedReturn = useFlightSearch((s) => s.selectedReturn);
  const tripType = useFlightSearch((s) => s.tripType);
  const adults = useFlightSearch((s) => s.adults);
  const children = useFlightSearch((s) => s.children);
  const setShowRequestForm = useFlightSearch((s) => s.setShowRequestForm);
  const changeOutbound = useFlightSearch((s) => s.changeOutbound);

  if (!selectedOutbound) return null;

  const travelerCount = adults + children;

  // Grand total: outbound total + return total (price.total is already for all travelers)
  const outboundTotal = parseFloat(selectedOutbound.price.total);
  const returnTotal = selectedReturn ? parseFloat(selectedReturn.price.total) : 0;
  const grandTotal = outboundTotal + returnTotal;
  const currency = selectedOutbound.price.currency;

  return (
    <div className="space-y-4">
      {/* Title */}
      <h2 className="text-xl font-bold">Confirm Your Selection</h2>

      {/* Outbound segment */}
      <ConfirmSegment offer={selectedOutbound} label="DEPARTURE" />

      {/* Return segment (round-trip only) */}
      {tripType === "round-trip" && selectedReturn && (
        <ConfirmSegment offer={selectedReturn} label="RETURN" />
      )}

      {/* Total card */}
      <Card className="border-[#C59746]/30 bg-[#C59746]/5">
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Total for {travelerCount} traveler{travelerCount !== 1 ? "s" : ""}
            </p>
            <p className="text-2xl font-bold">{formatPrice(grandTotal, currency)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={changeOutbound}>
          Start Over
        </Button>
        <Button
          className="bg-[#C59746] text-white hover:bg-[#B08636]"
          onClick={() => setShowRequestForm(true)}
        >
          <Check className="size-4 mr-1.5" data-icon="inline-start" />
          Request This Flight
        </Button>
      </div>
    </div>
  );
}
