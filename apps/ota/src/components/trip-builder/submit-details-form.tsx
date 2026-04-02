"use client";

import { type FormEvent, useState } from "react";

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

export interface SubmitFormData {
  travelers: number;
  startDate: string;
  flexible: boolean;
  travelStyle: string;
  name: string;
  email: string;
  phone: string;
  specialRequests: string;
}

interface SubmitDetailsFormProps {
  defaultValues: {
    travelers?: number;
    startDate?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  onSubmit: (data: SubmitFormData) => void;
  isSubmitting: boolean;
}

const TRAVEL_STYLES = [
  { value: "relaxed", label: "Relaxed" },
  { value: "adventure", label: "Adventure" },
  { value: "luxury", label: "Luxury" },
  { value: "budget", label: "Budget" },
  { value: "family", label: "Family" },
];

export function SubmitDetailsForm({
  defaultValues,
  onSubmit,
  isSubmitting,
}: SubmitDetailsFormProps) {
  const [travelStyle, setTravelStyle] = useState("relaxed");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);

    const name = (fd.get("name") as string).trim();
    const email = (fd.get("email") as string).trim();
    const phone = (fd.get("phone") as string).trim();
    const travelers = Number(fd.get("travelers")) || 1;
    const startDate = (fd.get("startDate") as string) || "";
    const flexible = fd.get("flexible") === "on";
    const specialRequests = (fd.get("specialRequests") as string).trim();

    if (!name || !email || !phone) {
      setError("Please fill in all required fields.");
      return;
    }

    onSubmit({
      travelers,
      startDate,
      flexible,
      travelStyle,
      name,
      email,
      phone,
      specialRequests,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold text-[#1A1A1A]">Trip Details</h3>

      {/* Travelers */}
      <div className="space-y-1.5">
        <Label htmlFor="travelers">Travelers</Label>
        <Input
          id="travelers"
          name="travelers"
          type="number"
          min={1}
          max={20}
          defaultValue={defaultValues.travelers ?? 2}
        />
      </div>

      {/* Departure date */}
      <div className="space-y-1.5">
        <Label htmlFor="startDate">Departure Date</Label>
        <Input
          id="startDate"
          name="startDate"
          type="date"
          defaultValue={defaultValues.startDate ?? ""}
        />
      </div>

      {/* Flexible dates */}
      <div className="flex items-center gap-2">
        <input
          id="flexible"
          name="flexible"
          type="checkbox"
          className="size-4 rounded border-input accent-[#C59746]"
        />
        <Label htmlFor="flexible" className="font-normal">
          My dates are flexible
        </Label>
      </div>

      {/* Travel style */}
      <div className="space-y-1.5">
        <Label>Travel Style</Label>
        <Select value={travelStyle} onValueChange={(v) => { if (v) setTravelStyle(v); }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select style" />
          </SelectTrigger>
          <SelectContent>
            {TRAVEL_STYLES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <h3 className="pt-2 text-lg font-semibold text-[#1A1A1A]">
        Your Information
      </h3>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues.name ?? ""}
          placeholder="Your full name"
        />
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <Label htmlFor="email">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={defaultValues.email ?? ""}
          placeholder="you@example.com"
        />
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <Label htmlFor="phone">
          Phone <span className="text-destructive">*</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          defaultValue={defaultValues.phone ?? ""}
          placeholder="+1 (555) 000-0000"
        />
      </div>

      {/* Special requests */}
      <div className="space-y-1.5">
        <Label htmlFor="specialRequests">Special Requests</Label>
        <Textarea
          id="specialRequests"
          name="specialRequests"
          placeholder="Dietary requirements, accessibility needs, celebrations..."
          rows={3}
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-[#C59746] text-white hover:bg-[#B08636]"
        size="lg"
      >
        {isSubmitting ? "Submitting..." : "Submit to Advisor"}
      </Button>
    </form>
  );
}
