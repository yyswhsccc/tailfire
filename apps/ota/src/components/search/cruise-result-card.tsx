"use client";

import Image from "next/image";
import Link from "next/link";
import { Ship, Calendar, MapPin, Clock } from "lucide-react";

import { formatPrice } from "@/lib/format";
import { PortPills } from "@/components/search/port-pills";
import { AddToTripButton } from "@/components/trip-builder/add-to-trip-button";
import type { TripComponent } from "@/components/trip-builder/trip-basket-store";

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
  portNames?: string[];
}

interface CruiseResultCardProps {
  sailing: CruiseSailing;
}

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
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

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

  // Build TripComponent for basket
  const tripComponent: TripComponent = {
    id: `cruise-${sailing.id}`,
    type: "cruise",
    data: {
      sailingId: sailing.id,
      name: sailing.name,
      sailDate: sailing.sailDate,
      endDate: sailing.endDate,
      nights: sailing.nights,
      shipName: sailing.ship.name,
      cruiseLine: sailing.cruiseLine.name,
      departurePort: sailing.embarkPort.name,
      disembarkPort: sailing.disembarkPort.name,
      prices: sailing.prices,
      price: cheapest != null ? { total: cheapest / 100, currency: "CAD" } : undefined,
    },
    display: {
      heroImage: shipImageUrl ?? undefined,
      title: sailing.name,
      subtitle: `${sailing.cruiseLine.name} - ${sailing.ship.name}`,
      price: cheapest != null ? formatPrice(cheapest) : undefined,
    },
  };

  return (
    <Link href={`/cruises/${sailing.id}`} className="group block overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* ================================================================
          RESPONSIVE LAYOUT:
          - Mobile: stacked (image on top, details below)
          - Desktop (lg+): side-by-side (image left, details right)
          ================================================================ */}
      <div className="flex flex-col lg:flex-row">
        {/* ---- Image section ---- */}
        <div className="relative h-48 overflow-hidden lg:h-auto lg:w-[320px] lg:shrink-0">
          {shipImageUrl ? (
            <Image
              src={shipImageUrl}
              alt={sailing.ship.name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 1024px) 100vw, 320px"
            />
          ) : null}
          {/* Gradient overlay */}
          <div
            className={`absolute inset-0 ${
              shipImageUrl
                ? "bg-gradient-to-t from-black/70 via-black/30 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-black/10"
                : `bg-gradient-to-r ${colors.from} ${colors.to}`
            }`}
          />

          {/* Mobile: text overlay on image (hidden on desktop) */}
          <div className="absolute bottom-0 left-0 right-0 p-4 lg:hidden">
            <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${shipImageUrl ? "text-white/80" : colors.accent}`}>
              {sailing.cruiseLine.name}
            </p>
            <h3 className="mt-1 truncate text-base font-semibold leading-tight text-white">
              {sailing.name}
            </h3>
          </div>

          {/* Desktop: cruise line badge (top-left corner) */}
          <div className="absolute left-3 top-3 hidden rounded-full bg-black/50 px-3 py-1 backdrop-blur-sm lg:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/90">
              {sailing.cruiseLine.name}
            </p>
          </div>
        </div>

        {/* ---- Details section ---- */}
        <div className="flex min-w-0 flex-1 flex-col p-4 lg:p-5">
          {/* Desktop: title row (hidden on mobile — shown in image overlay instead) */}
          <div className="hidden lg:block">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-lg font-semibold leading-tight text-[#1A1A1A]">
                  {sailing.name}
                </h3>
                <div className="mt-1 flex items-center gap-1.5">
                  <Ship className="size-3.5 shrink-0 text-muted-foreground" />
                  <p className="truncate text-sm text-muted-foreground">{sailing.ship.name}</p>
                </div>
              </div>

              {/* Price */}
              {cheapest != null ? (
                <div className="shrink-0 text-right">
                  <p className="text-sm text-muted-foreground">from</p>
                  <p className="text-2xl font-bold text-[#C59746]">{formatPrice(cheapest)}</p>
                  <p className="text-xs text-muted-foreground">/person</p>
                </div>
              ) : (
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-muted-foreground">Contact for pricing</p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile: ship name + price (below image) */}
          <div className="flex items-start justify-between gap-3 lg:hidden">
            <div className="flex items-center gap-1.5">
              <Ship className="size-3.5 shrink-0 text-muted-foreground" />
              <p className="truncate text-xs text-muted-foreground">{sailing.ship.name}</p>
            </div>
            {cheapest != null ? (
              <p className="shrink-0 text-lg font-bold text-[#C59746]">{formatPrice(cheapest)}</p>
            ) : (
              <p className="shrink-0 text-xs text-muted-foreground">Contact for pricing</p>
            )}
          </div>

          {/* Meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground lg:mt-3">
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
          <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
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
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <AddToTripButton component={tripComponent} size="sm" />
              </div>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-lg bg-[#C59746] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
              >
                Inquire
              </button>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
