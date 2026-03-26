import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { publicFetch } from "@/lib/api";
import type { Deal } from "@/types/deal";
import { formatPrice, calculateSavings } from "@/lib/format";
import { DealHero } from "@/components/deals/deal-hero";
import { DealQuickFacts } from "@/components/deals/deal-quick-facts";
import { DealCtaSection } from "@/components/deals/deal-cta-section";

export const revalidate = 3600; // ISR: revalidate every hour

interface DealPageProps {
  params: Promise<{ slug: string }>;
}

async function fetchDeal(slug: string): Promise<Deal | null> {
  try {
    return await publicFetch<Deal>(`/deals/by-slug/${slug}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: DealPageProps): Promise<Metadata> {
  const { slug } = await params;
  const deal = await fetchDeal(slug);

  if (!deal) {
    return { title: "Deal Not Found | Phoenix Voyages" };
  }

  const title = deal.seoMeta?.title ?? `${deal.title} | Phoenix Voyages`;
  const description =
    deal.seoMeta?.description ??
    deal.description ??
    `Explore this exclusive ${deal.productType} deal from Phoenix Voyages.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/deals/${deal.slug}`,
    },
  };
}

export default async function DealPage({ params }: DealPageProps) {
  const { slug } = await params;
  const deal = await fetchDeal(slug);

  if (!deal) {
    notFound();
  }

  const hasPrice = deal.pricing.fromPriceCents != null;
  const hasOriginalPrice =
    deal.pricing.originalPriceCents != null &&
    deal.pricing.fromPriceCents != null;
  const savings = hasOriginalPrice
    ? calculateSavings(
        deal.pricing.originalPriceCents!,
        deal.pricing.fromPriceCents!,
      )
    : 0;
  const savingsAmount = hasOriginalPrice
    ? deal.pricing.originalPriceCents! - deal.pricing.fromPriceCents!
    : 0;

  const validUntil = deal.validUntil
    ? new Date(deal.validUntil).toLocaleDateString("en-CA", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-2xl pb-16">
      {/* Hero */}
      <DealHero deal={deal} />

      {/* Floating price card */}
      <div className="-mt-6 px-4">
        <div className="rounded-xl bg-white p-5 shadow-lg">
          {hasPrice ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Starting from
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-[#1A1A1A]">
                  {formatPrice(deal.pricing.fromPriceCents!)}
                </span>
                <span className="text-sm text-muted-foreground">/person</span>
              </div>
              {hasOriginalPrice && savings > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground line-through">
                    {formatPrice(deal.pricing.originalPriceCents!)}
                  </span>
                  <span className="text-sm font-semibold text-[#B33939]">
                    Save {savings}% ({formatPrice(savingsAmount)} off)
                  </span>
                </div>
              )}
              {deal.pricing.priceNote && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {deal.pricing.priceNote}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Contact for pricing
            </p>
          )}

          {/* Inquire CTA */}
          <Link
            href="/contact"
            className="mt-4 flex w-full items-center justify-center rounded-lg bg-[#C59746] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
          >
            Inquire Now
          </Link>
        </div>
      </div>

      {/* Quick facts */}
      <div className="mt-6 px-4">
        <DealQuickFacts deal={deal} />
      </div>

      {/* Description */}
      {deal.description && (
        <div className="mt-8 px-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[#1A1A1A]">
            About This Deal
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {deal.description}
          </p>
        </div>
      )}

      {/* Destinations / Ports */}
      {deal.destinations && deal.destinations.length > 0 && (
        <div className="mt-8 px-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-[#1A1A1A]">
            Destinations
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {deal.destinations.map((dest) => (
              <span
                key={dest}
                className="rounded-full bg-gray-100 px-3.5 py-1.5 text-xs font-medium text-[#1A1A1A]"
              >
                {dest}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="mt-8 px-4">
        <DealCtaSection />
      </div>

      {/* Validity notice */}
      {validUntil && (
        <div className="mt-8 px-4">
          <p className="text-center text-xs text-muted-foreground">
            Deal valid until {validUntil} &middot; Subject to availability
          </p>
        </div>
      )}
    </div>
  );
}
