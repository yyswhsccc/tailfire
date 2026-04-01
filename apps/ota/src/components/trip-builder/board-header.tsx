"use client";

import Link from "next/link";
import { Share2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

interface BoardHeaderProps {
  title: string | null;
  componentCount: number;
  totalEstimate: number;
  readOnly: boolean;
  requestId: string;
}

function formatCurrency(cents: number): string {
  const dollars = Math.round(cents / 100);
  return dollars.toLocaleString("en-US");
}

export function BoardHeader({
  title,
  componentCount,
  totalEstimate,
  readOnly,
  requestId,
}: BoardHeaderProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">
          {title || "My Dream Trip"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {componentCount} component{componentCount !== 1 ? "s" : ""} &middot;
          ~${formatCurrency(totalEstimate)} estimated
        </p>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2 pt-2 sm:pt-0">
          <Button variant="outline" size="sm" render={<Link href={`/my-trip/${requestId}`} />}>
            <Share2 data-icon="inline-start" className="size-3.5" />
            Share
          </Button>
          <Button
            size="sm"
            className="bg-[#C59746] text-white hover:bg-[#B08636]"
            render={<Link href={`/my-trip/${requestId}/submit`} />}
          >
            <Send data-icon="inline-start" className="size-3.5" />
            Submit Trip
          </Button>
        </div>
      )}
    </div>
  );
}
