# Flight Search Frontend (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the OTA flight search page into a Google Flights-style experience with price calendar, smart filters, round-trip selection flow, AI insights, and a flight request checkout form.

**Architecture:** Client-heavy approach — a server component page fetches initial flight results, then a client-side `FlightSearchClient` manages all interactive state (filters, sorting, round-trip step, selection) via a Zustand store. Enrichment data (price calendar, price metrics, direct destinations, delay predictions, upsell) streams in via parallel client-side fetches with Suspense-like loading states. Checkout submits to the existing `POST /ota/leads/flight-requests` endpoint.

**Tech Stack:** Next.js 15 App Router, React 19, Zustand, Tailwind CSS, shadcn/ui, Lucide icons, existing `serviceFetch` + `publicFetch` helpers.

**Spec:** `docs/superpowers/specs/2026-03-29-flight-search-design.md`

---

## File Structure

```
apps/ota/src/
├── app/search/flights/
│   ├── page.tsx                    # REWRITE — server component, fetches initial results
│   ├── loading.tsx                 # UPDATE — new skeleton matching new layout
│   └── actions.ts                  # NEW — server actions for enrichment fetches
├── components/flights/
│   ├── flight-search-store.ts      # NEW — Zustand store for all flight search state
│   ├── flight-search-client.tsx    # NEW — client wrapper orchestrating the entire results area
│   ├── flight-search-form.tsx      # NEW — redesigned form with trip type toggle, swap, travelers
│   ├── price-calendar.tsx          # NEW — desktop month grid with cheapest fares
│   ├── price-date-strip.tsx        # NEW — mobile horizontal scrolling date strip
│   ├── flight-card.tsx             # NEW — 3-zone horizontal card (airline, details, price)
│   ├── flight-sort-pills.tsx       # NEW — Best/Cheapest/Fastest/Departure sort controls
│   ├── flight-filters.tsx          # NEW — sidebar filters (stops, airlines, price, time, duration)
│   ├── flight-filter-sheet.tsx     # NEW — mobile bottom sheet for filters
│   ├── flight-insights.tsx         # NEW — AI savings tip + price insight + direct flights
│   ├── round-trip-bar.tsx          # NEW — selected outbound summary + "Change" link
│   ├── flight-confirmation.tsx     # NEW — both flights summary + total + CTA
│   ├── flight-request-form.tsx     # NEW — guest checkout form
│   └── flight-request-success.tsx  # NEW — confirmation message after submission
├── components/search/
│   └── airport-autocomplete.tsx    # MODIFY — fix min chars, IATA validation, CITY+AIRPORT
└── lib/
    └── flight-utils.ts             # NEW — duration format, sorting fns, filter fns, price format
```

**Notes on existing files:**
- `components/search/flight-search-form.tsx` (old) — will be unused after this plan; the new form lives in `components/flights/`
- `components/search/flight-result-card.tsx` (old) — same; the new card lives in `components/flights/`
- `components/search/search-page-shell.tsx` — still used as the outer wrapper
- `lib/api.ts` — `serviceFetch` used for all API calls (no changes needed)

**New shadcn component needed:** `slider` (for price range and duration filters). Install with `npx shadcn@latest add slider`.

---

### Task 1: Flight Utilities + Zustand Store

**Files:**
- Create: `apps/ota/src/lib/flight-utils.ts`
- Create: `apps/ota/src/components/flights/flight-search-store.ts`

This task builds the shared foundation — pure utility functions and the central state store that all other tasks depend on.

- [ ] **Step 1: Create flight-utils.ts with duration formatting**

```typescript
// apps/ota/src/lib/flight-utils.ts

/** Parse ISO 8601 duration (PT7H30M) to total minutes */
export function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return (parseInt(match[1] || "0") * 60) + parseInt(match[2] || "0");
}

/** Format minutes to "7h 30m" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format ISO duration string directly */
export function formatIsoDuration(iso: string): string {
  return formatDuration(parseDuration(iso));
}

/** Format price string to currency display */
export function formatPrice(amount: string | number, currency = "CAD"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/** Get time-of-day bucket for departure time */
export type TimeBucket = "morning" | "afternoon" | "evening";
export function getTimeBucket(isoTime: string): TimeBucket {
  const hour = new Date(isoTime).getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** Count stops from segments array */
export function countStops(segments: { stops: number }[]): number {
  // Total stops = sum of per-segment stops + (number of connections between segments)
  const segmentStops = segments.reduce((sum, s) => sum + s.stops, 0);
  const connections = Math.max(0, segments.length - 1);
  return segmentStops + connections;
}

/** Extract unique airlines from results */
export function extractAirlines(
  results: Array<{ validatingAirline: string; segments: Array<{ carrierName?: string }> }>
): Array<{ code: string; name: string; count: number }> {
  const map = new Map<string, { name: string; count: number }>();
  for (const offer of results) {
    const code = offer.validatingAirline;
    const existing = map.get(code);
    const name = offer.segments[0]?.carrierName || code;
    if (existing) {
      existing.count++;
    } else {
      map.set(code, { name, count: 1 });
    }
  }
  return Array.from(map.entries())
    .map(([code, { name, count }]) => ({ code, name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Sort functions for flight offers */
export type SortOption = "best" | "cheapest" | "fastest" | "departure";

export function sortFlights<T extends {
  price: { total: string };
  segments: Array<{ duration: string; departure: { at: string } }>;
}>(flights: T[], sort: SortOption): T[] {
  const sorted = [...flights];
  switch (sort) {
    case "cheapest":
      return sorted.sort((a, b) => parseFloat(a.price.total) - parseFloat(b.price.total));
    case "fastest":
      return sorted.sort((a, b) => {
        const aDur = a.segments.reduce((s, seg) => s + parseDuration(seg.duration), 0);
        const bDur = b.segments.reduce((s, seg) => s + parseDuration(seg.duration), 0);
        return aDur - bDur;
      });
    case "departure":
      return sorted.sort((a, b) =>
        new Date(a.segments[0].departure.at).getTime() - new Date(b.segments[0].departure.at).getTime()
      );
    case "best":
    default:
      // Balanced score: normalize price (40%) + duration (40%) + stops (20%)
      return sorted.sort((a, b) => {
        const aPrice = parseFloat(a.price.total);
        const bPrice = parseFloat(b.price.total);
        const aDur = a.segments.reduce((s, seg) => s + parseDuration(seg.duration), 0);
        const bDur = b.segments.reduce((s, seg) => s + parseDuration(seg.duration), 0);
        const aStops = countStops(a.segments);
        const bStops = countStops(b.segments);
        const maxPrice = Math.max(aPrice, bPrice) || 1;
        const maxDur = Math.max(aDur, bDur) || 1;
        const maxStops = Math.max(aStops, bStops) || 1;
        const aScore = (aPrice / maxPrice) * 0.4 + (aDur / maxDur) * 0.4 + (aStops / maxStops) * 0.2;
        const bScore = (bPrice / maxPrice) * 0.4 + (bDur / maxDur) * 0.4 + (bStops / maxStops) * 0.2;
        return aScore - bScore;
      });
  }
}

/** Filter a single flight against active filters */
export interface FlightFilters {
  stops: number[];          // e.g., [0, 1] for nonstop + 1 stop
  airlines: string[];       // IATA codes
  priceRange: [number, number];
  timeBuckets: TimeBucket[];
  maxDuration: number;      // in minutes, 0 = no limit
}

export const DEFAULT_FILTERS: FlightFilters = {
  stops: [],
  airlines: [],
  priceRange: [0, 99999],
  timeBuckets: [],
  maxDuration: 0,
};

export function applyFilters<T extends {
  price: { total: string };
  validatingAirline: string;
  segments: Array<{ stops: number; duration: string; departure: { at: string } }>;
}>(flights: T[], filters: FlightFilters): T[] {
  return flights.filter((f) => {
    const price = parseFloat(f.price.total);
    const stops = countStops(f.segments);
    const totalMinutes = f.segments.reduce((s, seg) => s + parseDuration(seg.duration), 0);
    const bucket = getTimeBucket(f.segments[0].departure.at);

    if (filters.stops.length > 0 && !filters.stops.includes(Math.min(stops, 2))) return false;
    if (filters.airlines.length > 0 && !filters.airlines.includes(f.validatingAirline)) return false;
    if (price < filters.priceRange[0] || price > filters.priceRange[1]) return false;
    if (filters.timeBuckets.length > 0 && !filters.timeBuckets.includes(bucket)) return false;
    if (filters.maxDuration > 0 && totalMinutes > filters.maxDuration) return false;

    return true;
  });
}
```

- [ ] **Step 2: Create flight-search-store.ts**

