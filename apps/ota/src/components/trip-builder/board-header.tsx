"use client";

import { Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShareButton } from "./share-button";

interface BoardHeaderProps {
  title: string | null;
  componentCount: number;
  totalEstimate: number;
  readOnly: boolean;
  requestId: string;
  onSubmitClick?: () => void;
  aiPanelOpen?: boolean;
  onAiToggle?: () => void;
}

function formatCurrency(dollars: number): string {
  return Math.round(dollars).toLocaleString("en-US");
}

export function BoardHeader({
  title,
  componentCount,
  totalEstimate,
  readOnly,
  requestId,
  onSubmitClick,
  aiPanelOpen,
  onAiToggle,
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
          {onAiToggle && (
            <Button
              size="sm"
              variant={aiPanelOpen ? "default" : "outline"}
              className={
                aiPanelOpen
                  ? "hidden bg-[#1A1A1A] text-[#C59746] hover:bg-[#252525] lg:flex"
                  : "hidden border-[#1A1A1A]/20 text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-[#C59746] lg:flex"
              }
              onClick={onAiToggle}
            >
              <Sparkles className="size-3.5" />
              AI
            </Button>
          )}
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
