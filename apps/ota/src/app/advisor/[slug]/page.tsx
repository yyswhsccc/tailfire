import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { publicFetch } from "@/lib/api";
import type { AdvisorProfile } from "@/types/advisor";
import { AdvisorProfileHeader } from "@/components/advisor/advisor-profile-header";
import { AdvisorBioCard } from "@/components/advisor/advisor-bio-card";
import { AdvisorDestinations } from "@/components/advisor/advisor-destinations";
import { AdvisorReviews } from "@/components/advisor/advisor-reviews";

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

export default async function AdvisorPage({ params }: AdvisorPageProps) {
  const { slug } = await params;
  const advisor = await fetchAdvisor(slug);

  if (!advisor) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <AdvisorProfileHeader advisor={advisor} />
      <AdvisorBioCard advisor={advisor} />
      <AdvisorDestinations advisor={advisor} />
      <AdvisorReviews advisor={advisor} />
    </div>
  );
}
