"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth"
import { Skeleton } from "@tailfire/ui-public"

type AuthGuardProps = {
  children: ReactNode
  fallback?: ReactNode
  redirectTo?: string
}

export function AuthGuard({ children, fallback, redirectTo }: AuthGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-phoenix-charcoal p-8">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-12 w-64 bg-phoenix-charcoal/50" />
          <Skeleton className="h-64 w-full bg-phoenix-charcoal/50" />
          <Skeleton className="h-32 w-full bg-phoenix-charcoal/50" />
        </div>
      </div>
    )
  }

  // User is not authenticated
  if (!user) {
    if (redirectTo) {
      router.push(redirectTo)
      return null
    }
    if (fallback) {
      return <>{fallback}</>
    }
    router.push("/login")
    return null
  }

  // User is authenticated, render children
  return <>{children}</>
}
