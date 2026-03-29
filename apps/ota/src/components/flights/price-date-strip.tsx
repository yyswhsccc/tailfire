"use client";

import { useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatPrice } from "@/lib/flight-utils";
import { useFlightSearch } from "./flight-search-store";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PriceDateStripProps {
  selectedDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PriceDateStrip({
  selectedDate,
  onDateSelect,
}: PriceDateStripProps) {
  const { priceDates, priceDatesLoading } = useFlightSearch();
  const scrollRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => todayYMD(), []);

  // Filter out past dates
  const futureDates = useMemo(
    () => priceDates.filter((pd) => pd.date >= today),
    [priceDates, today],
  );

  // Cheapest 25% threshold
  const cheapThreshold = useMemo(() => {
    const prices = futureDates.map((pd) => pd.price).sort((a, b) => a - b);
    if (prices.length === 0) return 0;
    const idx = Math.max(0, Math.ceil(prices.length * 0.25) - 1);
    return prices[idx] ?? 0;
  }, [futureDates]);

  // -- Scroll handlers ------------------------------------------------------
  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  // -- Bail early if nothing to show ----------------------------------------
  if (priceDatesLoading || futureDates.length === 0) return null;

  return (
    <div className="relative">
      {/* Left chevron */}
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        className="absolute left-0 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur transition-colors hover:bg-white"
        aria-label="Scroll left"
      >
        <ChevronLeft className="size-4 text-muted-foreground" />
      </button>

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scroll-smooth px-8 py-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {futureDates.map((pd) => {
          const d = new Date(pd.date + "T00:00:00");
          const dayName = SHORT_DAYS[d.getDay()];
          const dayNum = d.getDate();
          const monthName = SHORT_MONTHS[d.getMonth()];

          const isSelected = pd.date === selectedDate;
          const isCheap = pd.price <= cheapThreshold;

          let pillClass =
            "border border-border bg-white text-foreground hover:bg-muted";
          if (isSelected) {
            pillClass = "bg-[#C59746] text-white border border-[#C59746]";
          } else if (isCheap) {
            pillClass =
              "bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100";
          }

          return (
            <button
              key={pd.date}
              type="button"
              onClick={() => onDateSelect(pd.date)}
              className={`flex shrink-0 snap-start flex-col items-center rounded-xl px-3 py-2 transition-colors ${pillClass}`}
            >
              <span className="text-[10px] font-medium leading-tight opacity-70">
                {dayName}
              </span>
              <span className="text-sm font-semibold leading-tight">
                {dayNum}
              </span>
              <span className="text-[10px] leading-tight opacity-70">
                {monthName}
              </span>
              <span
                className={`mt-0.5 text-[10px] font-medium leading-tight ${isSelected ? "text-white/80" : "text-muted-foreground"}`}
              >
                {formatPrice(pd.price, pd.currency)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right chevron */}
      <button
        type="button"
        onClick={() => scrollBy(1)}
        className="absolute right-0 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur transition-colors hover:bg-white"
        aria-label="Scroll right"
      >
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>
    </div>
  );
}
