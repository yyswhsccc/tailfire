import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Learn More About Becoming a Travel Advisor | Phoenix Voyages",
  description:
    "Explore the full benefits of joining Phoenix Voyages as an independent travel advisor — flexible hours, training, commissions, fam trips, and more.",
};

const EXPANDED_BENEFITS = [
  {
    title: "Flexible Hours",
    description:
      "Work when and where you want. Whether you want part-time supplemental income or a full-time travel career, you set your own schedule.",
  },
  {
    title: "No Experience Required",
    description:
      "We welcome career-changers and first-timers. Our training program is designed to take you from zero to booking in weeks, not years.",
  },
  {
    title: "Comprehensive Training",
    description:
      "Access our online learning portal, live webinars, supplier certification courses, and one-on-one mentorship with senior advisors.",
  },
  {
    title: "Exclusive Deals & FAM Trips",
    description:
      "Get access to supplier-exclusive rates for your clients and familiarization trips to experience destinations and ships firsthand.",
  },
  {
    title: "Travel Leaders Network",
    description:
      "Join one of North America's largest travel agency networks, unlocking preferred supplier programs, marketing tools, and industry events.",
  },
  {
    title: "Own Your Client Relationships",
    description:
      "Your clients are yours. We provide the tools, technology, and back-office support — you build the relationships and the business.",
  },
] as const;

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Apply",
    description:
      "Submit a short application telling us about yourself and your interest in travel. No formal qualifications required.",
  },
  {
    step: "2",
    title: "Train",
    description:
      "Complete our onboarding program covering booking systems, supplier relationships, and sales fundamentals. Most advisors finish in 2–4 weeks.",
  },
  {
    step: "3",
    title: "Earn",
    description:
      "Start booking for your clients and earning commissions. The more you book, the more you earn — with no cap on your potential.",
  },
] as const;

const FAQ = [
  {
    q: "Do I need a travel agent license?",
    a: "Requirements vary by province. In Ontario, advisors must be TICO-registered. Phoenix Voyages guides you through the certification process — and in many cases can operate under our registration while you complete yours.",
  },
  {
    q: "How much can I earn?",
    a: "Commissions vary by supplier and product type, typically ranging from 10% to 18% of the booking value. Your income scales directly with how many clients you serve and how much they travel.",
  },
  {
    q: "Do I need to work full-time?",
    a: "Not at all. Many of our advisors start part-time while keeping their day jobs. There's no minimum booking requirement to remain active.",
  },
  {
    q: "What technology and tools are included?",
    a: "You get access to our booking platform, CRM, marketing templates, supplier portals, and our AI-powered travel planning tools at no extra cost.",
  },
  {
    q: "Is there an upfront cost?",
    a: "There is a one-time registration and setup fee that covers onboarding, TICO registration support, and access to our tools. Contact us for current pricing.",
  },
  {
    q: "What kinds of travel can I book?",
    a: "Anything your clients dream of — cruises, all-inclusive resorts, tours, river cruises, destination weddings, group travel, flights, hotels, and more. No restrictions.",
  },
] as const;

export default function LearnMorePage() {
  return (
    <>
      {/* Header */}
      <section className="bg-[#1A1A1A] px-4 py-20 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <nav className="mb-4 text-sm text-white/50">
            <Link href="/join" className="hover:text-white/80">
              Join
            </Link>{" "}
            <span className="mx-2">/</span>
            <span className="text-white/80">Learn More</span>
          </nav>
          <h1 className="font-display text-4xl font-bold tracking-wide text-white md:text-5xl">
            Everything You Need to Know
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-white/70">
            A full picture of life as a Phoenix Voyages Travel Advisor.
          </p>
        </div>
      </section>

      {/* Expanded Benefits */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl font-bold tracking-wide text-[#1A1A1A] md:text-3xl">
            What You Get
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {EXPANDED_BENEFITS.map((b) => (
              <Card key={b.title} className="border-border">
                <CardHeader>
                  <CardTitle className="font-display text-sm font-bold tracking-wide text-[#C59746]">
                    {b.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-[#1A1A1A]/70">{b.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* How It Works */}
      <section className="bg-muted px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center font-display text-2xl font-bold tracking-wide text-[#1A1A1A] md:text-3xl">
            How It Works
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#C59746] font-display text-xl font-bold text-white">
                  {step.step}
                </div>
                <h3 className="mt-4 font-display text-base font-bold tracking-wide text-[#1A1A1A]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#1A1A1A]/70">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* Commission Overview */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold tracking-wide text-[#1A1A1A] md:text-3xl">
            Commission Structure
          </h2>
          <p className="mt-6 leading-relaxed text-[#1A1A1A]/70">
            Phoenix Voyages advisors earn commissions paid directly from suppliers — the industry
            standard model that keeps your income transparent and performance-driven.
          </p>
          <ul className="mt-6 space-y-4 text-sm leading-relaxed text-[#1A1A1A]/80">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-[#C59746]">&#10003;</span>
              <span>
                <strong>Cruises:</strong> Competitive commission rates from all major cruise lines,
                with bonus commissions through our Travel Leaders Network preferred status.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-[#C59746]">&#10003;</span>
              <span>
                <strong>All-Inclusives &amp; Hotels:</strong> Commissions on room rates, with
                additional supplier incentives for volume bookings.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-[#C59746]">&#10003;</span>
              <span>
                <strong>Tours &amp; River Cruises:</strong> Strong commission structures from
                premium operators like Globus, Tauck, and Avalon Waterways.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-[#C59746]">&#10003;</span>
              <span>
                <strong>Service Fees:</strong> You may charge planning fees at your discretion —
                a growing industry standard that adds to your bottom line.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <Separator />

      {/* FAQ */}
      <section className="bg-muted px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold tracking-wide text-[#1A1A1A] md:text-3xl">
            Frequently Asked Questions
          </h2>
          <dl className="mt-10 space-y-8">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="font-semibold text-[#1A1A1A]">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-[#1A1A1A]/70">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#C59746] px-4 py-20 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-3xl font-bold tracking-wide text-white md:text-4xl">
            Ready to Apply?
          </h2>
          <p className="mt-4 text-white/80">
            It takes less than 5 minutes to submit your application. Our team reviews every
            application personally within 2 business days.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/join/register"
              className="inline-flex min-w-44 items-center justify-center rounded-md px-6 py-3 text-sm font-medium bg-white text-[#C59746] hover:bg-white/90 transition-colors"
            >
              Start Your Application
            </Link>
            <Link
              href="/join"
              className="inline-flex min-w-44 items-center justify-center rounded-md border border-white/40 bg-transparent px-6 py-3 text-sm font-medium text-white hover:bg-white/10 hover:text-white transition-colors"
            >
              Back to Join
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
