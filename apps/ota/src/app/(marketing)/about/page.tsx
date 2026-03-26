import type { Metadata } from "next";

import { ContentPage } from "@/components/layout/content-page";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "About Us | Phoenix Voyages",
  description:
    "Phoenix Voyages is a TICO-registered luxury travel agency headquartered in Ottawa, specializing in cruises, destination weddings, group travel, and personalized vacation experiences.",
};

const CORE_VALUES = [
  {
    name: "Personalization",
    description:
      "Every journey is crafted around you — your travel style, preferences, and dreams.",
  },
  {
    name: "Excellence",
    description:
      "We hold ourselves to the highest standards in service, partnerships, and outcomes.",
  },
  {
    name: "Integrity",
    description:
      "Transparent pricing, honest recommendations, and your best interests always first.",
  },
  {
    name: "Cultural Connection",
    description:
      "We believe travel transforms perspectives. We curate experiences that foster genuine connection.",
  },
  {
    name: "Innovation",
    description:
      "We combine AI-driven insights with human expertise to deliver the future of travel planning.",
  },
] as const;

export default function AboutPage() {
  return (
    <ContentPage title="About Phoenix Voyages">
      <p>
        Phoenix Voyages is a TICO-registered travel agency headquartered in the Ottawa area,
        specializing in luxury cruises, destination weddings, group travel, and personalized
        vacation experiences.
      </p>

      <p>
        Our team of expert Travel Advisors combines the power of AI-driven recommendations with
        years of hands-on travel expertise to create unforgettable journeys.
      </p>

      <p>
        As a member of the Travel Leaders Network, we have access to exclusive deals, preferred
        partnerships with the world&apos;s leading cruise lines and tour operators, and
        industry-leading training.
      </p>

      <Separator className="my-8" />

      <div>
        <h2 className="font-display text-lg font-bold tracking-wide text-[#1A1A1A] md:text-xl">
          Core Values
        </h2>
        <ul className="mt-6 space-y-5">
          {CORE_VALUES.map((value) => (
            <li key={value.name}>
              <span className="font-semibold text-[#C59746]">{value.name}</span>
              <span className="text-[#1A1A1A]/70"> — {value.description}</span>
            </li>
          ))}
        </ul>
      </div>
    </ContentPage>
  );
}
