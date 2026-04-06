'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { TopNav } from './top-nav'
import { useMyProfile } from '@/hooks/use-user-profile'

// Routes exempt from welcome redirect
const EXEMPT_ROUTES = ['/welcome', '/auth', '/profile']

function isExempt(pathname: string): boolean {
  return EXEMPT_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/') || pathname.startsWith(route + '?'),
  )
}

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: profile, isLoading } = useMyProfile()

  useEffect(() => {
    if (isLoading || !profile) return
    if (isExempt(pathname)) return

    const onboardingDone = profile.platformPreferences?.onboardingCompletedAt
    if (!onboardingDone) {
      router.replace('/welcome')
    }
  }, [profile, isLoading, pathname, router])

  return (
    <div className="min-h-screen bg-ash-50">
      <TopNav />
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        {children}
      </main>
    </div>
  )
}
