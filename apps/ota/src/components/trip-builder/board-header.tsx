"use client";

import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShareButton } from "./share-button";

interface BoardHeaderProps {
  title: string | null;
  componentCount: number;
  totalEstimate: number;
  readOnly: boolean;
  requestId: string;
  onSubmitClick?: () => void;
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
  onSubmitClick,
}: BoardHeaderProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {/* Title is read-only — editable title requires a PATCH /title endpoint */}
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
          <ShareButton requestId={requestId} />
          <Button
            size="sm"
            className="bg-[#C59746] text-white hover:bg-[#B08636]"
            onClick={onSubmitClick}
          >
            <Send data-icon="inline-start" className="size-3.5" />
            Submit Trip
          </Button>
        </div>
      )}
    </div>
  );
}
