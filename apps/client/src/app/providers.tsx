"use client"

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider, Toaster, SonnerToaster } from "@tailfire/ui-public"
import { ConsultantProvider } from "@/context/consultant-context"
import { AuthProvider } from "@/context/auth-context"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ConsultantProvider>
            {children}
            <Toaster />
            <SonnerToaster />
          </ConsultantProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
