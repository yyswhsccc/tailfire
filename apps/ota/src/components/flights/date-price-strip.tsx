"use client";

import { useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatPrice } from "@/lib/flight-utils";
import { useFlightSearch, type PriceDate } from "./flight-search-store";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DatePriceStripProps {
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

/** Generate 7 dates centered on the given date (3 before, center, 3 after). */
function generateDateRange(centerDateStr: string): string[] {
  const center = new Date(centerDateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(center);
    d.setDate(d.getDate() + offset);
    if (d < today) continue;
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dates.push(ymd);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DatePriceStrip({
  selectedDate,
  onDateSelect,
}: DatePriceStripProps) {
  const { priceDates, priceDatesLoading } = useFlightSearch();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build price lookup map
  const priceMap = useMemo(() => {
    const m = new Map<string, PriceDate>();
    for (const pd of priceDates) {
      m.set(pd.date, pd);
    }
    return m;
  }, [priceDates]);

  // Generate the 7-date range
  const dateRange = useMemo(
    () => generateDateRange(selectedDate),
    [selectedDate],
  );

  // Find cheapest price in the range
  const cheapestPrice = useMemo(() => {
    let min = Infinity;
    for (const dateStr of dateRange) {
      const pd = priceMap.get(dateStr);
      if (pd && pd.price < min) {
        min = pd.price;
      }
    }
    return min === Infinity ? null : min;
  }, [dateRange, priceMap]);

  // Scroll handlers
  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  // Loading state
  if (priceDatesLoading) {
    return (
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex justify-center gap-2 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex h-[88px] w-[88px] shrink-0 animate-pulse flex-col items-center justify-center rounded-xl bg-muted/50"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="relative">
        {/* Left chevron */}
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          className="absolute -left-2 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur transition-colors hover:bg-white"
          aria-label="Scroll left"
        >
          <ChevronLeft className="size-4 text-muted-foreground" />
        </button>

        {/* Scrollable strip */}
        <div
          ref={scrollRef}
          className="flex justify-center gap-2 overflow-x-auto scroll-smooth px-6 py-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {dateRange.map((dateStr) => {
            const d = new Date(dateStr + "T00:00:00");
            const dayName = SHORT_DAYS[d.getDay()];
            const dayNum = d.getDate();
            const monthName = SHORT_MONTHS[d.getMonth()];
            const pd = priceMap.get(dateStr);

            const isSelected = dateStr === selectedDate;
            const isCheapest =
              pd != null &&
              cheapestPrice != null &&
              pd.price === cheapestPrice &&
              !isSelected;

            let pillClass =
              "border border-border bg-white text-foreground hover:bg-muted/50 cursor-pointer";
            if (isSelected) {
              pillClass =
                "bg-[#C59746] text-white border border-[#C59746] cursor-default";
            } else if (isCheapest) {
              pillClass =
                "bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 cursor-pointer";
            }

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => {
                  if (!isSelected) onDateSelect(dateStr);
                }}
                className={`flex shrink-0 snap-start flex-col items-center rounded-xl px-4 py-2.5 transition-colors ${pillClass}`}
              >
                <span
                  className={`text-[10px] font-medium leading-tight ${isSelected ? "text-white/70" : "opacity-60"}`}
                >
                  {dayName}
                </span>
                <span className="text-xs font-medium leading-tight">
                  {monthName} {dayNum}
                </span>
                <span
                  className={`mt-1 text-sm font-semibold leading-tight ${isSelected ? "text-white" : ""}`}
                >
                  {pd ? formatPrice(pd.price, pd.currency) : "\u2014"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right chevron */}
        <button
          type="button"
          onClick={() => scrollBy(1)}
          className="absolute -right-2 top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur transition-colors hover:bg-white"
          aria-label="Scroll right"
        >
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-emerald-100 border border-emerald-200" />
          Cheapest
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm bg-[#C59746]" />
          Selected
        </div>
      </div>
    </div>
  );
}
