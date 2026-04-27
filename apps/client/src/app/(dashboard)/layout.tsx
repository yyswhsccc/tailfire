"use client";

import type { ReactNode } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard redirectTo="/login">
      <div className="min-h-screen bg-phoenix-charcoal">
        <DashboardHeader />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
