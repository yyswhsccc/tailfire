import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types for the incoming payload from flight-request-form.tsx
// ---------------------------------------------------------------------------

interface FlightLeg {
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string; // HH:MM:SS (extracted from ISO by the form)
  arrivalTime: string; // HH:MM:SS
  duration: string;
  stops: number;
  fareClass: string;
  price: number;
  currency: string;
}

interface FlightRequestBody {
  name: string;
  email: string;
  phone: string;
  outboundFlight: FlightLeg;
  returnFlight?: FlightLeg;
  travelers: number;
  travelClass: string;
  specialRequests?: string;
  amadeusOfferId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a trip-request component from a flight leg. */
function buildFlightComponent(
  leg: FlightLeg,
  travelClass: string,
  amadeusOfferId?: string,
) {
  return {
    id: crypto.randomUUID(),
    type: "flight" as const,
    data: {
      segments: [
        {
          airline: leg.airline,
          airlineName: leg.airline,
          flightNumber: leg.flightNumber,
          origin: leg.origin,
          destination: leg.destination,
          departureTime: leg.departureTime,
          arrivalTime: leg.arrivalTime,
          duration: leg.duration,
          stops: leg.stops,
          cabin: travelClass || "ECONOMY",
        },
      ],
      price: {
        total: leg.price,
        perTraveler: leg.price,
        currency: leg.currency || "CAD",
      },
      fareFamily: leg.fareClass,
      ...(amadeusOfferId ? { amadeusOfferId } : {}),
    },
    display: {
      title: `${leg.origin} \u2192 ${leg.destination}`,
      subtitle: `${leg.airline} ${leg.flightNumber}`,
      price: `$${Math.round(leg.price)}`,
    },
  };
}

// ---------------------------------------------------------------------------
// POST handler — create trip request + submit
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const body: FlightRequestBody = await request.json();

    const {
      name,
      email,
      phone,
      outboundFlight,
      returnFlight,
      travelers,
      travelClass,
      specialRequests,
      amadeusOfferId,
    } = body;

    // -- Build flight components -------------------------------------------
    const components = [
      buildFlightComponent(outboundFlight, travelClass, amadeusOfferId),
    ];

    if (returnFlight) {
      components.push(buildFlightComponent(returnFlight, travelClass));
    }

    // -- Build trip title --------------------------------------------------
    const title = returnFlight
      ? `${outboundFlight.origin} \u2194 ${outboundFlight.destination}`
      : `${outboundFlight.origin} \u2192 ${outboundFlight.destination}`;

    // -- Step 1: Create draft trip request ---------------------------------
    const createPayload = {
      name,
      email,
      phone,
      travelers,
      title,
      source: "ota",
      components,
      ...(specialRequests ? { specialRequests } : {}),
    };

    const createResult = await serviceFetch<{ requestId: string }>(
      "/ota/trip-requests",
      {
        method: "POST",
        body: JSON.stringify(createPayload),
      },
    );

    const { requestId } = createResult;

    // -- Step 2: Submit and promote ----------------------------------------
    const submitResult = await serviceFetch<{
      requestId: string;
      tripId?: string;
      message: string;
    }>(`/ota/trip-requests/${requestId}/submit`, {
      method: "POST",
    });

    return NextResponse.json({
      success: true,
      requestId: submitResult.requestId,
      tripId: submitResult.tripId,
      message: submitResult.message,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to submit flight request";
    console.warn('[api/flights/request] Trip request pipeline failed:', message);
    return NextResponse.json(
      { success: false, message: "Failed to submit flight request" },
      { status: 502 },
    );
  }
}
