"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openChat } from "@/components/chat/chat-widget";

interface SubmitSuccessProps {
  tripId?: string;
}

export function SubmitSuccess({ tripId }: SubmitSuccessProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <CheckCircle className="size-16 text-emerald-500" />

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-[#1A1A1A]">
          Your Dream Trip Has Been Submitted!
        </h2>
        <p className="text-muted-foreground">
          An advisor will review and reach out within 2 hours.
        </p>
        {tripId && (
          <p className="text-xs text-muted-foreground">
            Reference: {tripId}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          render={<Link href="/search/flights" />}
        >
          Search Another Trip
        </Button>
        <Button
          className="bg-[#C59746] text-white hover:bg-[#B08636]"
          onClick={() =>
            openChat(
              "I just submitted my dream trip and have a question about it.",
            )
          }
        >
          Talk to AI
        </Button>
      </div>
    </div>
  );
}
