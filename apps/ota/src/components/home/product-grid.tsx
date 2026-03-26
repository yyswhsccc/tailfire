import Link from "next/link";
import { Plane, Ship, Hotel, Mountain } from "lucide-react";

const CATEGORIES = [
  { label: "Flights", href: "/search/flights", icon: Plane },
  { label: "Cruises", href: "/search/cruises", icon: Ship },
  { label: "Hotels", href: "/search/hotels", icon: Hotel },
  { label: "Tours", href: "/search/tours", icon: Mountain },
] as const;

export function ProductGrid() {
  return (
    <section className="px-4 pb-12">
      <div className="mx-auto max-w-2xl">
        {/* Divider with text */}
        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            or search directly
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Category grid */}
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.href}
              href={cat.href}
              className="flex flex-col items-center gap-2 rounded-xl border bg-muted/50 px-4 py-6 transition-colors hover:border-[#C59746]/40 hover:bg-muted"
            >
              <cat.icon className="size-7 text-[#1A1A1A]" strokeWidth={1.5} />
              <span className="text-sm font-medium text-[#1A1A1A]">
                {cat.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
