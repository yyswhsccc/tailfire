"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import type { DayCellContentArg, DatesSetArg } from "@fullcalendar/core";

import { formatPrice } from "@/lib/flight-utils";
import { useFlightSearch, type PriceDate } from "./flight-search-store";
import "./fullcalendar-theme.css";

/** Client-safe fetch via Next.js proxy routes */
async function clientFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<T>;
}

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

/** Today as YYYY-MM-DD in local timezone. */
function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Extract YYYY-MM from a YYYY-MM-DD string. */
function toYM(dateStr: string): string {
  return dateStr.slice(0, 7);
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
  const calendarRef = useRef<FullCalendar>(null);

  // -- Local state ----------------------------------------------------------
  const [collapsed, setCollapsed] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedDate) return toYM(selectedDate);
    return toYM(todayYMD());
  });

  // -- Derived data ---------------------------------------------------------
  const today = useMemo(() => todayYMD(), []);

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

  // -- FullCalendar callbacks -----------------------------------------------

  /** Handle date click to select departure date */
  const handleDateClick = useCallback(
    (arg: DateClickArg) => {
      const dateStr = arg.dateStr; // YYYY-MM-DD
      if (dateStr < today) return; // Don't allow past dates
      onDateSelect(dateStr);
    },
    [today, onDateSelect],
  );

  /** Detect month changes to trigger price fetching */
  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      // FullCalendar provides the visible range — use the middle of the range
      // to determine which month is displayed
      const midDate = new Date(
        (arg.start.getTime() + arg.end.getTime()) / 2,
      );
      const ym = `${midDate.getFullYear()}-${String(midDate.getMonth() + 1).padStart(2, "0")}`;
      setViewMonth(ym);
    },
    [],
  );

  /** Render custom day cell content: day number + price */
  const renderDayCellContent = useCallback(
    (arg: DayCellContentArg) => {
      const dateStr = formatDateStr(arg.date);
      const pd = priceMap.get(dateStr);

      return (
        <div className="flex flex-col items-center justify-center">
          <span className="fc-daygrid-day-number">{arg.dayNumberText}</span>
          {pd ? (
            <span className="fc-price-label">
              {formatPrice(pd.price, pd.currency)}
            </span>
          ) : (
            <span className="fc-price-label text-transparent">--</span>
          )}
        </div>
      );
    },
    [priceMap],
  );

  /** Apply CSS classes for color coding */
  const dayCellClassNames = useCallback(
    (arg: DayCellContentArg) => {
      const dateStr = formatDateStr(arg.date);
      const classes: string[] = [];

      if (dateStr < today) {
        classes.push("fc-day-past-date");
      } else if (dateStr === selectedDate) {
        classes.push("fc-day-selected");
      } else {
        const pd = priceMap.get(dateStr);
        if (pd != null && pd.price <= cheapThreshold) {
          classes.push("fc-day-cheap");
        }
      }

      return classes;
    },
    [today, selectedDate, priceMap, cheapThreshold],
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

  // -- Initial date for calendar --------------------------------------------
  const initialDate = selectedDate || todayYMD();

  // -- Render ---------------------------------------------------------------
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      {/* Header with hide button */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Price Calendar
        </h3>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Hide
        </button>
      </div>

      {/* Loading overlay */}
      {store.priceDatesLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* FullCalendar */}
      {!store.priceDatesLoading && (
        <>
          <div className="fc-phoenix">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              initialDate={initialDate}
              // schedulerLicenseKey is set when premium plugins are added:
              // schedulerLicenseKey="0933242943-fcs-1772730209"
              headerToolbar={{
                left: "prev",
                center: "title",
                right: "next",
              }}
              height="auto"
              fixedWeekCount={false}
              dateClick={handleDateClick}
              datesSet={handleDatesSet}
              dayCellContent={renderDayCellContent}
              dayCellClassNames={dayCellClassNames}
              dayHeaderFormat={{ weekday: "short" }}
            />
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

// ---------------------------------------------------------------------------
// Utility: format a Date object to YYYY-MM-DD (local timezone)
// ---------------------------------------------------------------------------

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
