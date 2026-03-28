import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const metadata: Metadata = {
  title: "Apply to Become a Travel Advisor | Phoenix Voyages",
  description:
    "Submit your application to join the Phoenix Voyages travel advisor network. We review all applications within 2 business days.",
};

const PROVINCES = [
  { value: "AB", label: "Alberta" },
  { value: "BC", label: "British Columbia" },
  { value: "MB", label: "Manitoba" },
  { value: "NB", label: "New Brunswick" },
  { value: "NL", label: "Newfoundland and Labrador" },
  { value: "NS", label: "Nova Scotia" },
  { value: "NT", label: "Northwest Territories" },
  { value: "NU", label: "Nunavut" },
  { value: "ON", label: "Ontario" },
  { value: "PE", label: "Prince Edward Island" },
  { value: "QC", label: "Quebec" },
  { value: "SK", label: "Saskatchewan" },
  { value: "YT", label: "Yukon" },
  { value: "OTHER", label: "Outside Canada" },
] as const;

const EXPERIENCE_LEVELS = [
  { value: "none", label: "No experience — I'm brand new to travel" },
  { value: "1-2", label: "1–2 years" },
  { value: "3-5", label: "3–5 years" },
  { value: "5+", label: "5+ years" },
] as const;

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-16 pb-24 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-[#1A1A1A]/50">
        <Link href="/join" className="hover:text-[#C59746]">
          Join
        </Link>{" "}
        <span className="mx-2">/</span>
        <span className="text-[#1A1A1A]/80">Apply</span>
      </nav>

      <h1 className="font-display text-2xl font-bold tracking-wide text-[#1A1A1A] md:text-3xl">
        Start Your Application
      </h1>
      <p className="mt-3 text-[#1A1A1A]/60">
        Tell us a little about yourself. No formal qualifications required.
      </p>

      {/* Form */}
      <form className="mt-10 space-y-6">
        {/* Name row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">First Name</Label>
            <Input
              id="first-name"
              type="text"
              placeholder="Jane"
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name">Last Name</Label>
            <Input
              id="last-name"
              type="text"
              placeholder="Smith"
              autoComplete="family-name"
            />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="jane@example.com"
            autoComplete="email"
          />
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 (613) 555-0100"
            autoComplete="tel"
          />
        </div>

        {/* Province / State */}
        <div className="space-y-1.5">
          <Label htmlFor="province">Province / State</Label>
          <Select>
            <SelectTrigger id="province" className="w-full">
              <SelectValue placeholder="Select your province or state" />
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Experience Level */}
        <div className="space-y-1.5">
          <Label htmlFor="experience">Travel Industry Experience</Label>
          <Select>
            <SelectTrigger id="experience" className="w-full">
              <SelectValue placeholder="Select your experience level" />
            </SelectTrigger>
            <SelectContent>
              {EXPERIENCE_LEVELS.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Referral */}
        <div className="space-y-1.5">
          <Label htmlFor="referral">
            How did you hear about us?{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="referral"
            type="text"
            placeholder="e.g. Google, a friend, social media…"
          />
        </div>

        {/* Submit */}
        <div className="pt-2">
          <Button
            type="submit"
            size="lg"
            className="w-full bg-[#C59746] text-white hover:bg-[#B08638]"
          >
            Submit Application
          </Button>
          <p className="mt-4 text-center text-sm text-[#1A1A1A]/50">
            Your application will be reviewed by our team within 2 business days.
          </p>
        </div>
      </form>

      {/* Secondary links */}
      <div className="mt-10 text-center text-sm text-[#1A1A1A]/50">
        Have questions first?{" "}
        <Link
          href="/join/learn-more"
          className="font-medium text-[#C59746] underline-offset-4 hover:underline"
        >
          Learn more about joining
        </Link>{" "}
        or{" "}
        <Link
          href="/contact"
          className="font-medium text-[#C59746] underline-offset-4 hover:underline"
        >
          contact us directly
        </Link>
        .
      </div>
    </div>
  );
}
