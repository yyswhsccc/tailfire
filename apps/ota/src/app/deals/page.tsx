import type { Metadata } from "next";
import { Suspense } from "react";

import { publicFetch } from "@/lib/api";
import type { Deal } from "@/types/deal";
import { DealCard } from "@/components/deals/deal-card";
import { FeaturedDealCard } from "@/components/deals/featured-deal-card";
import { DealFilters } from "@/components/deals/deal-filters";

export const revalidate = 3600; // ISR: revalidate every hour

export function generateMetadata(): Metadata {
  return {
    title: "Travel Deals | Phoenix Voyages",
    description:
      "Discover exclusive travel deals on cruises, flights, hotels, and tours. Curated by Phoenix Voyages travel advisors.",
    openGraph: {
      title: "Travel Deals | Phoenix Voyages",
      description:
        "Discover exclusive travel deals on cruises, flights, hotels, and tours.",
    },
  };
}

interface DealsPageProps {
  searchParams: Promise<{ type?: string }>;
}

async function fetchDeals(productType?: string): Promise<{ deals: Deal[]; total: number }> {
  try {
    const params = new URLSearchParams({ isPublished: "true", limit: "20" });
    if (productType) {
      params.set("productType", productType);
    }
    const response = await publicFetch<{ deals: Deal[]; total: number }>(
      `/deals?${params.toString()}`,
      { next: { tags: ["deals"] } },
    );
    return response;
  } catch (error) {
    console.error("Failed to fetch deals:", error);
    return { deals: [], total: 0 };
  }
}

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const { type } = await searchParams;
  const { deals, total } = await fetchDeals(type);

  const [featuredDeal, ...restDeals] = deals;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#1A1A1A] md:text-4xl">
          TRAVEL DEALS
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Exclusive offers curated by our travel advisors
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8">
        <Suspense fallback={null}>
          <DealFilters />
        </Suspense>
      </div>

      {deals.length === 0 ? (
        /* Empty state */
        <div className="rounded-2xl border border-border bg-muted/30 px-6 py-16 text-center">
          <p className="text-lg font-medium text-[#1A1A1A]">
            No deals available right now
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {type
              ? "Try a different category or check back soon for new offers."
              : "Check back soon — our advisors are always finding new deals."}
          </p>
        </div>
      ) : (
        <>
          {/* Featured deal */}
          {featuredDeal && (
            <div className="mb-10">
              <FeaturedDealCard deal={featuredDeal} />
            </div>
          )}

          {/* More deals grid */}
          {restDeals.length > 0 && (
            <>
              <h2 className="mb-6 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                More Deals {total > 0 && `(${total})`}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {restDeals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
