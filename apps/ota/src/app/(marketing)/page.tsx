import type { Metadata } from "next";

import { HeroSection } from "@/components/home/hero-section";
import { ProductGrid } from "@/components/home/product-grid";
import { FeaturedDeal } from "@/components/home/featured-deal";
import { TrustBar } from "@/components/home/trust-bar";

export const metadata: Metadata = {
  title: "Phoenix Voyages | Luxury Cruise Deals & Travel Packages",
  description:
    "AI-powered travel planning backed by expert advisors. Discover luxury cruises, flights, hotels, and tours with Phoenix Voyages.",
};

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ProductGrid />
      <FeaturedDeal />
      <TrustBar />
    </>
  );
}
