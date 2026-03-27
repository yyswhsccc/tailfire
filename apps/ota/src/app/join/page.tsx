import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Join Phoenix Voyages | Become a Travel Agent",
  description:
    "Join our team of independent travel advisors. Earn competitive commissions, access exclusive deals, and build your own travel business with Phoenix Voyages.",
};

const BENEFITS = [
  {
    title: "Competitive Commissions",
    description:
      "Earn industry-leading commissions on every booking — cruises, tours, hotels, and more. Your earning potential grows as your client base grows.",
    icon: "💰",
  },
  {
    title: "Global Network",
    description:
      "Tap into our Travel Leaders Network membership for exclusive rates, preferred partnerships with top cruise lines and tour operators, and fam trip opportunities.",
    icon: "🌍",
  },
  {
    title: "Professional Development",
    description:
      "Comprehensive training, certification support, and ongoing mentorship from experienced travel professionals to help you succeed.",
    icon: "🎓",
  },
] as const;

const TESTIMONIALS = [
  {
    quote:
      "Joining Phoenix Voyages was the best career decision I ever made. I work from home, set my own hours, and earn more than I ever did in an office.",
    name: "Sarah M.",
    location: "Ottawa, ON",
    years: "3 years with Phoenix Voyages",
  },
  {
    quote:
      "The support and training are second to none. From day one I had everything I needed to start booking confidently and earning real income.",
    name: "David L.",
    location: "Toronto, ON",
    years: "2 years with Phoenix Voyages",
  },
  {
    quote:
      "I had zero travel industry experience when I started. Within six months I had a full client roster. The team genuinely wants you to succeed.",
    name: "Marie-Claude B.",
    location: "Montreal, QC",
    years: "4 years with Phoenix Voyages",
  },
] as const;

export default function JoinPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-[#1A1A1A] px-4 py-24 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-bold tracking-wide text-white md:text-5xl lg:text-6xl">
            Join Our Team of Travel Advisors
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-white/70">
            Become part of Phoenix Voyages and help create unforgettable journeys — on your own
            schedule, from wherever you are.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/join/register"
              className="inline-flex min-w-44 items-center justify-center rounded-md px-6 py-3 text-sm font-medium bg-[#C59746] text-white hover:bg-[#B08638] transition-colors"
            >
              Start Your Application
            </Link>
            <Link
              href="/join/learn-more"
              className="inline-flex min-w-44 items-center justify-center rounded-md border border-white/30 bg-transparent px-6 py-3 text-sm font-medium text-white hover:bg-white/10 hover:text-white transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-2xl font-bold tracking-wide text-[#1A1A1A] md:text-3xl">
            Why Advisors Choose Phoenix Voyages
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <Card key={benefit.title} className="border-border">
                <CardHeader>
                  <div className="text-3xl">{benefit.icon}</div>
                  <CardTitle className="font-display text-base font-bold tracking-wide text-[#1A1A1A]">
                    {benefit.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-[#1A1A1A]/70">
                    {benefit.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* Lead Capture */}
      <section className="bg-muted px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="font-display text-2xl font-bold tracking-wide text-[#1A1A1A] md:text-3xl">
            Interested in Learning More?
          </h2>
          <p className="mt-4 text-[#1A1A1A]/70">
            Leave your name and email and we&apos;ll send you our advisor welcome kit — no
            commitment required.
          </p>
          <form className="mt-8 space-y-4 text-left">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Name</Label>
              <Input id="lead-name" type="text" placeholder="Your full name" autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-email">Email</Label>
              <Input
                id="lead-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="w-full bg-[#C59746] text-white hover:bg-[#B08638]"
            >
              Send Me the Welcome Kit
            </Button>
          </form>
        </div>
      </section>

      <Separator />

      {/* Testimonials */}
      <section className="bg-white px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-2xl font-bold tracking-wide text-[#1A1A1A] md:text-3xl">
            Hear From Our Advisors
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <Card key={t.name} className="border-border">
                <CardContent className="pt-6">
                  <blockquote className="text-sm italic leading-relaxed text-[#1A1A1A]/80">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div className="mt-4">
                    <p className="font-semibold text-[#1A1A1A]">{t.name}</p>
                    <p className="text-xs text-[#1A1A1A]/50">{t.location}</p>
                    <p className="text-xs text-[#C59746]">{t.years}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-[#C59746] px-4 py-20 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-display text-3xl font-bold tracking-wide text-white md:text-4xl">
            Ready to Start Your Journey?
          </h2>
          <p className="mt-4 text-white/80">
            Join dozens of independent advisors already building their business with Phoenix
            Voyages.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/join/register"
              className="inline-flex min-w-44 items-center justify-center rounded-md px-6 py-3 text-sm font-medium bg-white text-[#C59746] hover:bg-white/90 transition-colors"
            >
              Apply Now
            </Link>
            <Link
              href="/join/learn-more"
              className="inline-flex min-w-44 items-center justify-center rounded-md border border-white/40 bg-transparent px-6 py-3 text-sm font-medium text-white hover:bg-white/10 hover:text-white transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
