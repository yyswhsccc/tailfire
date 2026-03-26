"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { cn } from "@/lib/utils";

const SPECIALTY_OPTIONS = [
  { label: "All", value: "" },
  { label: "Cruises", value: "cruises" },
  { label: "Luxury", value: "luxury" },
  { label: "Caribbean", value: "caribbean" },
  { label: "Europe", value: "europe" },
  { label: "Honeymoons", value: "honeymoons" },
  { label: "Group Travel", value: "group-travel" },
  { label: "Adventure", value: "adventure" },
  { label: "Family", value: "family" },
  { label: "River Cruises", value: "river-cruises" },
] as const;

const LANGUAGE_OPTIONS = [
  { label: "Any Language", value: "" },
  { label: "English", value: "english" },
  { label: "French", value: "french" },
  { label: "Spanish", value: "spanish" },
  { label: "Portuguese", value: "portuguese" },
] as const;

export function AdvisorDirectoryFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSpecialty = searchParams.get("specialty") ?? "";
  const activeLanguage = searchParams.get("language") ?? "";

  const buildParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      return params.toString();
    },
    [searchParams],
  );

  const handleSpecialty = useCallback(
    (value: string) => {
      const qs = buildParams({ specialty: value });
      router.push(`/advisors${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, buildParams],
  );

  const handleLanguage = useCallback(
    (value: string) => {
      const qs = buildParams({ language: value });
      router.push(`/advisors${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, buildParams],
  );

  const handleClear = useCallback(() => {
    router.push("/advisors", { scroll: false });
  }, [router]);

  const hasActiveFilters = activeSpecialty !== "" || activeLanguage !== "";

  return (
    <div className="space-y-3">
      {/* Specialty chips — horizontally scrollable on mobile */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2 pb-2">
          {SPECIALTY_OPTIONS.map((option) => {
            const isActive = activeSpecialty === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSpecialty(option.value)}
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

      {/* Bottom row: language dropdown + clear */}
      <div className="flex items-center gap-3">
        <select
          value={activeLanguage}
          onChange={(e) => handleLanguage(e.target.value)}
          className={cn(
            "rounded-lg border border-border bg-white px-3 py-2 text-sm text-[#1A1A1A]",
            "focus:outline-none focus:ring-2 focus:ring-[#C59746]/40",
            activeLanguage && "border-[#C59746] font-medium",
          )}
          aria-label="Filter by language"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClear}
            className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-[#1A1A1A] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
