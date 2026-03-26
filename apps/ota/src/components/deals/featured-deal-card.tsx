import Link from "next/link";
import Image from "next/image";

import type { Deal } from "@/types/deal";
import { formatPrice, calculateSavings } from "@/lib/format";

interface FeaturedDealCardProps {
  deal: Deal;
}

export function FeaturedDealCard({ deal }: FeaturedDealCardProps) {
  const hasPrice = deal.pricing.fromPriceCents != null;
  const hasOriginalPrice = deal.pricing.originalPriceCents != null && deal.pricing.fromPriceCents != null;
  const savings = hasOriginalPrice
    ? calculateSavings(deal.pricing.originalPriceCents!, deal.pricing.fromPriceCents!)
    : 0;

  const validUntil = deal.validUntil
    ? new Date(deal.validUntil).toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Link
      href={`/deals/${deal.slug}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-white transition-shadow hover:shadow-xl"
    >
      {/* Taller image header */}
      <div className="relative h-56 w-full bg-[#1A1A1A] md:h-72">
        {deal.heroImageUrl ? (
          <Image
            src={deal.heroImageUrl}
            alt={deal.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="100vw"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-5xl text-gray-600">
              {deal.productType === "cruise" ? "\u26F5" : deal.productType === "flight" ? "\u2708\uFE0F" : deal.productType === "tour" ? "\uD83C\uDF0D" : deal.productType === "hotel" ? "\uD83C\uDFE8" : "\u2728"}
            </span>
          </div>
        )}

        {/* HOT DEAL badge */}
        <div className="absolute left-4 top-4">
          <span className="rounded-md bg-[#B33939] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
            Hot Deal
          </span>
        </div>

        {/* Overlay content on image */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/30 to-transparent p-5 md:p-6">
          {deal.supplierName && (
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#C59746]">
              {deal.supplierName}
            </p>
          )}
          <h3 className="mt-1 font-display text-xl font-bold leading-tight text-white md:text-2xl">
            {deal.title}
          </h3>
          {deal.description && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-300">
              {deal.description}
            </p>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{deal.productType}</span>
          {validUntil && (
            <>
              <span className="text-border">&middot;</span>
              <span>Valid until {validUntil}</span>
            </>
          )}
          {deal.destinations && deal.destinations.length > 0 && (
            <>
              <span className="text-border">&middot;</span>
              <span>{deal.destinations.join(", ")}</span>
            </>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
            {hasPrice ? (
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-[#1A1A1A]">
                  From {formatPrice(deal.pricing.fromPriceCents!)}
                </p>
                {hasOriginalPrice && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatPrice(deal.pricing.originalPriceCents!)}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Contact for pricing</p>
            )}
            {hasOriginalPrice && savings > 0 && (
              <p className="mt-1 text-sm font-semibold text-[#B33939]">
                Save {savings}%
              </p>
            )}
            {deal.pricing.priceNote && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {deal.pricing.priceNote}
              </p>
            )}
          </div>
          <span className="text-sm font-semibold text-[#C59746] transition-colors group-hover:text-[#E89E4A]">
            View Deal &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
