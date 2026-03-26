import type { Deal } from "@/types/deal";

interface DealQuickFactsProps {
  deal: Deal;
}

function formatDateRange(from?: string, until?: string): string | null {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

  if (from && until) return `${fmt(from)} - ${fmt(until)}`;
  if (until) return `Until ${fmt(until)}`;
  if (from) return `From ${fmt(from)}`;
  return null;
}

function productTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    cruise: "Cruise",
    flight: "Flight",
    tour: "Tour",
    hotel: "Hotel",
    "all-inclusive": "All-Inclusive",
  };
  return labels[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

function productTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    cruise: "\u26F5",
    flight: "\u2708\uFE0F",
    tour: "\uD83C\uDF0D",
    hotel: "\uD83C\uDFE8",
    "all-inclusive": "\uD83C\uDFD6\uFE0F",
  };
  return icons[type] ?? "\u2728";
}

export function DealQuickFacts({ deal }: DealQuickFactsProps) {
  const dateRange = formatDateRange(deal.validFrom, deal.validUntil);
  const firstDestination =
    deal.destinations && deal.destinations.length > 0
      ? deal.destinations[0]
      : null;

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Product type */}
      <div className="flex flex-col items-center rounded-xl bg-[#faf6f0] px-3 py-4 text-center">
        <span className="text-lg">{productTypeIcon(deal.productType)}</span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Type
        </span>
        <span className="mt-0.5 text-xs font-semibold text-[#1A1A1A]">
          {productTypeLabel(deal.productType)}
        </span>
      </div>

      {/* Valid dates */}
      <div className="flex flex-col items-center rounded-xl bg-[#faf6f0] px-3 py-4 text-center">
        <span className="text-lg">{"\uD83D\uDCC5"}</span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Dates
        </span>
        <span className="mt-0.5 text-xs font-semibold text-[#1A1A1A]">
          {dateRange ?? "Flexible"}
        </span>
      </div>

      {/* Departure / Destination */}
      <div className="flex flex-col items-center rounded-xl bg-[#faf6f0] px-3 py-4 text-center">
        <span className="text-lg">{"\uD83D\uDCCD"}</span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Destination
        </span>
        <span className="mt-0.5 text-xs font-semibold text-[#1A1A1A] truncate max-w-full">
          {firstDestination ?? "Various"}
        </span>
      </div>
    </div>
  );
}
