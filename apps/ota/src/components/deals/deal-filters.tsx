"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

const FILTER_OPTIONS = [
  { label: "All Deals", value: "" },
  { label: "Cruises", value: "cruise" },
  { label: "Flights", value: "flight" },
  { label: "Tours", value: "tour" },
  { label: "Hotels", value: "hotel" },
  { label: "All-Inclusive", value: "all-inclusive" },
] as const;

export function DealFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeType = searchParams.get("type") ?? "";

  const handleFilter = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("type", value);
      } else {
        params.delete("type");
      }
      router.push(`/deals?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-2 pb-2">
        {FILTER_OPTIONS.map((option) => {
          const isActive = activeType === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleFilter(option.value)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#1A1A1A] text-white"
                  : "border border-border bg-gray-100 text-muted-foreground hover:bg-gray-200",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
