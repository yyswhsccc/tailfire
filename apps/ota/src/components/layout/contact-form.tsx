"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SUBJECT_OPTIONS = [
  { value: "general", label: "General Inquiry" },
  { value: "trip-planning", label: "Trip Planning" },
  { value: "group-travel", label: "Group Travel" },
  { value: "destination-wedding", label: "Destination Wedding" },
  { value: "agent-recruitment", label: "Agent Recruitment" },
  { value: "other", label: "Other" },
] as const;

export function ContactForm() {
  return (
    <div className="space-y-8">
      <form className="space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" type="text" placeholder="Your full name" autoComplete="name" />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        {/* Phone (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor="phone">
            Phone{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 (613) 555-0100"
            autoComplete="tel"
          />
        </div>

        {/* Subject */}
        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Select>
            <SelectTrigger id="subject" className="w-full">
              <SelectValue placeholder="Select a subject" />
            </SelectTrigger>
            <SelectContent>
              {SUBJECT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Message */}
        <div className="space-y-1.5">
          <Label htmlFor="message">Message</Label>
          <Textarea
            id="message"
            placeholder="Tell us how we can help…"
            className="min-h-32"
          />
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full bg-[#C59746] text-white hover:bg-[#B08638]"
        >
          Send Message
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Or{" "}
        <Link
          href="/"
          className="font-medium text-[#C59746] underline-offset-4 hover:underline"
        >
          talk to our AI concierge
        </Link>{" "}
        for instant answers.
      </p>
    </div>
  );
}
