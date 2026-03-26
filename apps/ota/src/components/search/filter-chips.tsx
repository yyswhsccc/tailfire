"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

export interface FilterChipOption {
  label: string;
  value: string;
  /** URL search param key this chip controls */
  paramKey: string;
}

interface FilterChipsProps {
  options: FilterChipOption[];
  /** Base path to push to (e.g. "/search/cruises") */
  basePath: string;
}

export function FilterChips({ options, basePath }: FilterChipsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChip = useCallback(
    (option: FilterChipOption) => {
      const params = new URLSearchParams(searchParams.toString());

      // For sort chips, the paramKey is "sortBy" and value is the sort field
      if (option.value) {
        params.set(option.paramKey, option.value);
      } else {
        params.delete(option.paramKey);
      }

      // Reset to page 1 when changing sort
      params.delete("page");

      const qs = params.toString();
      router.push(`${basePath}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams, basePath],
  );

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex gap-2 pb-2">
        {options.map((option) => {
          const currentValue = searchParams.get(option.paramKey) ?? "";
          const isActive = currentValue === option.value;

          return (
            <button
              key={`${option.paramKey}-${option.value}`}
              type="button"
              onClick={() => handleChip(option)}
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
