import Link from "next/link";
import Image from "next/image";

import type { Deal } from "@/types/deal";
import { formatPrice } from "@/lib/format";

interface DealCardProps {
  deal: Deal;
}

export function DealCard({ deal }: DealCardProps) {
  const hasPrice = deal.pricing.fromPriceCents != null;
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
      className="group overflow-hidden rounded-xl border border-border bg-white transition-shadow hover:shadow-lg"
    >
      {/* Image header area */}
      <div className="relative h-40 w-full bg-[#1A1A1A]">
        {deal.heroImageUrl ? (
          <Image
            src={deal.heroImageUrl}
            alt={deal.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-3xl text-gray-600">
              {deal.productType === "cruise" ? "\u26F5" : deal.productType === "flight" ? "\u2708\uFE0F" : deal.productType === "tour" ? "\uD83C\uDF0D" : deal.productType === "hotel" ? "\uD83C\uDFE8" : "\u2728"}
            </span>
          </div>
        )}

        {/* Overlay content on image */}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4">
          {deal.supplierName && (
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#C59746]">
              {deal.supplierName}
            </p>
          )}
          <h3 className="mt-1 text-base font-semibold leading-tight text-white">
            {deal.title}
          </h3>
        </div>
      </div>

      {/* Content area */}
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{deal.productType}</span>
          {validUntil && (
            <>
              <span className="text-border">&middot;</span>
              <span>Until {validUntil}</span>
            </>
          )}
          {deal.destinations && deal.destinations.length > 0 && (
            <>
              <span className="text-border">&middot;</span>
              <span>{deal.destinations.join(", ")}</span>
            </>
          )}
        </div>

        <div className="mt-3 flex items-end justify-between">
          {hasPrice ? (
            <p className="text-lg font-bold text-[#1A1A1A]">
              From {formatPrice(deal.pricing.fromPriceCents!)}
              {deal.pricing.priceNote && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {deal.pricing.priceNote}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Contact for pricing</p>
          )}
          <span className="text-sm font-semibold text-[#C59746] transition-colors group-hover:text-[#E89E4A]">
            View &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
