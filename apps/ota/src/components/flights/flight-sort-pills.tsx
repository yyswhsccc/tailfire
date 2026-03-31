"use client";

import { useFlightSearch } from "./flight-search-store";
import type { SortOption } from "@/lib/flight-utils";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "cheapest", label: "Cheapest" },
  { value: "fastest", label: "Fastest" },
  { value: "departure", label: "Departure" },
];

export function FlightSortPills() {
  const sort = useFlightSearch((s) => s.sort);
  const setSort = useFlightSearch((s) => s.setSort);

  return (
    <div className="flex gap-1.5">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setSort(opt.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            sort === opt.value
              ? "bg-[#1A1A1A] text-white"
              : "bg-muted text-[#1A1A1A] hover:bg-muted/80",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
