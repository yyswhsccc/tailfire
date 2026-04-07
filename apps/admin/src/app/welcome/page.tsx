'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-user-profile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Plane,
  Users,
  CalendarDays,
  CreditCard,
  HelpCircle,
  Bug,
} from 'lucide-react'

const features = [
  {
    icon: Plane,
    title: 'Trips',
    description: 'Manage client trips, itineraries, and bookings from planning through completion.',
  },
  {
    icon: Users,
    title: 'Contacts',
    description: 'Your CRM — import, merge, and track client relationships and lifecycle.',
  },
  {
    icon: CalendarDays,
    title: 'Calendar',
    description: 'See tasks, final payment deadlines, and trip dates at a glance.',
  },
  {
    icon: CreditCard,
    title: 'Payments',
    description: 'Track deposits, balances, and commission across all bookings.',
  },
]

export default function WelcomePage() {
  const router = useRouter()
  const { data: profile } = useMyProfile()
  const updateProfile = useUpdateMyProfile()

  const firstName = profile?.firstName || 'there'

  const [buttonError, setButtonError] = useState<string | null>(null)

  const handleGetStarted = async () => {
    setButtonError(null)
    try {
      await updateProfile.mutateAsync({
        platformPreferences: {
          ...(profile?.platformPreferences || {}),
          onboardingCompletedAt: new Date().toISOString(),
        },
      })
      router.replace('/dashboard')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('Onboarding error:', msg)
      setButtonError(msg)
    }
  }

  return (
    <div className="min-h-screen bg-ash-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold text-ash-900">
            Welcome to Tailfire, {firstName}
          </h1>
          <p className="text-ash-600">
            Your travel agency management platform. Here&apos;s what you can do.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((feature) => (
            <Card key={feature.title} className="border-ash-200">
              <CardContent className="p-5 flex gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  <feature.icon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-ash-900">{feature.title}</h3>
                  <p className="text-sm text-ash-500 mt-1">{feature.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Help and Bug Reporting */}
        <Card className="border-ash-200 bg-ash-50">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-5 w-5 text-ash-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-ash-900">Need help?</p>
                <p className="text-sm text-ash-500">
                  Click the <strong>?</strong> icon in the top navigation bar to open the help guide. It covers every feature in detail.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Bug className="h-5 w-5 text-ash-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-ash-900">Found a bug or have a feature request?</p>
                <p className="text-sm text-ash-500">
                  Click the <strong>?</strong> icon, then <strong>&quot;Report a Bug&quot;</strong>. It automatically captures a screenshot and creates a ticket for our team.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Get Started Button */}
        <div className="text-center space-y-2">
          <Button
            size="lg"
            onClick={handleGetStarted}
            disabled={updateProfile.isPending}
          >
            {updateProfile.isPending ? 'Setting up...' : 'Get Started'}
          </Button>
          {buttonError && (
            <p className="text-sm text-red-600">{buttonError}</p>
          )}
        </div>
      </div>
    </div>
  )
}
