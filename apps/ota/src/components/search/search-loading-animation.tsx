"use client";

import { Plane, Ship, Hotel, Compass } from "lucide-react";

type ProductType = "flights" | "cruises" | "hotels" | "tours";

interface SearchLoadingAnimationProps {
  type: ProductType;
  message?: string;
}

const DEFAULT_MESSAGES: Record<ProductType, string> = {
  flights: "Searching 200+ airlines for the best fares...",
  cruises: "Searching hundreds of sailings worldwide...",
  hotels: "Comparing rates from thousands of properties...",
  tours: "Browsing guided tours and travel packages...",
};

export function SearchLoadingAnimation({ type, message }: SearchLoadingAnimationProps) {
  const displayMessage = message ?? DEFAULT_MESSAGES[type];

  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center py-12">
      <div className="relative mb-8 h-24 w-full max-w-xs overflow-hidden">
        {type === "flights" && <FlightAnimation />}
        {type === "cruises" && <CruiseAnimation />}
        {type === "hotels" && <HotelAnimation />}
        {type === "tours" && <TourAnimation />}
      </div>
      <p className="animate-pulse text-base font-medium text-[#1A1A1A]">
        {displayMessage}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  FLIGHTS — plane flies across with a dotted trail                          */
/* -------------------------------------------------------------------------- */

function FlightAnimation() {
  return (
    <div className="relative flex h-full items-center justify-center">
      {/* Dotted trail */}
      <div className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2">
        <div className="flight-trail h-full w-full" />
      </div>
      {/* Plane icon */}
      <div className="flight-plane relative z-10">
        <Plane className="size-10 fill-[#C59746]/20 text-[#C59746]" />
      </div>

      <style jsx>{`
        .flight-plane {
          animation: fly-across 2.5s ease-in-out infinite;
        }

        .flight-trail {
          background: repeating-linear-gradient(
            to right,
            #C59746 0px,
            #C59746 6px,
            transparent 6px,
            transparent 12px
          );
          animation: trail-expand 2.5s ease-in-out infinite;
          opacity: 0.4;
        }

        @keyframes fly-across {
          0% {
            transform: translateX(-140px) translateY(8px) rotate(-5deg);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          50% {
            transform: translateX(0) translateY(-8px) rotate(0deg);
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translateX(140px) translateY(8px) rotate(5deg);
            opacity: 0;
          }
        }

        @keyframes trail-expand {
          0% {
            clip-path: inset(0 100% 0 0);
          }
          50% {
            clip-path: inset(0 0 0 0);
          }
          100% {
            clip-path: inset(0 0 0 100%);
          }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  CRUISES — ship rocks on gentle waves                                       */
/* -------------------------------------------------------------------------- */

function CruiseAnimation() {
  return (
    <div className="relative flex h-full items-end justify-center pb-2">
      {/* Ship */}
      <div className="cruise-ship relative z-10 mb-3">
        <Ship className="size-10 fill-[#C59746]/20 text-[#C59746]" />
      </div>

      {/* Waves */}
      <div className="absolute bottom-0 left-0 w-full overflow-hidden">
        <div className="cruise-wave-1 flex">
          <svg viewBox="0 0 320 20" className="h-5 w-full text-[#C59746]/20" preserveAspectRatio="none">
            <path
              d="M0 10 Q40 0 80 10 T160 10 T240 10 T320 10 V20 H0 Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="cruise-wave-2 -mt-2 flex">
          <svg viewBox="0 0 320 20" className="h-5 w-full text-[#C59746]/10" preserveAspectRatio="none">
            <path
              d="M0 10 Q40 0 80 10 T160 10 T240 10 T320 10 V20 H0 Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </div>

      <style jsx>{`
        .cruise-ship {
          animation: rock 2s ease-in-out infinite;
        }

        .cruise-wave-1 {
          animation: wave-drift 3s ease-in-out infinite;
        }

        .cruise-wave-2 {
          animation: wave-drift 3s ease-in-out infinite 0.5s;
        }

        @keyframes rock {
          0%,
          100% {
            transform: rotate(-4deg) translateY(0);
          }
          25% {
            transform: rotate(2deg) translateY(-3px);
          }
          50% {
            transform: rotate(-2deg) translateY(1px);
          }
          75% {
            transform: rotate(3deg) translateY(-2px);
          }
        }

        @keyframes wave-drift {
          0%,
          100% {
            transform: translateX(-5px);
          }
          50% {
            transform: translateX(5px);
          }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  HOTELS — building with windows that light up sequentially                  */
/* -------------------------------------------------------------------------- */

function HotelAnimation() {
  return (
    <div className="relative flex h-full items-center justify-center">
      <div className="flex items-end gap-1.5">
        {/* Hotel icon */}
        <div className="hotel-icon relative">
          <Hotel className="size-10 text-[#C59746]" />
        </div>

        {/* Windows grid */}
        <div className="mb-1 grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="hotel-window size-2.5 rounded-sm bg-[#C59746]/15"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      </div>

      <style jsx>{`
        .hotel-icon {
          animation: hotel-pulse 2s ease-in-out infinite;
        }

        .hotel-window {
          animation: window-light 1.8s ease-in-out infinite;
        }

        @keyframes hotel-pulse {
          0%,
          100% {
            opacity: 0.8;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes window-light {
          0%,
          100% {
            background-color: rgba(197, 151, 70, 0.15);
          }
          50% {
            background-color: rgba(197, 151, 70, 0.7);
            box-shadow: 0 0 6px rgba(197, 151, 70, 0.4);
          }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TOURS — compass that spins                                                 */
/* -------------------------------------------------------------------------- */

function TourAnimation() {
  return (
    <div className="relative flex h-full items-center justify-center">
      <div className="tour-compass">
        <Compass className="size-10 text-[#C59746]" />
      </div>

      {/* Subtle ring */}
      <div className="tour-ring absolute size-16 rounded-full border-2 border-dashed border-[#C59746]/20" />

      <style jsx>{`
        .tour-compass {
          animation: compass-spin 3s ease-in-out infinite;
        }

        .tour-ring {
          animation: ring-pulse 3s ease-in-out infinite;
        }

        @keyframes compass-spin {
          0% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(90deg);
          }
          50% {
            transform: rotate(180deg);
          }
          75% {
            transform: rotate(270deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        @keyframes ring-pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.3;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
}