```typescript
// apps/ota/src/components/flights/flight-search-store.ts
"use client";

import { create } from "zustand";
import type { SortOption, FlightFilters } from "@/lib/flight-utils";
import { DEFAULT_FILTERS } from "@/lib/flight-utils";

// Re-export the FlightOffer type from the existing result card for now
// (will be superseded by the new card's type in Task 4)
export interface FlightOffer {
  id: string;
  source: string;
  segments: Array<{
    departure: { iataCode: string; terminal?: string; at: string };
    arrival: { iataCode: string; terminal?: string; at: string };
    carrier: string;
    carrierName?: string;
    flightNumber: string;
    aircraft?: string;
    duration: string;
    stops: number;
    cabin?: string;
  }>;
  price: {
    currency: string;
    total: string;
    perTraveler: string;
    base?: string;
  };
  validatingAirline: string;
  fareClass?: string;
  fareFamily?: string;
  cabin?: string;
  fareRules?: { exchangeable: boolean; refundable: boolean };
  baggageAllowance?: {
    checked?: { quantity: number; weight?: string };
    cabin?: { quantity: number };
  };
}

export type TripType = "round-trip" | "one-way";
export type RoundTripStep = "outbound" | "return" | "confirm";

export interface PriceDate {
  date: string;
  price: number;
  currency: string;
}

export interface PriceMetrics {
  min: number;
  firstQuartile: number;
  median: number;
  thirdQuartile: number;
  max: number;
  currencyCode: string;
}

export interface DirectDestination {
  iataCode: string;
  name: string;
  type: string;
}

export interface DelayPrediction {
  onTimePercentage: number;
  delayLevel: string;
}

interface FlightSearchState {
  // --- Search params ---
  tripType: TripType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  travelClass: string;

  // --- Results ---
  outboundResults: FlightOffer[];
  returnResults: FlightOffer[];
  isSearching: boolean;
  searchError: string | null;

  // --- Enrichment ---
  priceDates: PriceDate[];
  priceDatesLoading: boolean;
  priceMetrics: PriceMetrics | null;
  priceMetricsLoading: boolean;
  directDestinations: DirectDestination[];
  directDestinationsLoading: boolean;
  delayPredictions: Map<string, DelayPrediction>;
  upsellOffers: FlightOffer[];
  upsellLoading: boolean;

  // --- Filters & Sort ---
  sort: SortOption;
  filters: FlightFilters;

  // --- Round-trip flow ---
  roundTripStep: RoundTripStep;
  selectedOutbound: FlightOffer | null;
  selectedReturn: FlightOffer | null;

  // --- Checkout ---
  showRequestForm: boolean;

  // --- Actions ---
  setTripType: (type: TripType) => void;
  setSearchParams: (params: Partial<Pick<FlightSearchState,
    "origin" | "destination" | "departureDate" | "returnDate" | "adults" | "children" | "travelClass"
  >>) => void;
  swapAirports: () => void;
  setOutboundResults: (results: FlightOffer[]) => void;
  setReturnResults: (results: FlightOffer[]) => void;
  setIsSearching: (v: boolean) => void;
  setSearchError: (err: string | null) => void;
  setPriceDates: (dates: PriceDate[]) => void;
  setPriceDatesLoading: (v: boolean) => void;
  setPriceMetrics: (m: PriceMetrics | null) => void;
  setPriceMetricsLoading: (v: boolean) => void;
  setDirectDestinations: (d: DirectDestination[]) => void;
  setDirectDestinationsLoading: (v: boolean) => void;
  setDelayPrediction: (flightKey: string, prediction: DelayPrediction) => void;
  setUpsellOffers: (offers: FlightOffer[]) => void;
  setUpsellLoading: (v: boolean) => void;
  setSort: (sort: SortOption) => void;
  setFilters: (filters: Partial<FlightFilters>) => void;
  resetFilters: () => void;
  selectOutbound: (offer: FlightOffer) => void;
  selectReturn: (offer: FlightOffer) => void;
  changeOutbound: () => void;
  setShowRequestForm: (v: boolean) => void;
  reset: () => void;
}

export const useFlightSearch = create<FlightSearchState>((set) => ({
  // Defaults
  tripType: "round-trip",
  origin: "",
  destination: "",
  departureDate: "",
  returnDate: "",
  adults: 1,
  children: 0,
  travelClass: "ECONOMY",

  outboundResults: [],
  returnResults: [],
  isSearching: false,
  searchError: null,

  priceDates: [],
  priceDatesLoading: false,
  priceMetrics: null,
  priceMetricsLoading: false,
  directDestinations: [],
  directDestinationsLoading: false,
  delayPredictions: new Map(),
  upsellOffers: [],
  upsellLoading: false,

  sort: "best",
  filters: { ...DEFAULT_FILTERS },

  roundTripStep: "outbound",
  selectedOutbound: null,
  selectedReturn: null,

  showRequestForm: false,

  // Actions
  setTripType: (tripType) => set({ tripType }),
  setSearchParams: (params) => set(params),
  swapAirports: () =>
    set((s) => ({ origin: s.destination, destination: s.origin })),
  setOutboundResults: (outboundResults) => set({ outboundResults }),
  setReturnResults: (returnResults) => set({ returnResults }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setSearchError: (searchError) => set({ searchError }),
  setPriceDates: (priceDates) => set({ priceDates }),
  setPriceDatesLoading: (priceDatesLoading) => set({ priceDatesLoading }),
  setPriceMetrics: (priceMetrics) => set({ priceMetrics }),
  setPriceMetricsLoading: (priceMetricsLoading) => set({ priceMetricsLoading }),
  setDirectDestinations: (directDestinations) => set({ directDestinations }),
  setDirectDestinationsLoading: (directDestinationsLoading) =>
    set({ directDestinationsLoading }),
  setDelayPrediction: (flightKey, prediction) =>
    set((s) => {
      const next = new Map(s.delayPredictions);
      next.set(flightKey, prediction);
      return { delayPredictions: next };
    }),
  setUpsellOffers: (upsellOffers) => set({ upsellOffers }),
  setUpsellLoading: (upsellLoading) => set({ upsellLoading }),
  setSort: (sort) => set({ sort }),
  setFilters: (partial) =>
    set((s) => ({ filters: { ...s.filters, ...partial } })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
  selectOutbound: (offer) =>
    set({ selectedOutbound: offer, roundTripStep: "return" }),
  selectReturn: (offer) =>
    set({ selectedReturn: offer, roundTripStep: "confirm" }),
  changeOutbound: () =>
    set({ selectedOutbound: null, selectedReturn: null, roundTripStep: "outbound" }),
  setShowRequestForm: (showRequestForm) => set({ showRequestForm }),
  reset: () =>
    set({
      outboundResults: [],
      returnResults: [],
      isSearching: false,
      searchError: null,
      priceDates: [],
      priceMetrics: null,
      directDestinations: [],
      delayPredictions: new Map(),
      upsellOffers: [],
      sort: "best",
      filters: { ...DEFAULT_FILTERS },
      roundTripStep: "outbound",
      selectedOutbound: null,
      selectedReturn: null,
      showRequestForm: false,
    }),
}));
```

- [ ] **Step 3: Verify no import errors**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota exec tsc --noEmit --pretty 2>&1 | head -30`

Expected: No errors from the new files (other files may have pre-existing warnings).

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/lib/flight-utils.ts apps/ota/src/components/flights/flight-search-store.ts
git commit -m "feat(ota): add flight search utilities and Zustand store for Plan B"
```

---

### Task 2: Search Form Rewrite

**Files:**
- Create: `apps/ota/src/components/flights/flight-search-form.tsx`
- Modify: `apps/ota/src/components/search/airport-autocomplete.tsx:41,61,76`

The new form includes trip-type toggle, swap button, travelers dropdown, and class selector. Also fixes the airport autocomplete issues identified in spec section 11.

- [ ] **Step 1: Fix airport-autocomplete.tsx**

Three changes needed:

**Fix 1 — Min chars already 3 (line ~41):** Verify the current threshold is `keyword.length < 3`. If it's 2, change to 3. (Current code already uses 3 — just verify.)

**Fix 2 — IATA validation on selection (around line ~61):** When user selects an airport, verify the hidden input only accepts a valid 3-letter IATA code. Current code writes the IATA code from the selected suggestion — confirm it validates with `/^[A-Z]{3}$/`.

**Fix 3 — Add CITY subType (around line ~76):** The API call currently queries with no subType or `subType=AIRPORT`. Change to `subType=CITY,AIRPORT` so city codes also appear.

In `airport-autocomplete.tsx`, find the fetch URL and append `&subType=CITY,AIRPORT` if not already present.

- [ ] **Step 2: Create the new flight-search-form.tsx**

