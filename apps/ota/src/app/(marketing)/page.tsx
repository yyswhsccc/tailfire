import type { Metadata } from "next";

import { HeroSection } from "@/components/home/hero-section";
import { ProductGrid } from "@/components/home/product-grid";
import { FeaturedDeal } from "@/components/home/featured-deal";
import { TrustBar } from "@/components/home/trust-bar";
import { publicFetch } from "@/lib/api";
import { Deal } from "@/types/deal";

export const metadata: Metadata = {
  title: "Phoenix Voyages | Luxury Cruise Deals & Travel Packages",
  description:
    "AI-powered travel planning backed by expert advisors. Discover luxury cruises, flights, hotels, and tours with Phoenix Voyages.",
};

export default async function HomePage() {
  let featuredDeal: Deal | null = null;
  try {
    const response = await publicFetch<{ deals: Deal[]; total: number }>(
      "/deals?limit=1",
      { next: { tags: ["deals"] } },
    );
    featuredDeal = response.deals?.[0] ?? null;
  } catch {
    // API not available — fallback to static placeholder
  }

  return (
    <>
      <HeroSection />
      <ProductGrid />
      <FeaturedDeal deal={featuredDeal} />
      <TrustBar />
    </>
  );
}
