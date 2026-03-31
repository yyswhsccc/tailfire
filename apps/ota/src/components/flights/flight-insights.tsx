'use client';

import { Sparkles, TrendingDown, Plane } from 'lucide-react';
import { useFlightSearch } from './flight-search-store';
import { formatPrice } from '@/lib/flight-utils';
import { openChat } from '@/components/chat/chat-widget';

// ---------------------------------------------------------------------------
// 1. SavingsTip
// ---------------------------------------------------------------------------

export function SavingsTip() {
  const priceDates = useFlightSearch((s) => s.priceDates);
  const departureDate = useFlightSearch((s) => s.departureDate);
  const origin = useFlightSearch((s) => s.origin);
  const destination = useFlightSearch((s) => s.destination);

  if (!departureDate || priceDates.length === 0) return null;

  const selectedEntry = priceDates.find((pd) => pd.date === departureDate);
  if (!selectedEntry) return null;

  const cheapest = priceDates.reduce((min, pd) =>
    pd.price < min.price ? pd : min,
  );

  const savings = selectedEntry.price - cheapest.price;
  if (savings < 20) return null;

  const cheapDate = new Date(cheapest.date + 'T00:00:00').toLocaleDateString(
    'en-CA',
    { month: 'short', day: 'numeric' },
  );

  const formattedSavings = formatPrice(savings, cheapest.currency);

  const chatMessage = `I'm searching ${origin} to ${destination}. You mentioned I could save ${formattedSavings} by flying on ${cheapDate} instead. Can you help me find the best deal?`;

  return (
    <button
      type="button"
      onClick={() => openChat(chatMessage)}
      className="w-full rounded-xl bg-[#1A1A1A] p-4 text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-[#C59746]" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">
            Save {formattedSavings} &mdash; Flying on {cheapDate} instead could
            save you {formattedSavings} per person
          </p>
          <p className="mt-1 text-xs text-white/60">
            Ask our AI concierge for more tips
          </p>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// 2. PriceInsightBar
// ---------------------------------------------------------------------------

const LEVEL_STYLES = {
  low: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    label: 'Low',
  },
  typical: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    label: 'Typical',
  },
  high: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    label: 'High',
  },
} as const;

export function PriceInsightBar() {
  const priceMetrics = useFlightSearch((s) => s.priceMetrics);
  const origin = useFlightSearch((s) => s.origin);
  const destination = useFlightSearch((s) => s.destination);
  const departureDate = useFlightSearch((s) => s.departureDate);

  if (!priceMetrics || !departureDate) return null;

  const { median, firstQuartile, thirdQuartile, min, max, currencyCode } =
    priceMetrics;

  let level: 'low' | 'typical' | 'high';
  if (median <= firstQuartile) {
    level = 'low';
  } else if (median <= thirdQuartile) {
    level = 'typical';
  } else {
    level = 'high';
  }

  const style = LEVEL_STYLES[level];

  const month = new Date(departureDate + 'T00:00:00').toLocaleDateString(
    'en-CA',
    { month: 'long' },
  );

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-4 ${style.bg} ${style.border}`}
    >
      <TrendingDown className={`size-5 shrink-0 ${style.text}`} />
      <p className={`text-sm font-medium ${style.text}`}>
        {style.label} for {origin} &rarr; {destination} in {month}. Prices
        typically range {formatPrice(min, currencyCode)}&ndash;
        {formatPrice(max, currencyCode)}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. DirectFlightsBanner
// ---------------------------------------------------------------------------

export function DirectFlightsBanner() {
  const directDestinations = useFlightSearch((s) => s.directDestinations);
  const destination = useFlightSearch((s) => s.destination);
  const origin = useFlightSearch((s) => s.origin);

  if (
    !destination ||
    directDestinations.length === 0 ||
    !directDestinations.some((d) => d.iataCode === destination)
  ) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <Plane className="size-5 shrink-0 text-blue-700" />
      <p className="text-sm font-medium text-blue-700">
        Direct flights available from {origin} to {destination}
      </p>
    </div>
  );
}