```typescript
// apps/ota/src/components/flights/flight-search-form.tsx
"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightLeft, Search, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AirportAutocomplete } from "@/components/search/airport-autocomplete";
import { useFlightSearch, type TripType } from "./flight-search-store";

const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: "round-trip", label: "Round trip" },
  { value: "one-way", label: "One way" },
];

const CABIN_CLASSES = [
  { value: "ECONOMY", label: "Economy" },
  { value: "PREMIUM_ECONOMY", label: "Premium Economy" },
  { value: "BUSINESS", label: "Business" },
  { value: "FIRST", label: "First" },
];

interface FlightSearchFormProps {
  compact?: boolean;
}

export function FlightSearchForm({ compact }: FlightSearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useFlightSearch();

  // Sync from URL on mount (read defaults from URL params)
  const urlOrigin = searchParams.get("origin") || "";
  const urlDest = searchParams.get("destination") || "";
  const urlDepart = searchParams.get("departureDate") || "";
  const urlReturn = searchParams.get("returnDate") || "";
  const urlAdults = searchParams.get("adults") || "1";
  const urlChildren = searchParams.get("children") || "0";
  const urlClass = searchParams.get("travelClass") || "ECONOMY";

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const origin = (fd.get("origin") as string) || "";
      const destination = (fd.get("destination") as string) || "";
      const departureDate = (fd.get("departureDate") as string) || "";
      const returnDate = (fd.get("returnDate") as string) || "";
      const adults = (fd.get("adults") as string) || "1";
      const children = (fd.get("children") as string) || "0";
      const travelClass = (fd.get("travelClass") as string) || "ECONOMY";

      if (!origin || !destination || !departureDate) return;

      // Validate IATA codes
      if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return;

      const params = new URLSearchParams();
      params.set("origin", origin);
      params.set("destination", destination);
      params.set("departureDate", departureDate);
      if (store.tripType === "round-trip" && returnDate) {
        params.set("returnDate", returnDate);
      }
      params.set("adults", adults);
      if (children !== "0") params.set("children", children);
      if (travelClass !== "ECONOMY") params.set("travelClass", travelClass);

      // Update store
      store.setSearchParams({
        origin, destination, departureDate, returnDate,
        adults: parseInt(adults), children: parseInt(children), travelClass,
      });
      store.reset(); // Clear previous results

      router.push(`/search/flights?${params.toString()}`);
    },
    [router, store],
  );

  const handleSwap = useCallback(() => {
    // Swap the actual input values by swapping hidden inputs
    // This requires a ref-based approach or just swapping the form
    store.swapAirports();
    // The form will re-render with swapped defaults from store
  }, [store]);

  return (
    <form onSubmit={handleSubmit}>
      <div className={`rounded-2xl border border-border bg-white p-4 shadow-sm ${compact ? "p-3" : "p-5"}`}>
        {/* Row 1: Trip type + Travelers + Class */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Trip type pills */}
          <div className="flex rounded-lg border border-border p-0.5">
            {TRIP_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => store.setTripType(t.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  store.tripType === t.value
                    ? "bg-[#1A1A1A] text-white"
                    : "text-[#1A1A1A] hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Travelers */}
          <div className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5">
            <select
              name="adults"
              defaultValue={urlAdults}
              className="bg-transparent text-sm font-medium text-[#1A1A1A] outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n} Adult{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">,</span>
            <select
              name="children"
              defaultValue={urlChildren}
              className="bg-transparent text-sm font-medium text-[#1A1A1A] outline-none"
            >
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} Child{n !== 1 ? "ren" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Class */}
          <select
            name="travelClass"
            defaultValue={urlClass}
            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-[#1A1A1A] outline-none"
          >
            {CABIN_CLASSES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Row 2: Origin, Swap, Destination, Dates, Search */}
        <div className={`grid items-end gap-2 ${compact ? "grid-cols-1 sm:grid-cols-[1fr_auto_1fr_1fr_1fr_auto]" : "grid-cols-1 sm:grid-cols-[1fr_auto_1fr_1fr_1fr_auto]"}`}>
          {/* Origin */}
          <AirportAutocomplete
            id="origin"
            name="origin"
            label="From"
            placeholder="City or airport"
            defaultValue={urlOrigin}
            required
          />

          {/* Swap button */}
          <button
            type="button"
            onClick={handleSwap}
            className="hidden h-10 w-10 items-center justify-center rounded-full border border-border transition-colors hover:bg-muted sm:flex"
            aria-label="Swap origin and destination"
          >
            <ArrowRightLeft className="size-4 text-[#1A1A1A]" />
          </button>

          {/* Destination */}
          <AirportAutocomplete
            id="destination"
            name="destination"
            label="To"
            placeholder="City or airport"
            defaultValue={urlDest}
            required
          />

          {/* Departure date */}
          <div>
            <label htmlFor="departureDate" className="mb-1 block text-xs font-medium text-muted-foreground">
              Depart
            </label>
            <input
              type="date"
              id="departureDate"
              name="departureDate"
              defaultValue={urlDepart}
              required
              min={new Date().toISOString().split("T")[0]}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-[#1A1A1A] outline-none focus:border-[#C59746] focus:ring-1 focus:ring-[#C59746]"
            />
          </div>

          {/* Return date */}
          {store.tripType === "round-trip" && (
            <div>
              <label htmlFor="returnDate" className="mb-1 block text-xs font-medium text-muted-foreground">
                Return
              </label>
              <input
                type="date"
                id="returnDate"
                name="returnDate"
                defaultValue={urlReturn}
                min={urlDepart || new Date().toISOString().split("T")[0]}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-[#1A1A1A] outline-none focus:border-[#C59746] focus:ring-1 focus:ring-[#C59746]"
              />
            </div>
          )}

          {/* Search button */}
          <Button
            type="submit"
            className="h-10 bg-[#C59746] text-white hover:bg-[#B08638]"
          >
            <Search className="mr-2 size-4" />
            Search
          </Button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Verify the form renders**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota build 2>&1 | tail -20`

