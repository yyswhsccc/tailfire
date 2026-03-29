"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

/** Client-safe fetch via Next.js proxy routes */
async function clientFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<T>;
}
import { formatPrice } from "@/lib/flight-utils";
import { useFlightSearch, type PriceDate } from "./flight-search-store";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PriceCalendarProps {
  origin: string;
  destination: string;
  selectedDate: string; // YYYY-MM-DD
  onDateSelect: (date: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format YYYY-MM to a human month label, e.g. "June 2026". */
function monthLabel(ym: string): string {
  const parts = ym.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  return new Date(y, m - 1).toLocaleString("en-CA", {
    month: "long",
    year: "numeric",
  });
}

/** Return YYYY-MM for a given Date. */
function toYM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Return YYYY-MM-DD for a given Date. */
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today as YYYY-MM-DD in local timezone. */
function todayYMD(): string {
  return toYMD(new Date());
}

/** Build the grid cells for a month: leading blanks + day dates. */
function buildMonthGrid(ym: string): (string | null)[] {
  const parts = ym.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const firstDay = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();

  const cells: (string | null)[] = [];
  // leading blanks
  for (let i = 0; i < firstDay; i++) cells.push(null);
  // actual dates
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${ym}-${String(d).padStart(2, "0")}`;
    cells.push(date);
  }
  return cells;
}

/** Shift a YYYY-MM string by +/- months. */
function shiftMonth(ym: string, delta: number): string {
  const parts = ym.split("-").map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = new Date(y, m - 1 + delta, 1);
  return toYM(d);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PriceCalendar({
  origin,
  destination,
  selectedDate,
  onDateSelect,
}: PriceCalendarProps) {
  const store = useFlightSearch();

  // -- Local state ----------------------------------------------------------
  const [collapsed, setCollapsed] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedDate) return selectedDate.slice(0, 7);
    return toYM(new Date());
  });

  // -- Derived data ---------------------------------------------------------
  const today = useMemo(() => todayYMD(), []);
  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  // Price lookup map: date -> PriceDate
  const priceMap = useMemo(() => {
    const m = new Map<string, PriceDate>();
    for (const pd of store.priceDates) {
      m.set(pd.date, pd);
    }
    return m;
  }, [store.priceDates]);

  // Cheapest 25% threshold
  const cheapThreshold = useMemo(() => {
    const prices = store.priceDates
      .map((pd) => pd.price)
      .sort((a, b) => a - b);
    if (prices.length === 0) return 0;
    const idx = Math.max(0, Math.ceil(prices.length * 0.25) - 1);
    return prices[idx] ?? 0;
  }, [store.priceDates]);

  // -- Fetch price dates on month / route change ----------------------------
  useEffect(() => {
    if (!origin || !destination) return;

    let cancelled = false;
    const firstOfMonth = `${viewMonth}-01`;

    store.setPriceDatesLoading(true);

    clientFetch<{ dates: PriceDate[] }>(
      `/api/flights/dates?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&departureDate=${encodeURIComponent(firstOfMonth)}`,
    )
      .then((res) => {
        if (!cancelled) {
          store.setPriceDates(res.dates ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) store.setPriceDates([]);
      })
      .finally(() => {
        if (!cancelled) store.setPriceDatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, viewMonth]);

  // -- Month navigation -----------------------------------------------------
  const goBack = useCallback(
    () => setViewMonth((m) => shiftMonth(m, -1)),
    [],
  );
  const goForward = useCallback(
    () => setViewMonth((m) => shiftMonth(m, 1)),
    [],
  );

  // -- Collapsed state ------------------------------------------------------
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="text-sm font-medium text-[#C59746] hover:underline"
      >
        Show price calendar
      </button>
    );
  }

  // -- Render ---------------------------------------------------------------
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Price Calendar
        </h3>
        <div className="flex items-center gap-2">
          {/* Month nav */}
          <button
            type="button"
            onClick={goBack}
            className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[120px] text-center text-sm font-medium">
            {monthLabel(viewMonth)}
          </span>
          <button
            type="button"
            onClick={goForward}
            className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>

          {/* Hide button */}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="ml-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Hide
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {store.priceDatesLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Calendar grid */}
      {!store.priceDatesLoading && (
        <>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-medium uppercase text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((dateStr, idx) => {
              if (!dateStr) {
                return <div key={`blank-${idx}`} />;
              }

              const dayNum = parseInt(dateStr.split("-")[2] ?? "0", 10);
              const isPast = dateStr < today;
              const isSelected = dateStr === selectedDate;
              const pd = priceMap.get(dateStr);
              const isCheap = pd != null && pd.price <= cheapThreshold;

              let bgClass = "bg-white hover:bg-muted";
              let textClass = "text-foreground";
              let priceTextClass = "text-muted-foreground";

              if (isPast) {
                bgClass = "bg-muted/50";
                textClass = "text-muted-foreground/50";
                priceTextClass = "text-muted-foreground/30";
              } else if (isSelected) {
                bgClass = "bg-[#C59746]";
                textClass = "text-white";
                priceTextClass = "text-white/80";
              } else if (isCheap) {
                bgClass = "bg-emerald-50 hover:bg-emerald-100";
                textClass = "text-emerald-900";
                priceTextClass = "text-emerald-700";
              }

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isPast}
                  onClick={() => onDateSelect(dateStr)}
                  className={`flex flex-col items-center justify-center rounded-lg p-1 text-center transition-colors ${bgClass} ${isPast ? "cursor-default" : "cursor-pointer"}`}
                >
                  <span className={`text-xs font-medium leading-tight ${textClass}`}>
                    {dayNum}
                  </span>
                  {pd ? (
                    <span className={`text-[9px] leading-tight ${priceTextClass}`}>
                      {formatPrice(pd.price, pd.currency)}
                    </span>
                  ) : (
                    <span className="text-[9px] leading-tight text-transparent">
                      --
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-sm bg-emerald-100" />
              Cheapest dates
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-sm bg-[#C59746]" />
              Selected
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-sm bg-muted/50" />
              Past
            </div>
          </div>
        </>
      )}
    </div>
  );
}
