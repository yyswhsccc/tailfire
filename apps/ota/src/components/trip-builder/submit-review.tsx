"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { TripComponent } from "./trip-basket-store";
import { SubmitSummary } from "./submit-summary";
import { SubmitDetailsForm, type SubmitFormData } from "./submit-details-form";
import { SubmitSuccess } from "./submit-success";

interface SubmitReviewProps {
  requestId: string;
  components: TripComponent[];
  startDate?: string;
  travelers?: number;
  isIdentified: boolean;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  onBack: () => void;
}

type Step = "review" | "submitting" | "success";

export function SubmitReview({
  requestId,
  components,
  startDate,
  travelers,
  isIdentified,
  contactName,
  contactEmail,
  contactPhone,
  onBack,
}: SubmitReviewProps) {
  const [step, setStep] = useState<Step>("review");
  const [tripId, setTripId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: SubmitFormData) {
    setStep("submitting");
    setError(null);

    try {
      // 1. Link identity if not yet identified
      if (!isIdentified) {
        const identityRes = await fetch(
          `/api/trip-requests/${requestId}/identity`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: data.email,
              name: data.name,
              phone: data.phone,
            }),
          },
        );

        if (!identityRes.ok) {
          throw new Error("Failed to save contact information");
        }
      }

      // 2. Submit the trip request
      const submitRes = await fetch(
        `/api/trip-requests/${requestId}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            travelers: data.travelers,
            startDate: data.startDate,
            flexible: data.flexible,
            travelStyle: data.travelStyle,
            specialRequests: data.specialRequests,
          }),
        },
      );

      if (!submitRes.ok) {
        throw new Error("Failed to submit trip request");
      }

      const result = (await submitRes.json()) as { tripId?: string };
      setTripId(result.tripId ?? null);
      setStep("success");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
      setStep("review");
    }
  }

  if (step === "success") {
    return <SubmitSuccess tripId={tripId ?? undefined} />;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" className="size-3.5" />
        Back to board
      </Button>

      {/* Summary card */}
      <SubmitSummary components={components} />

      <Separator />

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Details form */}
      <SubmitDetailsForm
        defaultValues={{
          travelers,
          startDate,
          name: contactName,
          email: contactEmail,
          phone: contactPhone,
        }}
        onSubmit={handleSubmit}
        isSubmitting={step === "submitting"}
      />
    </div>
  );
}
