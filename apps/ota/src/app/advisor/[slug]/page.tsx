import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { publicFetch } from "@/lib/api";
import type { AdvisorProfile } from "@/types/advisor";
import { PageContextBridge } from "@/components/page-context-bridge";
import { AdvisorStorefrontHero } from "@/components/advisor/advisor-storefront-hero";
import { AiContextualPrompt } from "@/components/ai/ai-contextual-prompt";
import { AdvisorCuratedTrips } from "@/components/advisor/advisor-curated-trips";
import { AdvisorFeaturedDeals } from "@/components/advisor/advisor-featured-deals";
import { AdvisorDestinations } from "@/components/advisor/advisor-destinations";
import { AdvisorTestimonials } from "@/components/advisor/advisor-testimonials";
import { AdvisorBioCard } from "@/components/advisor/advisor-bio-card";
import { AdvisorContactForm } from "@/components/advisor/advisor-contact-form";
import { FeedDivider } from "@/components/hub/feed-divider";

export const revalidate = 3600; // ISR: revalidate every hour

interface AdvisorPageProps {
  params: Promise<{ slug: string }>;
}

async function fetchAdvisor(slug: string): Promise<AdvisorProfile | null> {
  try {
    return await publicFetch<AdvisorProfile>(
      `/advisor-profiles/by-slug/${slug}`,
      {
        next: { tags: ["advisors", `advisor-${slug}`] },
      },
    );
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: AdvisorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const advisor = await fetchAdvisor(slug);

  if (!advisor) {
    return { title: "Advisor Not Found | Phoenix Voyages" };
  }

  const title = `${advisor.displayName} — Travel Advisor | Phoenix Voyages`;
  const description = advisor.specialties?.length
    ? `${advisor.displayName} specializes in ${advisor.specialties.slice(0, 3).join(", ")}. Book your next trip with a Phoenix Voyages travel advisor.`
    : `Plan your next trip with ${advisor.displayName}, a Phoenix Voyages travel advisor.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `/advisor/${advisor.slug}`,
    },
  };
}

/* ---------- Suspense loading skeletons ---------- */

function SectionSkeleton() {
  return (
    <div className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 h-7 w-48 animate-pulse rounded bg-[#eee]" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[280px] animate-pulse rounded-2xl bg-[#eee]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default async function AdvisorPage({ params }: AdvisorPageProps) {
  const { slug } = await params;
  const advisor = await fetchAdvisor(slug);

  if (!advisor) {
    notFound();
  }

  const firstName = advisor.displayName.split(" ")[0];

  return (
    <>
      {/* Context bridge for AI panel */}
      <PageContextBridge
        type="advisor"
        slug={advisor.slug}
        name={advisor.displayName}
        metadata={{
          title: advisor.title,
          specialties: advisor.specialties,
          destinations: advisor.destinations,
        }}
      />

      {/* 1. Hero */}
      <AdvisorStorefrontHero advisor={advisor} />

      {/* 2. Specialty pills bar */}
      {advisor.specialties && advisor.specialties.length > 0 && (
        <div className="bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto pb-1">
            {advisor.specialties.map((specialty) => (
              <span
                key={specialty}
                className="shrink-0 rounded-full border border-[#C59746]/30 bg-[#C59746]/8 px-4 py-1.5 text-xs font-semibold text-[#C59746]"
              >
                {specialty}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. AI contextual prompt */}
      <AiContextualPrompt
        entityType="advisor"
        entityName={advisor.displayName}
      />

      {/* 4. Curated trips */}
      <Suspense fallback={<SectionSkeleton />}>
        <AdvisorCuratedTrips slug={slug} advisorName={advisor.displayName} />
      </Suspense>

      <FeedDivider />

      {/* 5. Featured deals */}
      <Suspense fallback={<SectionSkeleton />}>
        <AdvisorFeaturedDeals slug={slug} advisorName={advisor.displayName} />
      </Suspense>

      <FeedDivider />

      {/* 6. Destinations */}
      <AdvisorDestinations advisor={advisor} />

      <FeedDivider />

      {/* 7. Testimonials */}
      <AdvisorTestimonials advisor={advisor} />

      <FeedDivider />

      {/* 8. Bio + Contact form side by side */}
      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
          <AdvisorBioCard advisor={advisor} />
          <AdvisorContactForm
            advisorName={advisor.displayName}
            advisorSlug={advisor.slug}
          />
        </div>
      </section>

      {/* 9. Footer attribution */}
      <footer className="border-t border-[#eee] bg-white px-4 py-6 text-center sm:px-6">
        <p className="text-xs text-[#888]">
          Powered by{" "}
          <span className="font-semibold text-[#C59746]">
            Phoenix Voyages
          </span>
        </p>
        <p className="mt-1 text-[10px] text-[#bbb]">
          {firstName}&apos;s personal travel storefront
        </p>
      </footer>
    </>
  );
}