Expected: Build succeeds (the form isn't wired to the page yet, but should compile).

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/components/flights/flight-search-form.tsx apps/ota/src/components/search/airport-autocomplete.tsx
git commit -m "feat(ota): redesigned flight search form with trip type toggle and swap"
```

---

### Task 3: Price Calendar + Mobile Date Strip

**Files:**
- Create: `apps/ota/src/components/flights/price-calendar.tsx`
- Create: `apps/ota/src/components/flights/price-date-strip.tsx`

The price calendar shows a month grid with cheapest fares per date (desktop) or a horizontal scrolling strip (mobile). Data comes from `GET /ota/search/flight-dates`.

- [ ] **Step 1: Create price-calendar.tsx (desktop month grid)**

```typescript
// apps/ota/src/components/flights/price-calendar.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { formatPrice } from "@/lib/flight-utils";
import { serviceFetch } from "@/lib/api";
import { useFlightSearch, type PriceDate } from "./flight-search-store";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface PriceCalendarProps {
  origin: string;
  destination: string;
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export function PriceCalendar({
  origin,
  destination,
  selectedDate,
  onDateSelect,
}: PriceCalendarProps) {
  const store = useFlightSearch();
  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedDate) return new Date(selectedDate + "T00:00:00");
    return new Date();
  });
  const [collapsed, setCollapsed] = useState(false);

  // Fetch cheapest dates
  useEffect(() => {
    if (!origin || !destination) return;
    store.setPriceDatesLoading(true);

    const qs = new URLSearchParams({ origin, destination });
    // Add departure date range based on view month
    const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    qs.set("departureDate", monthStart.toISOString().split("T")[0]);

    serviceFetch<{ dates: PriceDate[] }>(`/ota/search/flight-dates?${qs}`)
      .then((res) => {
        if (res.dates) store.setPriceDates(res.dates);
      })
      .catch(() => {})
      .finally(() => store.setPriceDatesLoading(false));
  }, [origin, destination, viewMonth, store]);

  const priceMap = new Map(store.priceDates.map((d) => [d.date, d]));
  const today = new Date().toISOString().split("T")[0];

  // Calendar grid
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Price stats for color coding
  const prices = store.priceDates.map((d) => d.price).sort((a, b) => a - b);
  const p25 = prices[Math.floor(prices.length * 0.25)] ?? 0;

  const goMonth = useCallback((delta: number) => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="mb-4 w-full rounded-xl border border-border bg-white px-4 py-2 text-left text-sm font-medium text-[#C59746] hover:bg-muted"
      >
        Show price calendar
      </button>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A1A]">Price Calendar</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => goMonth(-1)} className="rounded p-1 hover:bg-muted">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[120px] text-center text-sm font-medium">
            {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => goMonth(1)} className="rounded p-1 hover:bg-muted">
            <ChevronRight className="size-4" />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="ml-2 text-xs text-muted-foreground hover:text-[#1A1A1A]"
          >
            Hide
          </button>
        </div>
      </div>

      {store.priceDatesLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const priceData = priceMap.get(dateStr);
              const isPast = dateStr < today;
              const isSelected = dateStr === selectedDate;
              const isCheap = priceData && priceData.price <= p25;

              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isPast}
                  onClick={() => onDateSelect(dateStr)}
                  className={`flex flex-col items-center rounded-lg p-1.5 text-xs transition-colors ${
                    isPast
                      ? "cursor-default text-muted-foreground/40"
                      : isSelected
                        ? "bg-[#C59746] text-white"
                        : isCheap
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{day}</span>
                  {priceData && !isPast && (
                    <span className={`mt-0.5 text-[10px] ${isSelected ? "text-white/80" : ""}`}>
                      {formatPrice(priceData.price, priceData.currency)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-emerald-100" /> Cheapest
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-[#C59746]" /> Selected
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create price-date-strip.tsx (mobile horizontal strip)**

```typescript
// apps/ota/src/components/flights/price-date-strip.tsx
"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { formatPrice } from "@/lib/flight-utils";
import { useFlightSearch } from "./flight-search-store";

interface PriceDateStripProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export function PriceDateStrip({ selectedDate, onDateSelect }: PriceDateStripProps) {
  const { priceDates, priceDatesLoading } = useFlightSearch();
  const scrollRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const visibleDates = priceDates.filter((d) => d.date >= today);

  // Price stats for coloring
  const prices = visibleDates.map((d) => d.price).sort((a, b) => a - b);
  const p25 = prices[Math.floor(prices.length * 0.25)] ?? 0;

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  if (priceDatesLoading || visibleDates.length === 0) return null;

  return (
    <div className="relative mb-4">
      {/* Scroll buttons */}
      <button
        onClick={() => scroll(-1)}
        className="absolute -left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-white p-1 shadow-sm"
      >
        <ChevronLeft className="size-3" />
      </button>
      <button
        onClick={() => scroll(1)}
        className="absolute -right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-white p-1 shadow-sm"
      >
        <ChevronRight className="size-3" />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto px-4 scrollbar-hide"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {visibleDates.map((d) => {
          const isSelected = d.date === selectedDate;
          const isCheap = d.price <= p25;
          const dateObj = new Date(d.date + "T00:00:00");
          const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
          const dayNum = dateObj.getDate();
          const monthName = dateObj.toLocaleDateString("en-US", { month: "short" });

          return (
            <button
              key={d.date}
              onClick={() => onDateSelect(d.date)}
              className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-2 text-xs transition-colors ${
                isSelected
                  ? "bg-[#C59746] text-white"
                  : isCheap
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-white text-[#1A1A1A] hover:bg-muted"
              } border ${isSelected ? "border-[#C59746]" : "border-border"}`}
              style={{ scrollSnapAlign: "start" }}
            >
              <span className="font-medium">{dayName}</span>
              <span className="text-base font-bold">{dayNum}</span>
              <span className="text-[10px] opacity-70">{monthName}</span>
              <span className={`mt-1 font-semibold ${isSelected ? "text-white" : ""}`}>
                {formatPrice(d.price, d.currency)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify both components compile**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/components/flights/price-calendar.tsx apps/ota/src/components/flights/price-date-strip.tsx
git commit -m "feat(ota): price calendar grid and mobile date strip for flight search"
```

---

### Task 4: Flight Result Card

**Files:**
- Create: `apps/ota/src/components/flights/flight-card.tsx`

3-zone horizontal card: airline badge (left), flight details (center), price (right). Includes price indicator badge and delay prediction. Supports selection via onClick.

- [ ] **Step 1: Create flight-card.tsx**

```typescript
// apps/ota/src/components/flights/flight-card.tsx
"use client";

import { useEffect } from "react";
import { Plane, Clock, Luggage, ArrowRight } from "lucide-react";

import { formatPrice, formatIsoDuration, countStops } from "@/lib/flight-utils";
import { serviceFetch } from "@/lib/api";
import {
  useFlightSearch,
  type FlightOffer,
  type PriceMetrics,
  type DelayPrediction,
} from "./flight-search-store";

// Airline badge colors (first letter of IATA code)
const AIRLINE_COLORS: Record<string, string> = {
  A: "#003366", // Air Canada, American, etc.
  B: "#1a5276",
  C: "#2c3e50",
  D: "#1b4f72",
  E: "#145a32",
  F: "#4a235a",
  J: "#283747",
  K: "#1c2833",
  L: "#0e6655",
  N: "#784212",
  Q: "#6c3483",
  R: "#922b21",
  S: "#1a5276",
  U: "#0b5345",
  W: "#186a3b", // WestJet
};

function getAirlineColor(code: string): string {
  return AIRLINE_COLORS[code[0]] || "#1A1A1A";
}

function getPriceIndicator(price: number, metrics: PriceMetrics | null) {
  if (!metrics) return null;
  if (price <= metrics.firstQuartile)
    return { label: "Low price", color: "text-emerald-600", bg: "bg-emerald-50" };
  if (price <= metrics.thirdQuartile)
    return { label: "Typical", color: "text-amber-600", bg: "bg-amber-50" };
  return { label: "High price", color: "text-red-600", bg: "bg-red-50" };
}

interface FlightCardProps {
  offer: FlightOffer;
  onSelect?: (offer: FlightOffer) => void;
  isUpsell?: boolean;
}

export function FlightCard({ offer, onSelect, isUpsell }: FlightCardProps) {
  const { priceMetrics, delayPredictions, setDelayPrediction } = useFlightSearch();
  const seg = offer.segments;
  const firstSeg = seg[0];
  const lastSeg = seg[seg.length - 1];
  const stops = countStops(seg);
  const totalDuration = seg.reduce(
    (sum, s) => {
      const m = s.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
      return sum + (parseInt(m?.[1] || "0") * 60) + parseInt(m?.[2] || "0");
    },
    0,
  );
  const price = parseFloat(offer.price.total);
  const indicator = getPriceIndicator(price, priceMetrics);

  // Flight key for delay prediction cache
  const flightKey = `${firstSeg.carrier}${firstSeg.flightNumber}`;
  const prediction = delayPredictions.get(flightKey);

  // Lazy-load delay prediction (only for first render)
  useEffect(() => {
    if (prediction || !firstSeg.aircraft) return;
    const params = new URLSearchParams({
      carrierCode: firstSeg.carrier,
      flightNumber: firstSeg.flightNumber,
      departureDate: firstSeg.departure.at.split("T")[0],
      departureTime: new Date(firstSeg.departure.at).toTimeString().slice(0, 8),
      arrivalDate: lastSeg.arrival.at.split("T")[0],
      arrivalTime: new Date(lastSeg.arrival.at).toTimeString().slice(0, 8),
      aircraftCode: firstSeg.aircraft,
      originLocationCode: firstSeg.departure.iataCode,
      destinationLocationCode: lastSeg.arrival.iataCode,
      duration: firstSeg.duration,
    });
    serviceFetch<{ prediction: DelayPrediction | null }>(
      `/ota/search/flight-delay?${params}`,
    )
      .then((res) => {
        if (res.prediction) setDelayPrediction(flightKey, res.prediction);
      })
      .catch(() => {});
  }, [flightKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const departTime = new Date(firstSeg.departure.at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const arriveTime = new Date(lastSeg.arrival.at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const durationStr = `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m`;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(offer)}
      className={`group flex w-full items-stretch rounded-xl border text-left transition-all hover:shadow-md ${
        isUpsell
          ? "border-[#C59746] bg-[#C59746]/5"
          : "border-border bg-white hover:border-[#C59746]/30"
      }`}
    >
      {/* Zone 1: Airline badge */}
      <div
        className="flex w-16 shrink-0 flex-col items-center justify-center rounded-l-xl px-2 py-3"
        style={{ backgroundColor: getAirlineColor(offer.validatingAirline) }}
      >
        <span className="text-sm font-bold text-white">{offer.validatingAirline}</span>
        <Plane className="mt-1 size-3.5 text-white/70" />
      </div>

      {/* Zone 2: Flight details */}
      <div className="flex flex-1 flex-col justify-center gap-1 px-4 py-3">
        {/* Times row */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-[#1A1A1A]">{departTime}</span>
          <div className="flex flex-1 items-center gap-1">
            <div className="h-px flex-1 bg-border" />
            <span className="shrink-0 text-[10px] text-muted-foreground">{durationStr}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <span className="text-lg font-bold text-[#1A1A1A]">{arriveTime}</span>
        </div>

        {/* Route + stops */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{firstSeg.departure.iataCode}</span>
          <ArrowRight className="size-3" />
          <span>{lastSeg.arrival.iataCode}</span>
          <span className="mx-1">·</span>
          <span className={stops === 0 ? "font-medium text-emerald-600" : ""}>
            {stops === 0 ? "Nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`}
          </span>
          <span className="mx-1">·</span>
          <span>
            {firstSeg.carrier} {firstSeg.flightNumber}
          </span>
        </div>

        {/* Badges row */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {offer.fareFamily && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {offer.fareFamily}
            </span>
          )}
          {offer.baggageAllowance?.checked && (
            <span className="flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px]">
              <Luggage className="size-2.5" />
              {offer.baggageAllowance.checked.quantity} bag
              {offer.baggageAllowance.checked.quantity > 1 ? "s" : ""}
            </span>
          )}
          {prediction && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                prediction.onTimePercentage >= 80
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {prediction.onTimePercentage >= 80
                ? `${prediction.onTimePercentage}% on time`
                : "Often delayed"}
            </span>
          )}
          {isUpsell && (
            <span className="rounded bg-[#C59746]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#C59746]">
              Premium
            </span>
          )}
        </div>
      </div>

      {/* Zone 3: Price */}
      <div className="flex w-28 shrink-0 flex-col items-end justify-center rounded-r-xl px-4 py-3">
        <span className="text-lg font-bold text-[#1A1A1A]">
          {formatPrice(offer.price.total, offer.price.currency)}
        </span>
        <span className="text-[10px] text-muted-foreground">per person</span>
        {indicator && (
          <span className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${indicator.bg} ${indicator.color}`}>
            {indicator.label}
          </span>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify the card compiles**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/flights/flight-card.tsx
git commit -m "feat(ota): 3-zone flight result card with price indicators and delay prediction"
```

---

### Task 5: Sort Pills + Filter Sidebar + Mobile Filter Sheet

**Files:**
- Create: `apps/ota/src/components/flights/flight-sort-pills.tsx`
- Create: `apps/ota/src/components/flights/flight-filters.tsx`
- Create: `apps/ota/src/components/flights/flight-filter-sheet.tsx`

Install shadcn slider: `cd apps/ota && npx shadcn@latest add slider`

All filtering and sorting is client-side on the already-fetched results array.

- [ ] **Step 1: Install shadcn slider component**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire/apps/ota && npx shadcn@latest add slider --yes`

Expected: `slider.tsx` added to `components/ui/`.

- [ ] **Step 2: Create flight-sort-pills.tsx**

```typescript
// apps/ota/src/components/flights/flight-sort-pills.tsx
"use client";

import { useFlightSearch } from "./flight-search-store";
import type { SortOption } from "@/lib/flight-utils";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "cheapest", label: "Cheapest" },
  { value: "fastest", label: "Fastest" },
  { value: "departure", label: "Departure" },
];

export function FlightSortPills() {
  const { sort, setSort } = useFlightSearch();

  return (
    <div className="flex gap-1.5">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setSort(opt.value)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            sort === opt.value
              ? "bg-[#1A1A1A] text-white"
              : "bg-muted text-[#1A1A1A] hover:bg-muted/80"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create flight-filters.tsx (sidebar)**

```typescript
// apps/ota/src/components/flights/flight-filters.tsx
"use client";

import { useMemo } from "react";
import { X } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import {
  extractAirlines,
  formatPrice,
  formatDuration,
  parseDuration,
  countStops,
  type TimeBucket,
} from "@/lib/flight-utils";
import { useFlightSearch, type FlightOffer } from "./flight-search-store";

const TIME_BUCKETS: { value: TimeBucket; label: string }[] = [
  { value: "morning", label: "Morning (6am–12pm)" },
  { value: "afternoon", label: "Afternoon (12pm–6pm)" },
  { value: "evening", label: "Evening (6pm–12am)" },
];

interface FlightFiltersProps {
  results: FlightOffer[];
}

export function FlightFilters({ results }: FlightFiltersProps) {
  const { filters, setFilters, resetFilters } = useFlightSearch();

  // Computed stats from results
  const stats = useMemo(() => {
    const prices = results.map((r) => parseFloat(r.price.total));
    const durations = results.map((r) =>
      r.segments.reduce((s, seg) => s + parseDuration(seg.duration), 0),
    );
    const stopCounts = results.map((r) => countStops(r.segments));
    return {
      minPrice: Math.min(...prices) || 0,
      maxPrice: Math.max(...prices) || 5000,
      minDuration: Math.min(...durations) || 0,
      maxDuration: Math.max(...durations) || 1440,
      airlines: extractAirlines(results),
      stopOptions: [...new Set(stopCounts.map((s) => Math.min(s, 2)))].sort(),
      // Cheapest per stop count
      cheapestByStops: stopCounts.reduce(
        (acc, s, i) => {
          const key = Math.min(s, 2);
          const price = prices[i];
          if (!acc[key] || price < acc[key]) acc[key] = price;
          return acc;
        },
        {} as Record<number, number>,
      ),
    };
  }, [results]);

  const hasActiveFilters =
    filters.stops.length > 0 ||
    filters.airlines.length > 0 ||
    filters.timeBuckets.length > 0 ||
    filters.priceRange[0] > stats.minPrice ||
    filters.priceRange[1] < stats.maxPrice ||
    filters.maxDuration > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A1A]">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-xs text-[#C59746] hover:underline"
          >
            <X className="size-3" /> Clear all
          </button>
        )}
      </div>

      {/* Stops */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Stops</p>
        <div className="space-y-1.5">
          {[0, 1, 2].map((s) => {
            if (!stats.stopOptions.includes(s)) return null;
            const label = s === 0 ? "Nonstop" : s === 1 ? "1 stop" : "2+ stops";
            const cheapest = stats.cheapestByStops[s];
            return (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.stops.includes(s)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...filters.stops, s]
                      : filters.stops.filter((v) => v !== s);
                    setFilters({ stops: next });
                  }}
                  className="size-3.5 rounded border-border accent-[#C59746]"
                />
                <span className="flex-1">{label}</span>
                {cheapest && (
                  <span className="text-xs text-muted-foreground">
                    from {formatPrice(cheapest)}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Airlines */}
      {stats.airlines.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Airlines</p>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {stats.airlines.map((a) => (
              <label key={a.code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.airlines.includes(a.code)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...filters.airlines, a.code]
                      : filters.airlines.filter((v) => v !== a.code);
                    setFilters({ airlines: next });
                  }}
                  className="size-3.5 rounded border-border accent-[#C59746]"
                />
                <span className="flex-1 truncate">
                  {a.name} ({a.code})
                </span>
                <span className="text-xs text-muted-foreground">{a.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Price range */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Price range</p>
        <Slider
          min={stats.minPrice}
          max={stats.maxPrice}
          step={10}
          value={[
            Math.max(filters.priceRange[0], stats.minPrice),
            Math.min(filters.priceRange[1], stats.maxPrice),
          ]}
          onValueChange={([min, max]) => setFilters({ priceRange: [min, max] })}
          className="mb-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatPrice(filters.priceRange[0])}</span>
          <span>{formatPrice(filters.priceRange[1])}</span>
        </div>
      </div>

      {/* Departure time */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Departure time</p>
        <div className="space-y-1.5">
          {TIME_BUCKETS.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.timeBuckets.includes(t.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...filters.timeBuckets, t.value]
                    : filters.timeBuckets.filter((v) => v !== t.value);
                  setFilters({ timeBuckets: next });
                }}
                className="size-3.5 rounded border-border accent-[#C59746]"
              />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Max duration */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Max duration
          {filters.maxDuration > 0 && (
            <span className="ml-1 font-normal">({formatDuration(filters.maxDuration)})</span>
          )}
        </p>
        <Slider
          min={stats.minDuration}
          max={stats.maxDuration}
          step={30}
          value={[filters.maxDuration || stats.maxDuration]}
          onValueChange={([v]) => setFilters({ maxDuration: v >= stats.maxDuration ? 0 : v })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create flight-filter-sheet.tsx (mobile bottom sheet)**

```typescript
// apps/ota/src/components/flights/flight-filter-sheet.tsx
"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FlightFilters } from "./flight-filters";
import { useFlightSearch, type FlightOffer } from "./flight-search-store";

interface FlightFilterSheetProps {
  results: FlightOffer[];
  filteredCount: number;
}

export function FlightFilterSheet({ results, filteredCount }: FlightFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const { filters } = useFlightSearch();

  const activeCount =
    (filters.stops.length > 0 ? 1 : 0) +
    (filters.airlines.length > 0 ? 1 : 0) +
    (filters.timeBuckets.length > 0 ? 1 : 0) +
    (filters.maxDuration > 0 ? 1 : 0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="lg:hidden"
      >
        <SlidersHorizontal className="mr-1.5 size-3.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-1.5 rounded-full bg-[#C59746] px-1.5 text-[10px] text-white">
            {activeCount}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filter Flights</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6 pt-4">
            <FlightFilters results={results} />
            <Button
              onClick={() => setOpen(false)}
              className="mt-6 w-full bg-[#C59746] text-white hover:bg-[#B08638]"
            >
              Show {filteredCount} flight{filteredCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 5: Verify all filter components compile**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/ota/src/components/flights/flight-sort-pills.tsx \
       apps/ota/src/components/flights/flight-filters.tsx \
       apps/ota/src/components/flights/flight-filter-sheet.tsx \
       apps/ota/src/components/ui/slider.tsx
git commit -m "feat(ota): flight sort pills, filter sidebar, and mobile filter sheet"
```

---

### Task 6: AI Insights Panel

**Files:**
- Create: `apps/ota/src/components/flights/flight-insights.tsx`

Three insight components: AI savings tip, price insight bar, direct flights banner. All data comes from the Zustand store (populated by the client wrapper in Task 9).

- [ ] **Step 1: Create flight-insights.tsx**

```typescript
// apps/ota/src/components/flights/flight-insights.tsx
"use client";

import { Sparkles, TrendingDown, Plane } from "lucide-react";

import { formatPrice } from "@/lib/flight-utils";
import { openChat } from "@/components/chat/chat-widget";
import { useFlightSearch } from "./flight-search-store";

/** AI Savings Tip — compares selected date vs cheapest date */
export function SavingsTip() {
  const { priceDates, departureDate, origin, destination } = useFlightSearch();

  if (priceDates.length === 0 || !departureDate) return null;

  const selectedPrice = priceDates.find((d) => d.date === departureDate)?.price;
  const cheapest = priceDates.reduce(
    (min, d) => (d.price < min.price ? d : min),
    priceDates[0],
  );

  if (!selectedPrice || !cheapest || cheapest.date === departureDate) return null;

  const savings = selectedPrice - cheapest.price;
  if (savings < 20) return null;

  const cheapDate = new Date(cheapest.date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const message = `I'm searching ${origin} to ${destination}. You mentioned I could save ${formatPrice(savings)} by flying on ${cheapDate} instead. Can you help me find the best deal?`;

  return (
    <button
      onClick={() => openChat(message)}
      className="flex w-full items-start gap-3 rounded-xl bg-[#1A1A1A] px-4 py-3 text-left transition-colors hover:bg-[#2a2a2a]"
    >
      <Sparkles className="mt-0.5 size-4 shrink-0 text-[#C59746]" />
      <div>
        <p className="text-sm font-medium text-white">
          Save {formatPrice(savings)} — Flying on {cheapDate} instead could save you{" "}
          {formatPrice(savings)} per person
        </p>
        <p className="mt-0.5 text-xs text-white/60">Ask our AI concierge for more tips</p>
      </div>
    </button>
  );
}

/** Price Insight Bar — shows where current prices fall historically */
export function PriceInsightBar() {
  const { priceMetrics, origin, destination, departureDate } = useFlightSearch();

  if (!priceMetrics || !departureDate) return null;

  const month = new Date(departureDate + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
  });
  const level =
    priceMetrics.median <= priceMetrics.firstQuartile
      ? "low"
      : priceMetrics.median <= priceMetrics.thirdQuartile
        ? "typical"
        : "high";

  const config = {
    low: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Low prices" },
    typical: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Typical prices" },
    high: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", label: "High prices" },
  }[level];

  return (
    <div className={`flex items-center gap-2 rounded-xl border ${config.border} ${config.bg} px-4 py-2.5`}>
      <TrendingDown className={`size-4 ${config.text}`} />
      <p className={`text-sm ${config.text}`}>
        <span className="font-medium">{config.label}</span> for {origin} → {destination} in{" "}
        {month}. Prices typically range {formatPrice(priceMetrics.min)}–
        {formatPrice(priceMetrics.max)}.
      </p>
    </div>
  );
}

/** Direct Flights Banner — shows airlines with nonstop service */
export function DirectFlightsBanner() {
  const { directDestinations, destination, origin } = useFlightSearch();

  // directDestinations contains destinations reachable nonstop from origin
  // Check if destination is in the list
  const hasDirect = directDestinations.some(
    (d) => d.iataCode === destination,
  );

  if (!hasDirect || directDestinations.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
      <Plane className="size-4 text-blue-600" />
      <p className="text-sm text-blue-700">
        Direct flights available from {origin} to {destination}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota build 2>&1 | tail -10`

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/components/flights/flight-insights.tsx
git commit -m "feat(ota): AI savings tip, price insight bar, and direct flights banner"
```

---

### Task 7: Round-Trip Flow Components

**Files:**
- Create: `apps/ota/src/components/flights/round-trip-bar.tsx`
- Create: `apps/ota/src/components/flights/flight-confirmation.tsx`

The round-trip flow has 3 steps: select outbound → select return → confirmation. The bar shows the selected outbound flight as a compact summary. The confirmation shows both flights with total price.

- [ ] **Step 1: Create round-trip-bar.tsx**

```typescript
// apps/ota/src/components/flights/round-trip-bar.tsx
"use client";

import { ArrowRight } from "lucide-react";
import { formatPrice, formatIsoDuration, countStops } from "@/lib/flight-utils";
import { useFlightSearch } from "./flight-search-store";

export function RoundTripBar() {
  const { selectedOutbound, changeOutbound } = useFlightSearch();

  if (!selectedOutbound) return null;

  const seg = selectedOutbound.segments;
  const first = seg[0];
  const last = seg[seg.length - 1];
  const stops = countStops(seg);

  const departTime = new Date(first.departure.at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const arriveTime = new Date(last.arrival.at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-[#C59746]/30 bg-[#C59746]/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-[#1A1A1A] text-xs font-bold text-white">
          {selectedOutbound.validatingAirline}
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-[#1A1A1A]">
            <span>{first.departure.iataCode}</span>
            <ArrowRight className="size-3" />
            <span>{last.arrival.iataCode}</span>
            <span className="text-muted-foreground">·</span>
            <span>{departTime} – {arriveTime}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {stops === 0 ? "Nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`} ·{" "}
            {formatPrice(selectedOutbound.price.perTraveler, selectedOutbound.price.currency)}/person
          </p>
        </div>
      </div>
      <button
        onClick={changeOutbound}
        className="text-xs font-medium text-[#C59746] hover:underline"
      >
        Change
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create flight-confirmation.tsx**

```typescript
// apps/ota/src/components/flights/flight-confirmation.tsx
"use client";

import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPrice, formatIsoDuration, countStops } from "@/lib/flight-utils";
import { useFlightSearch } from "./flight-search-store";

function ConfirmSegment({
  label,
  offer,
}: {
  label: string;
  offer: NonNullable<ReturnType<typeof useFlightSearch>["selectedOutbound"]>;
}) {
  const seg = offer.segments;
  const first = seg[0];
  const last = seg[seg.length - 1];
  const stops = countStops(seg);

  const departTime = new Date(first.departure.at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const arriveTime = new Date(last.arrival.at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const departDate = new Date(first.departure.at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-lg font-bold text-[#1A1A1A]">
            <span>{first.departure.iataCode}</span>
            <ArrowRight className="size-4" />
            <span>{last.arrival.iataCode}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {departDate} · {departTime} – {arriveTime}
          </p>
          <p className="text-xs text-muted-foreground">
            {offer.validatingAirline} {first.flightNumber} · {stops === 0 ? "Nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-[#1A1A1A]">
            {formatPrice(offer.price.perTraveler, offer.price.currency)}
          </p>
          <p className="text-[10px] text-muted-foreground">per person</p>
        </div>
      </div>
      {/* Fare details */}
      <div className="mt-3 flex flex-wrap gap-2">
        {offer.fareFamily && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs">{offer.fareFamily}</span>
        )}
        {offer.baggageAllowance?.checked && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs">
            {offer.baggageAllowance.checked.quantity} checked bag
            {offer.baggageAllowance.checked.quantity > 1 ? "s" : ""}
          </span>
        )}
        {offer.fareRules?.refundable && (
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
            Refundable
          </span>
        )}
      </div>
    </div>
  );
}

export function FlightConfirmation() {
  const {
    selectedOutbound,
    selectedReturn,
    tripType,
    adults,
    children,
    setShowRequestForm,
    changeOutbound,
  } = useFlightSearch();

  if (!selectedOutbound) return null;

  const travelerCount = adults + children;
  const outboundTotal = parseFloat(selectedOutbound.price.total);
  const returnTotal = selectedReturn ? parseFloat(selectedReturn.price.total) : 0;
  const grandTotal = (outboundTotal + returnTotal) * travelerCount;
  const currency = selectedOutbound.price.currency;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[#1A1A1A]">Confirm Your Selection</h2>

      <ConfirmSegment label="Departure" offer={selectedOutbound} />
      {selectedReturn && <ConfirmSegment label="Return" offer={selectedReturn} />}

      {/* Total */}
      <div className="rounded-xl border border-[#C59746]/30 bg-[#C59746]/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Total for {travelerCount} traveler{travelerCount > 1 ? "s" : ""}
            </p>
          </div>
          <p className="text-2xl font-bold text-[#1A1A1A]">{formatPrice(grandTotal, currency)}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={changeOutbound}
          className="flex-1"
        >
          Start Over
        </Button>
        <Button
          onClick={() => setShowRequestForm(true)}
          className="flex-1 bg-[#C59746] text-white hover:bg-[#B08638]"
        >
          <Check className="mr-2 size-4" />
          Request This Flight
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify both compile**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/components/flights/round-trip-bar.tsx apps/ota/src/components/flights/flight-confirmation.tsx
git commit -m "feat(ota): round-trip selection bar and flight confirmation card"
```

---

### Task 8: Flight Request Form + Success Screen

**Files:**
- Create: `apps/ota/src/components/flights/flight-request-form.tsx`
- Create: `apps/ota/src/components/flights/flight-request-success.tsx`

Guest checkout form that submits to `POST /ota/leads/flight-requests`. Minimal fields: name, email, phone, special requests.

- [ ] **Step 1: Create flight-request-form.tsx**

```typescript
// apps/ota/src/components/flights/flight-request-form.tsx
"use client";

import { useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { serviceFetch } from "@/lib/api";
import { useFlightSearch } from "./flight-search-store";
import { FlightRequestSuccess } from "./flight-request-success";

export function FlightRequestForm() {
  const {
    selectedOutbound,
    selectedReturn,
    tripType,
    adults,
    children,
    travelClass,
    setShowRequestForm,
  } = useFlightSearch();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!selectedOutbound) return null;

  if (success) return <FlightRequestSuccess />;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const outSeg = selectedOutbound.segments;
    const firstOut = outSeg[0];
    const lastOut = outSeg[outSeg.length - 1];

    const body: Record<string, unknown> = {
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      travelers: adults + children,
      travelClass,
      specialRequests: fd.get("specialRequests") || undefined,
      amadeusOfferId: selectedOutbound.id,
      outboundFlight: {
        airline: selectedOutbound.validatingAirline,
        flightNumber: firstOut.flightNumber,
        origin: firstOut.departure.iataCode,
        destination: lastOut.arrival.iataCode,
        departureTime: new Date(firstOut.departure.at).toTimeString().slice(0, 8),
        arrivalTime: new Date(lastOut.arrival.at).toTimeString().slice(0, 8),
        duration: firstOut.duration,
        stops: outSeg.reduce((s, seg) => s + seg.stops, 0) + Math.max(0, outSeg.length - 1),
        fareClass: selectedOutbound.fareFamily || selectedOutbound.cabin || travelClass,
        price: parseFloat(selectedOutbound.price.perTraveler),
        currency: selectedOutbound.price.currency,
      },
    };

    if (selectedReturn) {
      const retSeg = selectedReturn.segments;
      const firstRet = retSeg[0];
      const lastRet = retSeg[retSeg.length - 1];
      body.returnFlight = {
        airline: selectedReturn.validatingAirline,
        flightNumber: firstRet.flightNumber,
        origin: firstRet.departure.iataCode,
        destination: lastRet.arrival.iataCode,
        departureTime: new Date(firstRet.departure.at).toTimeString().slice(0, 8),
        arrivalTime: new Date(lastRet.arrival.at).toTimeString().slice(0, 8),
        duration: firstRet.duration,
        stops: retSeg.reduce((s, seg) => s + seg.stops, 0) + Math.max(0, retSeg.length - 1),
        fareClass: selectedReturn.fareFamily || selectedReturn.cabin || travelClass,
        price: parseFloat(selectedReturn.price.perTraveler),
        currency: selectedReturn.price.currency,
      };
    }

    try {
      await serviceFetch("/ota/leads/flight-requests", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSuccess(true);
    } catch (err) {
      setError("Failed to submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <button
        onClick={() => setShowRequestForm(false)}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-[#1A1A1A]"
      >
        <ArrowLeft className="size-3.5" /> Back to confirmation
      </button>

      <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-[#1A1A1A]">Request This Flight</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          An advisor will confirm your booking within 2 hours.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input id="name" name="name" required placeholder="Jane Smith" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="jane@example.com" />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" required placeholder="+1 (416) 555-0123" />
          </div>
          <div>
            <Label htmlFor="specialRequests">Special Requests (optional)</Label>
            <Textarea
              id="specialRequests"
              name="specialRequests"
              placeholder="Wheelchair assistance, extra bags, seating preferences..."
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#C59746] text-white hover:bg-[#B08638]"
          >
            {submitting ? (
              <><Loader2 className="mr-2 size-4 animate-spin" /> Submitting...</>
            ) : (
              "Submit Flight Request"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create flight-request-success.tsx**

```typescript
// apps/ota/src/components/flights/flight-request-success.tsx
"use client";

import { CheckCircle, MessageCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { openChat } from "@/components/chat/chat-widget";
import { useFlightSearch } from "./flight-search-store";

export function FlightRequestSuccess() {
  const { origin, destination, reset } = useFlightSearch();

  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
      <CheckCircle className="mx-auto mb-4 size-12 text-emerald-500" />
      <h2 className="mb-2 text-xl font-semibold text-[#1A1A1A]">Flight Request Submitted</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        We&apos;ve received your flight request for {origin} → {destination}. An advisor will
        confirm your booking and reach out within 2 hours.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button
          variant="outline"
          onClick={() => {
            reset();
            window.location.href = "/search/flights";
          }}
        >
          Search Another Flight
        </Button>
        <Button
          onClick={() =>
            openChat(
              `I just submitted a flight request for ${origin} to ${destination}. Can you help me with anything else for this trip?`,
            )
          }
          className="bg-[#C59746] text-white hover:bg-[#B08638]"
        >
          <MessageCircle className="mr-2 size-4" />
          Talk to AI Concierge
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify both compile**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
git add apps/ota/src/components/flights/flight-request-form.tsx apps/ota/src/components/flights/flight-request-success.tsx
git commit -m "feat(ota): flight request checkout form and success confirmation"
```

---

### Task 9: Client Wrapper + Page Orchestration

**Files:**
- Create: `apps/ota/src/components/flights/flight-search-client.tsx`
- Rewrite: `apps/ota/src/app/search/flights/page.tsx`
- Update: `apps/ota/src/app/search/flights/loading.tsx`

This is the main orchestration task. The server component page fetches initial results. The client wrapper manages the entire interactive results area: enrichment fetches, round-trip flow, filters, sorting, and the checkout funnel.

- [ ] **Step 1: Create flight-search-client.tsx (the main client orchestrator)**

```typescript
// apps/ota/src/components/flights/flight-search-client.tsx
"use client";

import { useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";

import { serviceFetch } from "@/lib/api";
import { sortFlights, applyFilters } from "@/lib/flight-utils";
import {
  useFlightSearch,
  type FlightOffer,
  type PriceDate,
  type PriceMetrics,
  type DirectDestination,
} from "./flight-search-store";
import { FlightSearchForm } from "./flight-search-form";
import { PriceCalendar } from "./price-calendar";
import { PriceDateStrip } from "./price-date-strip";
import { FlightCard } from "./flight-card";
import { FlightSortPills } from "./flight-sort-pills";
import { FlightFilters } from "./flight-filters";
import { FlightFilterSheet } from "./flight-filter-sheet";
import { SavingsTip, PriceInsightBar, DirectFlightsBanner } from "./flight-insights";
import { RoundTripBar } from "./round-trip-bar";
import { FlightConfirmation } from "./flight-confirmation";
import { FlightRequestForm } from "./flight-request-form";

interface FlightSearchClientProps {
  initialResults: FlightOffer[];
  searchError?: string | null;
}

export function FlightSearchClient({
  initialResults,
  searchError,
}: FlightSearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const store = useFlightSearch();

  // Sync URL params to store on mount
  useEffect(() => {
    const origin = searchParams.get("origin") || "";
    const destination = searchParams.get("destination") || "";
    const departureDate = searchParams.get("departureDate") || "";
    const returnDate = searchParams.get("returnDate") || "";
    const adults = parseInt(searchParams.get("adults") || "1");
    const children = parseInt(searchParams.get("children") || "0");
    const travelClass = searchParams.get("travelClass") || "ECONOMY";
    const tripType = returnDate ? "round-trip" : "one-way";

    store.setSearchParams({
      origin, destination, departureDate, returnDate, adults, children, travelClass,
    });
    store.setTripType(tripType);
    store.setOutboundResults(initialResults);
    if (searchError) store.setSearchError(searchError);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch enrichment data in parallel (non-blocking)
  useEffect(() => {
    const origin = searchParams.get("origin");
    const destination = searchParams.get("destination");
    const departureDate = searchParams.get("departureDate");
    if (!origin || !destination || !departureDate) return;

    // Price metrics
    store.setPriceMetricsLoading(true);
    serviceFetch<{ metrics: PriceMetrics | null }>(
      `/ota/search/flight-price-metrics?origin=${origin}&destination=${destination}&departureDate=${departureDate}`,
    )
      .then((res) => store.setPriceMetrics(res.metrics ?? null))
      .catch(() => {})
      .finally(() => store.setPriceMetricsLoading(false));

    // Direct destinations
    store.setDirectDestinationsLoading(true);
    serviceFetch<{ destinations: DirectDestination[] }>(
      `/ota/search/direct-destinations?airport=${origin}`,
    )
      .then((res) => store.setDirectDestinations(res.destinations ?? []))
      .catch(() => {})
      .finally(() => store.setDirectDestinationsLoading(false));

    // Upsell (top result only)
    if (initialResults.length > 0) {
      store.setUpsellLoading(true);
      serviceFetch<{ alternatives: FlightOffer[] }>("/ota/search/flight-upsell", {
        method: "POST",
        body: JSON.stringify({ flightOffers: [initialResults[0]] }),
      })
        .then((res) => store.setUpsellOffers(res.alternatives ?? []))
        .catch(() => {})
        .finally(() => store.setUpsellLoading(false));
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Determine which results to show based on round-trip step
  const activeResults = store.roundTripStep === "return" ? store.returnResults : store.outboundResults;

  // Apply client-side filters and sorting
  const filteredResults = useMemo(
    () => sortFlights(applyFilters(activeResults, store.filters), store.sort),
    [activeResults, store.filters, store.sort],
  );

  // Handle date selection from price calendar
  const handleDateSelect = useCallback(
    (date: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("departureDate", date);
      router.push(`/search/flights?${params.toString()}`);
    },
    [router, searchParams],
  );

  // Handle flight selection
  const handleSelectFlight = useCallback(
    (offer: FlightOffer) => {
      if (store.tripType === "round-trip" && store.roundTripStep === "outbound") {
        store.selectOutbound(offer);
        // Fetch return flights (separate search: destination → origin on returnDate)
        const returnDate = searchParams.get("returnDate");
        const destination = searchParams.get("destination");
        const origin = searchParams.get("origin");
        const adults = searchParams.get("adults") || "1";
        const children = searchParams.get("children") || "0";
        const travelClass = searchParams.get("travelClass") || "ECONOMY";

        if (returnDate && destination && origin) {
          store.setIsSearching(true);
          const qs = new URLSearchParams({
            origin: destination,
            destination: origin,
            departureDate: returnDate,
            adults,
            travelClass,
          });
          if (children !== "0") qs.set("children", children);

          serviceFetch<{ results: FlightOffer[] }>(`/ota/search/flights?${qs}`)
            .then((res) => store.setReturnResults(res.results ?? []))
            .catch(() => store.setSearchError("Failed to load return flights"))
            .finally(() => store.setIsSearching(false));
        }
      } else if (store.tripType === "round-trip" && store.roundTripStep === "return") {
        store.selectReturn(offer);
      } else {
        // One-way: go straight to confirm
        store.selectOutbound(offer);
        store.selectReturn(null as unknown as FlightOffer); // Not needed
        // Jump to confirm step
        useFlightSearch.setState({ roundTripStep: "confirm" });
      }
    },
    [store, searchParams],
  );

  const hasSearch = !!(searchParams.get("origin") && searchParams.get("destination") && searchParams.get("departureDate"));
  const departureDate = searchParams.get("departureDate") || "";
  const origin = searchParams.get("origin") || "";
  const destination = searchParams.get("destination") || "";

  // Show checkout form
  if (store.showRequestForm) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FlightSearchForm compact />
        <div className="mt-6">
          <FlightRequestForm />
        </div>
      </div>
    );
  }

  // Show confirmation
  if (store.roundTripStep === "confirm" && store.selectedOutbound) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <FlightSearchForm compact />
        <div className="mt-6">
          <FlightConfirmation />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Search form */}
      <div className={hasSearch ? "mb-4" : "mb-12"}>
        <FlightSearchForm compact={hasSearch} />
      </div>

      {!hasSearch ? (
        <EmptyPrompt />
      ) : store.searchError ? (
        <ErrorState message={store.searchError} />
      ) : (
        <>
          {/* Price calendar (desktop) */}
          <div className="hidden md:block">
            <PriceCalendar
              origin={origin}
              destination={destination}
              selectedDate={departureDate}
              onDateSelect={handleDateSelect}
            />
          </div>

          {/* Price date strip (mobile) */}
          <div className="md:hidden">
            <PriceDateStrip selectedDate={departureDate} onDateSelect={handleDateSelect} />
          </div>

          {/* Insights */}
          <div className="mb-4 space-y-2">
            <SavingsTip />
            <PriceInsightBar />
            <DirectFlightsBanner />
          </div>

          {/* Round trip header */}
          {store.roundTripStep === "outbound" && store.tripType === "round-trip" && (
            <h2 className="mb-3 text-base font-semibold text-[#1A1A1A]">
              Select your departure · {origin} → {destination} · {new Date(departureDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </h2>
          )}
          {store.roundTripStep === "return" && (
            <>
              <RoundTripBar />
              <h2 className="mb-3 text-base font-semibold text-[#1A1A1A]">
                Select your return · {destination} → {origin} · {new Date(searchParams.get("returnDate") + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </h2>
            </>
          )}

          {/* Loading return flights */}
          {store.isSearching && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading return flights...</span>
            </div>
          )}

          {/* Two-column layout: filters + results */}
          {!store.isSearching && activeResults.length > 0 && (
            <div className="flex gap-6">
              {/* Filter sidebar (desktop) */}
              <aside className="hidden w-60 shrink-0 lg:block">
                <div className="sticky top-20 rounded-2xl border border-border bg-white p-4">
                  <FlightFilters results={activeResults} />
                </div>
              </aside>

              {/* Main results */}
              <div className="min-w-0 flex-1">
                {/* Sort + mobile filter */}
                <div className="mb-4 flex items-center justify-between">
                  <FlightSortPills />
                  <FlightFilterSheet results={activeResults} filteredCount={filteredResults.length} />
                </div>

                {/* Result count */}
                <p className="mb-3 text-sm text-muted-foreground">
                  {filteredResults.length} flight{filteredResults.length !== 1 ? "s" : ""}
                  {filteredResults.length < activeResults.length && ` of ${activeResults.length}`}
                </p>

                {/* Live pricing notice */}
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p>Prices may change. Our advisors can lock in the best fare for you.</p>
                </div>

                {/* Flight cards */}
                <div className="space-y-2">
                  {filteredResults.map((offer, i) => (
                    <div key={offer.id}>
                      <FlightCard offer={offer} onSelect={handleSelectFlight} />
                      {/* Insert upsell after 3rd result */}
                      {i === 2 && store.upsellOffers.length > 0 && (
                        <div className="mt-2">
                          <FlightCard
                            offer={store.upsellOffers[0]}
                            onSelect={handleSelectFlight}
                            isUpsell
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {filteredResults.length === 0 && (
                  <div className="rounded-xl border border-border bg-muted/30 px-6 py-12 text-center">
                    <p className="font-medium text-[#1A1A1A]">No flights match your filters</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Try adjusting your filters to see more options.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No results at all */}
          {!store.isSearching && activeResults.length === 0 && (
            <div className="rounded-xl border border-border bg-muted/30 px-6 py-16 text-center">
              <p className="text-lg font-medium text-[#1A1A1A]">No flights found for this route</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try adjusting your dates, destination, or passenger count.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyPrompt() {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
      <p className="text-lg font-medium text-[#1A1A1A]">Enter your route above to see fares</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Provide origin, destination, and departure date to search live availability.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
      <p className="text-lg font-medium text-[#1A1A1A]">Unable to fetch flights</p>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <a
        href="/search/flights"
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-[#1A1A1A] transition-colors hover:bg-gray-100"
      >
        Try Again
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite page.tsx**

```typescript
// apps/ota/src/app/search/flights/page.tsx
import type { Metadata } from "next";

import { serviceFetch } from "@/lib/api";
import { SearchPageShell } from "@/components/search/search-page-shell";
import { FlightSearchClient } from "@/components/flights/flight-search-client";

export const metadata: Metadata = {
  title: "Search Flights | Phoenix Voyages",
  description:
    "Search and compare flights worldwide. Economy, business, and first class options from hundreds of airlines. Expert travel advice from Phoenix Voyages advisors.",
  openGraph: {
    title: "Search Flights | Phoenix Voyages",
    description:
      "Search and compare flights worldwide. Economy, business, and first class options.",
  },
};

interface SearchParams {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  adults?: string;
  children?: string;
  travelClass?: string;
}

interface FlightSearchResponse {
  results: Array<Record<string, unknown>>;
  warning?: string;
}

function hasSearchFilters(params: SearchParams): boolean {
  return !!(params.origin && params.destination && params.departureDate);
}

async function fetchFlights(params: SearchParams) {
  try {
    const qs = new URLSearchParams();
    if (params.origin) qs.set("origin", params.origin);
    if (params.destination) qs.set("destination", params.destination);
    if (params.departureDate) qs.set("departureDate", params.departureDate);
    if (params.returnDate) qs.set("returnDate", params.returnDate);
    if (params.adults) qs.set("adults", params.adults);
    if (params.children && params.children !== "0") qs.set("children", params.children);
    if (params.travelClass) qs.set("travelClass", params.travelClass);

    const res = await serviceFetch<FlightSearchResponse>(`/ota/search/flights?${qs}`);
    return { results: res.results ?? [], error: res.warning ?? null };
  } catch (error) {
    console.error("Failed to fetch flights:", error);
    return { results: [], error: "The flight search service may be temporarily unavailable." };
  }
}

interface FlightsPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function FlightsPage({ searchParams }: FlightsPageProps) {
  const params = await searchParams;
  const hasFilters = hasSearchFilters(params);

  // Server-side fetch of initial results (the blocking core search)
  const data = hasFilters ? await fetchFlights(params) : { results: [], error: null };

  return (
    <SearchPageShell productType="flights">
      <FlightSearchClient
        initialResults={data.results as never[]}
        searchError={data.error}
      />
    </SearchPageShell>
  );
}
```

- [ ] **Step 3: Update loading.tsx**

```typescript
// apps/ota/src/app/search/flights/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function FlightsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Search form skeleton */}
      <Skeleton className="mb-4 h-28 w-full rounded-2xl" />

      {/* Price calendar skeleton */}
      <Skeleton className="mb-6 hidden h-64 w-full rounded-2xl md:block" />

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Filter sidebar skeleton */}
        <div className="hidden w-60 shrink-0 lg:block">
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>

        {/* Results skeleton */}
        <div className="flex-1 space-y-2">
          {/* Sort pills */}
          <div className="mb-4 flex gap-1.5">
            {[80, 90, 85, 95].map((w, i) => (
              <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
            ))}
          </div>

          {/* Flight card skeletons */}
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota build 2>&1 | tail -20`

Expected: Build succeeds. If there are import errors, fix them.

- [ ] **Step 5: Commit**

```bash
git add apps/ota/src/components/flights/flight-search-client.tsx \
       apps/ota/src/app/search/flights/page.tsx \
       apps/ota/src/app/search/flights/loading.tsx
git commit -m "feat(ota): flight search page orchestration with client wrapper and streaming enrichment"
```

---

### Task 10: Browser Verification + Polish

**Files:**
- Possibly modify any files from Tasks 1–9 based on visual testing

Start the dev server and verify the full flow in the browser. Fix layout, spacing, and interaction issues.

- [ ] **Step 1: Start dev server**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && turbo dev` (in tmux pane 2)

- [ ] **Step 2: Navigate to flight search**

Open `http://localhost:3100/search/flights` (note: OTA runs on port from turbo dev, likely 3000 or configured port).

- [ ] **Step 3: Verify empty state**

Expected: Search form shows with trip type toggle, From/To fields, date pickers, travelers, class, and Search button. Below should be the "Enter your route above" empty prompt.

- [ ] **Step 4: Test a search**

Enter: Origin=YYZ, Destination=CUN, Departure=2 weeks from now, Return=3 weeks from now, 2 adults.

Expected:
- Form submits via URL params
- Page reloads with results
- Price calendar appears (desktop) or date strip (mobile)
- Flight cards show with airline badge, times, price
- Filter sidebar appears on left (desktop)
- Sort pills appear above results
- Insights appear between calendar and results (if data available)

- [ ] **Step 5: Test round-trip flow**

Click an outbound flight card.

Expected:
- Outbound summary bar appears at top
- Return flights load (with loading spinner)
- Header changes to "Select your return"

Click a return flight card.

Expected:
- Confirmation screen shows both flights
- Total price calculated
- "Request This Flight" button visible

- [ ] **Step 6: Test checkout**

Click "Request This Flight" → fill form → submit.

Expected:
- Form validates required fields
- Submission hits API
- Success screen shows with "Search Another Flight" and "Talk to AI Concierge" buttons

- [ ] **Step 7: Test filters**

Click stop checkboxes, airline checkboxes, adjust price slider.

Expected: Results filter instantly (client-side, no loading).

- [ ] **Step 8: Test mobile responsive**

Resize browser to mobile width (375px).

Expected:
- Form stacks vertically
- Price date strip replaces calendar
- "Filters" button with bottom sheet replaces sidebar
- Cards are full-width single column

- [ ] **Step 9: Fix any issues found**

Address layout bugs, missing styles, broken interactions.

- [ ] **Step 10: Final build check**

Run: `cd /Users/alguertin/Development/tailfire-project/tailfire && pnpm --filter @tailfire/ota build`

Expected: Clean build with no errors.

- [ ] **Step 11: Commit all fixes**

```bash
git add -A
git commit -m "fix(ota): flight search polish — layout fixes from browser testing"
```

---

## Post-Implementation Notes

**Deferred items not in this plan:**
- Multi-city search (separate spec)
- Logged-in client pre-fill (needs consumer auth)
- Seat map display (Amadeus Seatmap API)
- Self-serve booking (needs Huntington consolidator)
- Payment collection via Stripe

**Known backend gaps (from Codex review, separate concern):**
- Flight request endpoint only logs itinerary, doesn't create trip/activity in Tailfire (fixed to persist in travelPreferences)
- Direct destinations provider returns destination-only data (not airlines)
- Pricing/upsell endpoints use `object[]` instead of typed DTOs
- Amadeus providers bypass BaseExternalApi retry/backoff pattern
