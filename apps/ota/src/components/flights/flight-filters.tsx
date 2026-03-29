"use client";

import { useMemo } from "react";
import { useFlightSearch, type FlightOffer } from "./flight-search-store";
import {
  extractAirlines,
  formatPrice,
  formatDuration,
  parseDuration,
  countStops,
  DEFAULT_FILTERS,
  type FlightFilters as FlightFiltersType,
  type TimeBucket,
} from "@/lib/flight-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlightFiltersProps {
  results: FlightOffer[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_BUCKETS: { value: TimeBucket; label: string }[] = [
  { value: "morning", label: "Morning (6am\u201312pm)" },
  { value: "afternoon", label: "Afternoon (12pm\u20136pm)" },
  { value: "evening", label: "Evening (6pm\u201312am)" },
];

const STOP_LABELS: Record<number, string> = {
  0: "Nonstop",
  1: "1 stop",
  2: "2+ stops",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlightFilters({ results }: FlightFiltersProps) {
  const filters = useFlightSearch((s) => s.filters);
  const setFilters = useFlightSearch((s) => s.setFilters);

  // ---- Computed stats from unfiltered results ----

  const stats = useMemo(() => {
    if (results.length === 0)
      return {
        minPrice: 0,
        maxPrice: 0,
        minDuration: 0,
        maxDuration: 0,
        airlines: [] as { code: string; name: string; count: number }[],
        stopOptions: [] as { stops: number; cheapest: number }[],
      };

    const prices = results.map((r) => parseFloat(r.price.total));
    const durations = results.map((r) =>
      r.segments.reduce((sum, s) => sum + parseDuration(s.duration), 0),
    );

    // Stop options with cheapest price per stop count
    const stopMap = new Map<number, number>();
    for (const r of results) {
      const stops = Math.min(countStops(r.segments), 2); // bucket 2+
      const price = parseFloat(r.price.total);
      const current = stopMap.get(stops);
      if (current === undefined || price < current) {
        stopMap.set(stops, price);
      }
    }
    const stopOptions = Array.from(stopMap.entries())
      .map(([stops, cheapest]) => ({ stops, cheapest }))
      .sort((a, b) => a.stops - b.stops);

    return {
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      airlines: extractAirlines(results),
      stopOptions,
    };
  }, [results]);

  // ---- Helpers ----

  const update = (partial: Partial<FlightFiltersType>) => {
    setFilters({ ...filters, ...partial });
  };

  const hasActiveFilters =
    filters.stops.length > 0 ||
    filters.airlines.length > 0 ||
    (filters.priceRange[0] !== 0 || filters.priceRange[1] !== 0) ||
    filters.timeBuckets.length > 0 ||
    filters.maxDuration > 0;

  const clearAll = () => setFilters({ ...DEFAULT_FILTERS });

  const toggleArrayItem = <T,>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];

  // ---- Currency for display ----
  const currency = results[0]?.price.currency ?? "CAD";

  // ---- Effective price range for slider ----
  const effectivePriceRange: [number, number] =
    filters.priceRange[0] !== 0 || filters.priceRange[1] !== 0
      ? filters.priceRange
      : [stats.minPrice, stats.maxPrice];

  // ---- Effective max duration for slider ----
  const effectiveMaxDuration =
    filters.maxDuration > 0 ? filters.maxDuration : stats.maxDuration;

  if (results.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-[#1A1A1A]">
            Filters
          </CardTitle>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-[#C59746] hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stops */}
        {stats.stopOptions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Stops
            </p>
            <div className="space-y-1.5">
              {stats.stopOptions.map(({ stops, cheapest }) => (
                <label
                  key={stops}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={filters.stops.includes(stops)}
                    onChange={() => update({ stops: toggleArrayItem(filters.stops, stops) })}
                    className="size-4 rounded border-border accent-[#C59746]"
                  />
                  <span className="flex-1">{STOP_LABELS[stops] ?? `${stops} stops`}</span>
                  <span className="text-xs text-muted-foreground">
                    from {formatPrice(cheapest, currency)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Airlines */}
        {stats.airlines.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Airlines
            </p>
            <div className="max-h-[160px] space-y-1.5 overflow-y-auto">
              {stats.airlines.map((airline) => (
                <label
                  key={airline.code}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={filters.airlines.includes(airline.code)}
                    onChange={() =>
                      update({ airlines: toggleArrayItem(filters.airlines, airline.code) })
                    }
                    className="size-4 rounded border-border accent-[#C59746]"
                  />
                  <span className="flex-1 truncate">{airline.name}</span>
                  <span className="text-xs text-muted-foreground">{airline.count}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Price range */}
        {stats.maxPrice > stats.minPrice && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Price range
            </p>
            <Slider
              min={Math.floor(stats.minPrice)}
              max={Math.ceil(stats.maxPrice)}
              value={[
                Math.floor(effectivePriceRange[0]),
                Math.ceil(effectivePriceRange[1]),
              ]}
              onValueChange={(val) => {
                const v = val as number[];
                update({ priceRange: [v[0] ?? stats.minPrice, v[1] ?? stats.maxPrice] });
              }}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatPrice(effectivePriceRange[0], currency)}</span>
              <span>{formatPrice(effectivePriceRange[1], currency)}</span>
            </div>
          </div>
        )}

        <Separator />

        {/* Departure time */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Departure time
          </p>
          <div className="space-y-1.5">
            {TIME_BUCKETS.map(({ value, label }) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={filters.timeBuckets.includes(value)}
                  onChange={() =>
                    update({
                      timeBuckets: toggleArrayItem(filters.timeBuckets, value),
                    })
                  }
                  className="size-4 rounded border-border accent-[#C59746]"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <Separator />

        {/* Max duration */}
        {stats.maxDuration > stats.minDuration && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Max duration
            </p>
            <Slider
              min={stats.minDuration}
              max={stats.maxDuration}
              value={[effectiveMaxDuration]}
              onValueChange={(val) => {
                const v = val as number[];
                const raw = v[0] ?? stats.maxDuration;
                const newVal = raw >= stats.maxDuration ? 0 : raw;
                update({ maxDuration: newVal });
              }}
            />
            <p className="text-xs text-muted-foreground">
              {filters.maxDuration > 0
                ? formatDuration(filters.maxDuration)
                : "No limit"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
