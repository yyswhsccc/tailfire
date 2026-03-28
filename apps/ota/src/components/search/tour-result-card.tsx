import { Calendar, MapPin, Users } from "lucide-react";

// Matches TourSummaryDto from tour-repository API
export interface Tour {
  id: string;
  name: string;
  provider?: string;
  providerIdentifier?: string;
  operatorCode: string;
  season?: string;
  days?: number;
  nights?: number;
  description?: string;
  imageUrl?: string;
  lowestPriceCents?: number;
  departureCount?: number;
}

interface TourResultCardProps {
  tour: Tour;
}

/**
 * Simple palette for tour operator header gradients — keyed on first char.
 */
const OPERATOR_COLORS: Record<string, { from: string; to: string; accent: string }> = {
  a: { from: "from-blue-900", to: "to-blue-800", accent: "text-blue-300" },
  b: { from: "from-slate-900", to: "to-slate-800", accent: "text-slate-300" },
  c: { from: "from-indigo-900", to: "to-indigo-800", accent: "text-indigo-300" },
  d: { from: "from-gray-900", to: "to-gray-800", accent: "text-gray-300" },
  e: { from: "from-emerald-900", to: "to-emerald-800", accent: "text-emerald-300" },
  f: { from: "from-violet-900", to: "to-violet-800", accent: "text-violet-300" },
  g: { from: "from-teal-900", to: "to-teal-800", accent: "text-teal-300" },
  h: { from: "from-cyan-900", to: "to-cyan-800", accent: "text-cyan-300" },
  i: { from: "from-sky-900", to: "to-sky-800", accent: "text-sky-300" },
  m: { from: "from-amber-900", to: "to-amber-800", accent: "text-amber-300" },
  n: { from: "from-rose-900", to: "to-rose-800", accent: "text-rose-300" },
  r: { from: "from-red-900", to: "to-red-800", accent: "text-red-300" },
  s: { from: "from-purple-900", to: "to-purple-800", accent: "text-purple-300" },
  w: { from: "from-fuchsia-900", to: "to-fuchsia-800", accent: "text-fuchsia-300" },
};

const DEFAULT_COLORS = { from: "from-[#1A1A1A]", to: "to-[#2A2A2A]", accent: "text-[#C59746]" };

function getOperatorColors(operatorName: string) {
  const key = operatorName.charAt(0).toLowerCase();
  return OPERATOR_COLORS[key] ?? DEFAULT_COLORS;
}

export function TourResultCard({ tour }: TourResultCardProps) {
  const operatorName = tour.operatorCode ?? "Phoenix Voyages";
  const colors = getOperatorColors(operatorName);
  const durationDays = tour.days ?? 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Dark gradient header */}
      <div className={`bg-gradient-to-r ${colors.from} ${colors.to} px-5 py-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {/* Operator name */}
            <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${colors.accent}`}>
              {operatorName}
            </p>
            {/* Tour name */}
            <h3 className="mt-1 truncate text-base font-semibold leading-tight text-white sm:text-lg">
              {tour.name}
            </h3>
            {/* Season */}
            {tour.season && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 text-white/60" />
                <p className="truncate text-xs text-white/70">Season {tour.season}</p>
              </div>
            )}
          </div>

          {/* Duration badge */}
          {durationDays > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-xl font-bold text-white sm:text-2xl">{durationDays}</p>
              <p className="text-[10px] text-white/60">day{durationDays !== 1 ? "s" : ""}</p>
            </div>
          )}
        </div>
      </div>

      {/* White body */}
      <div className="px-5 py-4">
        {/* Description */}
        {tour.description && (
          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{tour.description}</p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {durationDays > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {durationDays} day{durationDays !== 1 ? "s" : ""}
              {tour.nights != null && ` / ${tour.nights} night${tour.nights !== 1 ? "s" : ""}`}
            </span>
          )}
          {tour.departureCount != null && tour.departureCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {tour.departureCount} departure{tour.departureCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* CTA — no price, routes to advisor */}
        <div className="mt-4 flex items-end justify-end">
          <a
            href="/contact"
            className="inline-flex h-9 items-center rounded-lg bg-[#C59746] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
          >
            Request Quote from Advisor
          </a>
        </div>
      </div>
    </div>
  );
}
