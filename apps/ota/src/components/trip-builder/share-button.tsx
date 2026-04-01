"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  requestId: string;
}

export function ShareButton({ requestId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleShare() {
    if (copied || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/trip-requests/${requestId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) throw new Error("Share failed");

      const data = (await res.json()) as { shareToken: string; shareUrl: string };
      const fullUrl = window.location.origin + data.shareUrl;

      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail — share is non-critical
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleShare}
      disabled={isLoading}
    >
      {copied ? (
        <>
          <Check data-icon="inline-start" className="size-3.5" />
          Copied!
        </>
      ) : (
        <>
          <Share2 data-icon="inline-start" className="size-3.5" />
          Share
        </>
      )}
    </Button>
  );
}
