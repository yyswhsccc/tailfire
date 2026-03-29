// ---------------------------------------------------------------------------
// Flight search utilities -- pure functions, no React, no side effects
// ---------------------------------------------------------------------------

// ---- Types ----------------------------------------------------------------

export type SortOption = 'best' | 'cheapest' | 'fastest' | 'departure';
export type TimeBucket = 'morning' | 'afternoon' | 'evening';

export interface FlightFilters {
  stops: number[];          // allowed stop counts, e.g. [0, 1]
  airlines: string[];       // allowed carrier codes
  priceRange: [number, number];
  timeBuckets: TimeBucket[];
  maxDuration: number;      // 0 = no limit (minutes)
}

export const DEFAULT_FILTERS: FlightFilters = {
  stops: [],
  airlines: [],
  priceRange: [0, 0],
  timeBuckets: [],
  maxDuration: 0,
};

// ---- Duration helpers -----------------------------------------------------

/** Parse an ISO 8601 duration string (e.g. "PT7H30M") to total minutes. */
export function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  return hours * 60 + minutes;
}

/** Format total minutes to a human-friendly string like "7h 30m". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Convenience: parse an ISO 8601 duration and format it in one step. */
export function formatIsoDuration(iso: string): string {
  return formatDuration(parseDuration(iso));
}

// ---- Price formatting -----------------------------------------------------

/** Format a price for display using Intl (defaults to CAD). */
export function formatPrice(
  amount: string | number,
  currency = 'CAD',
): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// ---- Time bucketing -------------------------------------------------------

/** Bucket a departure ISO timestamp into morning / afternoon / evening. */
export function getTimeBucket(isoTime: string): TimeBucket {
  const hour = new Date(isoTime).getHours();
  if (hour >= 6 && hour < 12) return 'morning';   // 6am-12pm
  if (hour >= 12 && hour < 18) return 'afternoon'; // 12pm-6pm
  return 'evening';                  // 6pm-6am (overnight)
}

// ---- Stop counting --------------------------------------------------------

/**
 * Total stops for an itinerary.
 * Each segment may have its own intermediate stops, plus connections between
 * consecutive segments count as +1 each.
 */
export function countStops(segments: { stops: number }[]): number {
  if (segments.length === 0) return 0;
  const intraSegmentStops = segments.reduce((sum, s) => sum + s.stops, 0);
  const connections = segments.length - 1;
  return intraSegmentStops + connections;
}

// ---- Airline extraction ---------------------------------------------------

interface FlightOfferLike {
  segments: { carrier: string; carrierName?: string }[];
}

/** Extract unique airlines with frequency counts, sorted most-frequent first. */
export function extractAirlines(
  results: FlightOfferLike[],
): { code: string; name: string; count: number }[] {
  const map = new Map<string, { name: string; count: number }>();

  for (const offer of results) {
    const seen = new Set<string>();
    for (const seg of offer.segments) {
      if (!seen.has(seg.carrier)) {
        seen.add(seg.carrier);
        const entry = map.get(seg.carrier);
        if (entry) {
          entry.count += 1;
          if (seg.carrierName && !entry.name) entry.name = seg.carrierName;
        } else {
          map.set(seg.carrier, { name: seg.carrierName || seg.carrier, count: 1 });
        }
      }
    }
  }

  return Array.from(map.entries())
    .map(([code, { name, count }]) => ({ code, name, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- Sorting --------------------------------------------------------------

interface SortableOffer {
  price: { total: string };
  segments: { duration: string; stops: number; departure: { at: string } }[];
}

/** Sort flight offers by the given strategy. Returns a new array. */
export function sortFlights<T extends SortableOffer>(
  flights: T[],
  sort: SortOption,
): T[] {
  const copy = [...flights];

  const totalDuration = (f: SortableOffer) =>
    f.segments.reduce((sum, s) => sum + parseDuration(s.duration), 0);

  const totalStops = (f: SortableOffer) => countStops(f.segments);

  switch (sort) {
    case 'cheapest':
      return copy.sort(
        (a, b) => parseFloat(a.price.total) - parseFloat(b.price.total),
      );

    case 'fastest':
      return copy.sort((a, b) => totalDuration(a) - totalDuration(b));

    case 'departure':
      return copy.sort((a, b) => {
        const aTime = a.segments[0]?.departure.at ?? '';
        const bTime = b.segments[0]?.departure.at ?? '';
        return aTime.localeCompare(bTime);
      });

    case 'best':
    default: {
      // Weighted score: price 40%, duration 40%, stops 20%.
      // Normalise each dimension relative to the dataset range.
      if (copy.length === 0) return copy;

      const prices = copy.map((f) => parseFloat(f.price.total));
      const durations = copy.map(totalDuration);
      const stops = copy.map(totalStops);

      const norm = (val: number, min: number, max: number) =>
        max === min ? 0 : (val - min) / (max - min);

      const pMin = Math.min(...prices);
      const pMax = Math.max(...prices);
      const dMin = Math.min(...durations);
      const dMax = Math.max(...durations);
      const sMin = Math.min(...stops);
      const sMax = Math.max(...stops);

      return copy.sort((a, b) => {
        const scoreA =
          0.4 * norm(parseFloat(a.price.total), pMin, pMax) +
          0.4 * norm(totalDuration(a), dMin, dMax) +
          0.2 * norm(totalStops(a), sMin, sMax);
        const scoreB =
          0.4 * norm(parseFloat(b.price.total), pMin, pMax) +
          0.4 * norm(totalDuration(b), dMin, dMax) +
          0.2 * norm(totalStops(b), sMin, sMax);
        return scoreA - scoreB;
      });
    }
  }
}

// ---- Filtering ------------------------------------------------------------

interface FilterableOffer {
  price: { total: string };
  segments: {
    carrier: string;
    duration: string;
    stops: number;
    departure: { at: string };
  }[];
}

/** Apply client-side filters. Returns a new array of matching offers. */
export function applyFilters<T extends FilterableOffer>(
  flights: T[],
  filters: FlightFilters,
): T[] {
  return flights.filter((f) => {
    // Stops filter
    if (filters.stops.length > 0) {
      const total = countStops(f.segments);
      if (!filters.stops.includes(total)) return false;
    }

    // Airlines filter
    if (filters.airlines.length > 0) {
      const carriers = f.segments.map((s) => s.carrier);
      if (!carriers.some((c) => filters.airlines.includes(c))) return false;
    }

    // Price range filter (skip when both ends are 0 = no constraint)
    if (filters.priceRange[0] !== 0 || filters.priceRange[1] !== 0) {
      const price = parseFloat(f.price.total);
      if (price < filters.priceRange[0] || price > filters.priceRange[1])
        return false;
    }

    // Time bucket filter
    if (filters.timeBuckets.length > 0) {
      const departureTime = f.segments[0]?.departure.at;
      if (departureTime) {
        const bucket = getTimeBucket(departureTime);
        if (!filters.timeBuckets.includes(bucket)) return false;
      }
    }

    // Max duration filter (0 = no limit)
    if (filters.maxDuration > 0) {
      const total = f.segments.reduce(
        (sum, s) => sum + parseDuration(s.duration),
        0,
      );
      if (total > filters.maxDuration) return false;
    }

    return true;
  });
}
