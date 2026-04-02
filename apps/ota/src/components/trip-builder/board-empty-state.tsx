import Link from "next/link";
import { Sparkles, Plane, Hotel, Ship, Map } from "lucide-react";

interface BoardEmptyStateProps {
  requestId: string;
}

const SEARCH_ACTIONS = [
  { icon: Plane, label: "Flights", path: "flights" },
  { icon: Hotel, label: "Hotels", path: "hotels" },
  { icon: Ship, label: "Cruises", path: "cruises" },
  { icon: Map, label: "Tours", path: "tours" },
] as const;

export function BoardEmptyState({ requestId }: BoardEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#C59746]/10">
        <Sparkles className="size-7 text-[#C59746]" />
      </div>

      <h2 className="text-xl font-semibold text-[#1A1A1A]">
        Start building your dream trip
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Search for flights, hotels, cruises, or tours
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {SEARCH_ACTIONS.map(({ icon: Icon, label, path }) => (
          <Link
            key={path}
            href={`/search/${path}?tripId=${requestId}`}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
