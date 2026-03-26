import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { publicFetch } from "@/lib/api";
import type { AdvisorProfile } from "@/types/advisor";
import type { Deal } from "@/types/deal";
import { AdvisorContextBar } from "@/components/advisor/advisor-context-bar";
import { DealCard } from "@/components/deals/deal-card";

export const revalidate = 3600; // ISR: revalidate every hour

interface AdvisorDealsPageProps {
  params: Promise<{ slug: string }>;
}

async function fetchAdvisor(slug: string): Promise<AdvisorProfile | null> {
  try {
    return await publicFetch<AdvisorProfile>(
      `/advisor-profiles/by-slug/${slug}`,
      { next: { tags: ["advisors", `advisor-${slug}`] } },
    );
  } catch {
    return null;
  }
}

async function fetchAdvisorDeals(slug: string): Promise<Deal[]> {
  try {
    return await publicFetch<Deal[]>(
      `/advisor-profiles/by-slug/${slug}/deals`,
      { next: { tags: [`advisor-${slug}-deals`] } },
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: AdvisorDealsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const advisor = await fetchAdvisor(slug);

  if (!advisor) {
    return { title: "Advisor Not Found | Phoenix Voyages" };
  }

  const firstName = advisor.displayName.split(" ")[0];
  const title = `${firstName}'s Curated Deals — ${advisor.displayName} | Phoenix Voyages`;
  const description = `Browse travel deals hand-picked by ${advisor.displayName}, a Phoenix Voyages travel advisor. ${
    advisor.specialties?.length
      ? `Specialising in ${advisor.specialties.slice(0, 3).join(", ")}.`
      : ""
  }`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/advisor/${advisor.slug}/deals`,
    },
  };
}

export default async function AdvisorDealsPage({
  params,
}: AdvisorDealsPageProps) {
  const { slug } = await params;

  const [advisor, deals] = await Promise.all([
    fetchAdvisor(slug),
    fetchAdvisorDeals(slug),
  ]);

  if (!advisor) {
    notFound();
  }

  const firstName = advisor.displayName.split(" ")[0];

  return (
    <div className="min-h-screen bg-white">
      {/* Advisor context bar */}
      <AdvisorContextBar advisor={advisor} />

      {/* Page header */}
      <section className="border-b border-border px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#1A1A1A] sm:text-3xl">
            {firstName}&apos;s Picks
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Travel deals personally selected by {advisor.displayName}
          </p>
        </div>
      </section>

      {/* Deals grid */}
      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {deals.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {deals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  advisorName={firstName}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-20 text-center">
              <p className="text-lg font-semibold text-[#1A1A1A]">
                No deals yet
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {advisor.displayName} hasn&apos;t curated any deals yet.
                Check back soon or browse all deals.
              </p>
              <Link
                href="/deals"
                className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#C59746] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638]"
              >
                Browse All Deals
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-[#faf6f0] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-xl font-bold text-[#1A1A1A]">
            Not finding what you need?
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {firstName} can curate a personalised itinerary just for you. Reach
            out directly to discuss your travel dreams.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href={`/advisor/${advisor.slug}#contact`}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#C59746] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B08638] sm:w-auto"
            >
              Contact {firstName}
            </Link>
            <Link
              href="/deals"
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-white px-6 py-2.5 text-sm font-semibold text-[#1A1A1A] transition-colors hover:bg-gray-50 sm:w-auto"
            >
              Browse All Deals
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
