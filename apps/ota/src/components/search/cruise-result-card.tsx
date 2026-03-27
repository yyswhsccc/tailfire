import Image from "next/image";
import { Ship, Calendar, MapPin, Clock } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { PortPills } from "@/components/search/port-pills";

// Matches SailingSearchItemDto from the API
export interface CruiseSailing {
  id: string;
  name: string;
  sailDate: string;
  endDate: string;
  nights: number;
  ship: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
  cruiseLine: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  embarkPort: {
    id: string | null;
    name: string;
  };
  disembarkPort: {
    id: string | null;
    name: string;
  };
  prices: {
    inside: number | null;
    oceanview: number | null;
    balcony: number | null;
    suite: number | null;
  };
  /** Ports of call names — populated by the page from itinerary data if available */
  portNames?: string[];
}

interface CruiseResultCardProps {
  sailing: CruiseSailing;
}

/**
 * Simple palette for cruise line header gradients.
 * Picks a color based on the first character of the line name.
 */
const LINE_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  a: { from: "from-blue-900", to: "to-blue-800", accent: "text-blue-300" },
  b: { from: "from-slate-900", to: "to-slate-800", accent: "text-slate-300" },
  c: { from: "from-indigo-900", to: "to-indigo-800", accent: "text-indigo-300" },
  d: { from: "from-gray-900", to: "to-gray-800", accent: "text-gray-300" },
  e: { from: "from-emerald-900", to: "to-emerald-800", accent: "text-emerald-300" },
  f: { from: "from-violet-900", to: "to-violet-800", accent: "text-violet-300" },
  g: { from: "from-teal-900", to: "to-teal-800", accent: "text-teal-300" },
  h: { from: "from-cyan-900", to: "to-cyan-800", accent: "text-cyan-300" },
  m: { from: "from-sky-900", to: "to-sky-800", accent: "text-sky-300" },
  n: { from: "from-amber-900", to: "to-amber-800", accent: "text-amber-300" },
  p: { from: "from-rose-900", to: "to-rose-800", accent: "text-rose-300" },
  r: { from: "from-red-900", to: "to-red-800", accent: "text-red-300" },
  s: { from: "from-purple-900", to: "to-purple-800", accent: "text-purple-300" },
  v: { from: "from-fuchsia-900", to: "to-fuchsia-800", accent: "text-fuchsia-300" },
};

const DEFAULT_COLORS = { from: "from-[#1A1A1A]", to: "to-[#2A2A2A]", accent: "text-[#C59746]" };

function getLineColors(lineName: string) {
  const key = lineName.charAt(0).toLowerCase();
  return LINE_COLORS[key] ?? DEFAULT_COLORS;
}

function formatSailingDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Finds the cheapest non-null price from the price tiers.
 */
function getCheapestPrice(prices: CruiseSailing["prices"]): number | null {
  const vals = [prices.inside, prices.oceanview, prices.balcony, prices.suite].filter(
    (v): v is number => v != null,
  );
  return vals.length > 0 ? Math.min(...vals) : null;
}

export function CruiseResultCard({ sailing }: CruiseResultCardProps) {
  const colors = getLineColors(sailing.cruiseLine.name);
  const cheapest = getCheapestPrice(sailing.prices);

  const shipImageUrl = sailing.ship.imageUrl;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Ship image header with overlay */}
      <div className="relative h-40 overflow-hidden">
        {shipImageUrl ? (
          <Image
            src={shipImageUrl}
            alt={sailing.ship.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : null}
        {/* Gradient overlay — uses line colors as fallback when no image */}
        <div
          className={`absolute inset-0 ${
            shipImageUrl
              ? "bg-gradient-to-t from-black/80 via-black/40 to-black/10"
              : `bg-gradient-to-r ${colors.from} ${colors.to}`
          }`}
        />
        {/* Text content pinned to bottom */}
        <div className="absolute bottom-0 left-0 right-0 px-5 py-4">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              {/* Cruise line name */}
              <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${shipImageUrl ? "text-white/80" : colors.accent}`}>
                {sailing.cruiseLine.name}
              </p>
              {/* Sailing title */}
              <h3 className="mt-1 truncate text-base font-semibold leading-tight text-white sm:text-lg">
                {sailing.name}
              </h3>
              {/* Ship name */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <Ship className="size-3.5 shrink-0 text-white/60" />
                <p className="truncate text-xs text-white/70">
                  {sailing.ship.name}
                </p>
              </div>
            </div>

            {/* Price */}
            {cheapest != null ? (
              <div className="shrink-0 text-right">
                <p className="text-xl font-bold text-white sm:text-2xl">
                  {formatPrice(cheapest)}
                </p>
                <p className="text-[10px] text-white/60">/person</p>
              </div>
            ) : (
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-white/70">Contact for pricing</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* White body */}
      <div className="px-5 py-4">
        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            {formatSailingDate(sailing.sailDate)} &ndash; {formatSailingDate(sailing.endDate)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {sailing.nights} night{sailing.nights !== 1 ? "s" : ""}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {sailing.embarkPort.name}
            {sailing.disembarkPort.name !== sailing.embarkPort.name && (
              <> &rarr; {sailing.disembarkPort.name}</>
            )}
          </span>
        </div>

        {/* Port pills */}
        {sailing.portNames && sailing.portNames.length > 0 && (
          <PortPills ports={sailing.portNames} maxDisplay={5} className="mt-3" />
        )}

        {/* Price tiers + CTA */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          {/* Cabin price tiers */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {sailing.prices.inside != null && (
              <span>
                Inside <strong className="text-[#1A1A1A]">{formatPrice(sailing.prices.inside)}</strong>
              </span>
            )}
            {sailing.prices.oceanview != null && (
              <span>
                Ocean <strong className="text-[#1A1A1A]">{formatPrice(sailing.prices.oceanview)}</strong>
              </span>
            )}
            {sailing.prices.balcony != null && (
              <span>
                Balcony <strong className="text-[#1A1A1A]">{formatPrice(sailing.prices.balcony)}</strong>
              </span>
            )}
            {sailing.prices.suite != null && (
              <span>
                Suite <strong className="text-[#1A1A1A]">{formatPrice(sailing.prices.suite)}</strong>
              </span>
            )}
          </div>

          {/* CTA */}
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-lg bg-[#C59746] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
          >
            Inquire
          </button>
        </div>
      </div>
    </div>
  );
}
