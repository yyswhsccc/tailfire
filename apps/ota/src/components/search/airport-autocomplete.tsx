"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  subType?: string;
}

interface AirportAutocompleteProps {
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}

export function AirportAutocomplete({
  id,
  name,
  label,
  placeholder = "City or airport...",
  defaultValue = "",
  required = false,
  className,
}: AirportAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<Airport[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCode, setSelectedCode] = useState(defaultValue);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (keyword: string) => {
    if (keyword.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/airports?keyword=${encodeURIComponent(keyword)}`);
      const airports: Airport[] = res.ok ? await res.json() : [];
      setResults(airports);
      setIsOpen(airports.length > 0);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedCode(value.toUpperCase());

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(value), 300);
    },
    [search]
  );

  const handleSelect = useCallback((airport: Airport) => {
    setQuery(`${airport.code} — ${airport.city}`);
    setSelectedCode(airport.code);
    setIsOpen(false);
    setResults([]);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className="h-10 w-full rounded-lg border border-input bg-transparent pl-3 pr-8 text-sm uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {isLoading ? (
          <Loader2 className="absolute right-2.5 top-2.5 size-4 animate-spin text-muted-foreground" />
        ) : (
          <MapPin className="absolute right-2.5 top-2.5 size-4 text-muted-foreground" />
        )}
      </div>

      {/* Hidden input sends just the IATA code — only when a valid 3-letter code is selected */}
      <input
        type="hidden"
        name={name}
        value={/^[A-Z]{3}$/.test(selectedCode) ? selectedCode : ""}
      />

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-white shadow-lg">
          {results.map((airport, index) => (
            <button
              key={`${airport.code}-${airport.subType || index}`}
              type="button"
              onClick={() => handleSelect(airport)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-[#faf6f0] transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <span className="inline-flex h-8 w-10 items-center justify-center rounded bg-[#1A1A1A] text-xs font-bold text-[#C59746]">
                {airport.code}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">
                  {airport.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {airport.city}, {airport.country}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
