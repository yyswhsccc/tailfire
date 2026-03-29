"use client";

import { useState, type FormEvent } from "react";
import { Loader2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
/** Client-safe fetch via Next.js proxy routes */
async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<T>;
}
import { countStops } from "@/lib/flight-utils";
import { useFlightSearch, type FlightOffer } from "./flight-search-store";
import { FlightRequestSuccess } from "./flight-request-success";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract HH:MM:SS from an ISO datetime string (segment `.at` field). */
function toTimeString(isoDatetime: string): string {
  const d = new Date(isoDatetime);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** Build outbound / return leg payload from a FlightOffer. */
function buildLegPayload(offer: FlightOffer, travelClass: string) {
  const firstSeg = offer.segments[0]!;
  const lastSeg = offer.segments[offer.segments.length - 1]!;

  return {
    airline: offer.validatingAirline,
    flightNumber: firstSeg.flightNumber,
    origin: firstSeg.departure.iataCode,
    destination: lastSeg.arrival.iataCode,
    departureTime: toTimeString(firstSeg.departure.at),
    arrivalTime: toTimeString(lastSeg.arrival.at),
    duration: firstSeg.duration,
    stops: countStops(offer.segments),
    fareClass: offer.fareFamily ?? offer.cabin ?? travelClass,
    price: parseFloat(offer.price.perTraveler),
    currency: offer.price.currency,
  };
}

// ---------------------------------------------------------------------------
// FlightRequestForm
// ---------------------------------------------------------------------------

export function FlightRequestForm() {
  const selectedOutbound = useFlightSearch((s) => s.selectedOutbound);
  const selectedReturn = useFlightSearch((s) => s.selectedReturn);
  const tripType = useFlightSearch((s) => s.tripType);
  const adults = useFlightSearch((s) => s.adults);
  const children = useFlightSearch((s) => s.children);
  const travelClass = useFlightSearch((s) => s.travelClass);
  const setShowRequestForm = useFlightSearch((s) => s.setShowRequestForm);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // -- Success screen -------------------------------------------------------
  if (success) {
    return <FlightRequestSuccess />;
  }

  // -- Submit handler -------------------------------------------------------
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const name = (formData.get("name") as string).trim();
    const email = (formData.get("email") as string).trim();
    const phone = (formData.get("phone") as string).trim();
    const specialRequests = (formData.get("specialRequests") as string).trim();

    if (!name || !email || !phone) {
      setError("Please fill in all required fields.");
      return;
    }

    if (!selectedOutbound) {
      setError("No outbound flight selected.");
      return;
    }

    const body: Record<string, unknown> = {
      name,
      email,
      phone,
      travelers: adults + children,
      travelClass,
      outboundFlight: buildLegPayload(selectedOutbound, travelClass),
      amadeusOfferId: selectedOutbound.id,
    };

    if (specialRequests) {
      body.specialRequests = specialRequests;
    }

    if (tripType === "round-trip" && selectedReturn) {
      body.returnFlight = buildLegPayload(selectedReturn, travelClass);
    }

    setSubmitting(true);
    try {
      await clientFetch("/api/flights/request", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  // -- Render ---------------------------------------------------------------
  return (
    <div className="mx-auto max-w-lg">
      <button
        type="button"
        onClick={() => setShowRequestForm(false)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="size-4" />
        Back to confirmation
      </button>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">
          Request This Flight
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          An advisor will confirm your booking within 2 hours.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="flight-req-name">Full Name</Label>
            <Input
              id="flight-req-name"
              name="name"
              required
              placeholder="Jane Doe"
              autoComplete="name"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="flight-req-email">Email</Label>
            <Input
              id="flight-req-email"
              name="email"
              type="email"
              required
              placeholder="jane@example.com"
              autoComplete="email"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="flight-req-phone">Phone</Label>
            <Input
              id="flight-req-phone"
              name="phone"
              type="tel"
              required
              placeholder="+1 (555) 123-4567"
              autoComplete="tel"
            />
          </div>

          {/* Special Requests */}
          <div className="space-y-1.5">
            <Label htmlFor="flight-req-special">
              Special Requests{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="flight-req-special"
              name="specialRequests"
              placeholder="Wheelchair assistance, extra bags, seating preferences..."
              rows={3}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#C59746] text-white hover:bg-[#b38839]"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Flight Request"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
