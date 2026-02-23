"use client";

import { CreditCard } from "lucide-react";
import { ComingSoonFeature } from "@/components/dashboard/ComingSoonFeature";

// TODO: Future feature — payment history and invoice management
export default function PaymentsPage() {
  return (
    <ComingSoonFeature
      title="Payments"
      icon={CreditCard}
      description="View your payment history and manage invoices. This feature is coming soon."
    />
  );
}
