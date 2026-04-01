"use client";

import Link from "next/link";

interface BoardAddMenuProps {
  requestId: string;
}

const ADD_OPTIONS = [
  { emoji: "\u2708\uFE0F", label: "Flight", path: "flights" },
  { emoji: "\uD83C\uDFE8", label: "Hotel", path: "hotels" },
  { emoji: "\uD83D\uDEA2", label: "Cruise", path: "cruises" },
  { emoji: "\uD83D\uDDFA\uFE0F", label: "Tour", path: "tours" },
] as const;

export function BoardAddMenu({ requestId }: BoardAddMenuProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ADD_OPTIONS.map(({ emoji, label, path }) => (
        <Link
          key={path}
          href={`/search/${path}?tripId=${requestId}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <span>{emoji}</span>
          {label}
        </Link>
      ))}
    </div>
  );
}
