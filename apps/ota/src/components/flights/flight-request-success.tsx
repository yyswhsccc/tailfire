"use client";

import { useRouter } from "next/navigation";
import { CheckCircle, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFlightSearch } from "./flight-search-store";
import { openChat } from "@/components/chat/chat-widget";

// ---------------------------------------------------------------------------
// FlightRequestSuccess — confirmation screen after lead submission
// ---------------------------------------------------------------------------

export function FlightRequestSuccess() {
  const router = useRouter();
  const origin = useFlightSearch((s) => s.origin);
  const destination = useFlightSearch((s) => s.destination);
  const reset = useFlightSearch((s) => s.reset);

  return (
    <div className="mx-auto max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
      <CheckCircle className="mx-auto size-12 text-emerald-500" />

      <h2 className="mt-4 text-xl font-semibold text-gray-900">
        Flight Request Submitted
      </h2>

      <p className="mt-2 text-sm text-gray-600">
        We&apos;ve received your flight request for{" "}
        <span className="font-medium">{origin}</span> &rarr;{" "}
        <span className="font-medium">{destination}</span>. An advisor will
        confirm your booking and reach out within 2 hours.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button
          variant="outline"
          onClick={() => {
            reset();
            router.push("/search/flights");
          }}
        >
          Search Another Flight
        </Button>

        <Button
          className="bg-[#C59746] text-white hover:bg-[#b38839]"
          onClick={() => openChat("I just submitted a flight request and have a question.")}
        >
          <MessageCircle className="size-4" />
          Talk to AI Concierge
        </Button>
      </div>
    </div>
  );
}
