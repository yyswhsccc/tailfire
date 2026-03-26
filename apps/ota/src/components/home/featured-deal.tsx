import Link from "next/link";
import { Deal } from "@/types/deal";

interface FeaturedDealProps {
  deal?: Deal | null;
}

function formatPrice(deal: Deal): string {
  const cents = deal.pricing.fromPriceCents;
  if (!cents) return "";
  const dollars = Math.floor(cents / 100);
  return `from $${dollars.toLocaleString()}`;
}

function buildSubtitle(deal: Deal): string {
  const parts: string[] = [];
  if (deal.destinations?.length) parts.push(deal.destinations[0]);
  if (deal.supplierName) parts.push(deal.supplierName);
  return parts.join(" · ");
}

export function FeaturedDeal({ deal }: FeaturedDealProps) {
  const title = deal
    ? `${deal.title}${deal.pricing.fromPriceCents ? " " + formatPrice(deal) : ""}`
    : "Caribbean Cruise from $899";

  const subtitle = deal
    ? buildSubtitle(deal)
    : "7 nights · Royal Caribbean";

  const href = deal ? `/deals/${deal.slug}` : "/deals";

  return (
    <section className="px-4 pb-12">
      <div className="mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-2xl bg-[#1A1A1A] px-6 py-8 md:px-10">
          {/* Badge */}
          <p className="text-xs font-bold uppercase tracking-wider">
            <span className="text-[#C59746]">Hot</span>
            <span className="text-gray-400"> Deal</span>
          </p>

          {/* Title */}
          <h2 className="mt-3 font-display text-xl font-bold text-white md:text-2xl">
            {title}
          </h2>

          {/* Subtitle */}
          {subtitle && (
            <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
          )}

          {/* CTA link */}
          <Link
            href={href}
            className="mt-5 inline-block text-sm font-semibold text-[#C59746] transition-colors hover:text-[#E89E4A]"
          >
            View Deal &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
