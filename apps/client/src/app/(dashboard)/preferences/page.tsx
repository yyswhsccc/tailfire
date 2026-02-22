"use client";

import { Heart } from "lucide-react";
import { ComingSoonFeature } from "@/components/dashboard/ComingSoonFeature";

// TODO: Future feature — travel preferences (accommodation, flight, dining)
export default function PreferencesPage() {
  return (
    <ComingSoonFeature
      title="Travel Preferences"
      icon={Heart}
      description="Customize your accommodation, flight, and dining preferences. This feature is coming soon."
    />
  );
}
