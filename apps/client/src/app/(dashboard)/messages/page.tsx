"use client";

import { MessageSquare } from "lucide-react";
import { ComingSoonFeature } from "@/components/dashboard/ComingSoonFeature";

// TODO: Future feature — real-time messaging with travel advisor
export default function MessagesPage() {
  return (
    <ComingSoonFeature
      title="Messages"
      icon={MessageSquare}
      description="Real-time messaging with your travel advisor is coming soon. In the meantime, you can reach your advisor by email."
    />
  );
}
