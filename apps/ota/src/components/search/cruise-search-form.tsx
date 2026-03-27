"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, type FormEvent } from "react";
import { Search, Loader2 } from "lucide-react";

import { useSearch } from "./search-page-shell";

import { cn } from "@/lib/utils";

interface FilterOption {
  id: string;
  name: string;
  count?: number;
}

interface CruiseSearchFormProps {
  /** Available cruise lines from the filters API */
  cruiseLines?: FilterOption[];
  /** Available regions from the filters API */
  regions?: FilterOption[];
  /** Whether to show the form in compact mode (when results are visible) */
  compact?: boolean;
  className?: string;
}

/**
 * Generates month options from today through +18 months.
 */
function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}

const MONTH_OPTIONS = getMonthOptions();

export function CruiseSearchForm({
  cruiseLines = [],
  regions = [],
  compact = false,
  className,
}: CruiseSearchFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isPending, startSearch } = useSearch();

  const currentQ = searchParams.get("q") ?? "";
  const currentCruiseLine = searchParams.get("cruiseLineId") ?? "";
  const currentRegion = searchParams.get("regionId") ?? "";
  const currentMonth = searchParams.get("sailDateFrom")?.slice(0, 7) ?? "";

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const params = new URLSearchParams();

      const q = (form.get("q") as string)?.trim();
      if (q) params.set("q", q);

      const cruiseLineId = form.get("cruiseLineId") as string;
      if (cruiseLineId) params.set("cruiseLineId", cruiseLineId);

      const regionId = form.get("regionId") as string;
      if (regionId) params.set("regionId", regionId);

      const month = form.get("month") as string;
      if (month) {
        // Set sailDateFrom to first of month, sailDateTo to last of month
        const parts = month.split("-").map(Number);
        const y = parts[0]!;
        const m = parts[1]!;
        const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
        const lastDay = new Date(y, m, 0);
        const lastDayStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
        params.set("sailDateFrom", firstDay);
        params.set("sailDateTo", lastDayStr);
      }

      // Carry over sort if present
      const sortBy = searchParams.get("sortBy");
      if (sortBy) params.set("sortBy", sortBy);
      const sortDir = searchParams.get("sortDir");
      if (sortDir) params.set("sortDir", sortDir);

      const qs = params.toString();
      startSearch(() => {
        router.push(`/search/cruises${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [router, searchParams, startSearch],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-6",
        compact && "p-3 sm:p-4",
        className,
      )}
    >
      <div
        className={cn(
          "grid gap-3",
          compact
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5"
            : "grid-cols-1 sm:grid-cols-2",
        )}
      >
        {/* Search text */}
        <div className={cn(!compact && "sm:col-span-2")}>
          <label htmlFor="cruise-q" className="mb-1 block text-xs font-medium text-muted-foreground">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="cruise-q"
              name="q"
              type="text"
              defaultValue={currentQ}
              placeholder="Ship, destination, or port..."
              className="h-10 w-full rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        {/* Cruise Line */}
        <div>
          <label htmlFor="cruise-line" className="mb-1 block text-xs font-medium text-muted-foreground">
            Cruise Line
          </label>
          <select
            id="cruise-line"
            name="cruiseLineId"
            defaultValue={currentCruiseLine}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">All Cruise Lines</option>
            {cruiseLines.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.name}
                {cl.count != null ? ` (${cl.count})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Region */}
        <div>
          <label htmlFor="cruise-region" className="mb-1 block text-xs font-medium text-muted-foreground">
            Destination
          </label>
          <select
            id="cruise-region"
            name="regionId"
            defaultValue={currentRegion}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">All Destinations</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.count != null ? ` (${r.count})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Departure Month */}
        <div>
          <label htmlFor="cruise-month" className="mb-1 block text-xs font-medium text-muted-foreground">
            Departure Month
          </label>
          <select
            id="cruise-month"
            name="month"
            defaultValue={currentMonth}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Any Month</option>
            {MONTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Submit */}
      <div className={cn("mt-4", compact && "mt-3")}>
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#C59746] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] focus-visible:ring-3 focus-visible:ring-[#C59746]/50",
            compact ? "w-full sm:w-auto" : "w-full sm:w-auto",
            isPending && "cursor-not-allowed opacity-70",
          )}
        >
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="size-4" />
              Search Cruises
            </>
          )}
        </button>
      </div>
    </form>
  );
}
