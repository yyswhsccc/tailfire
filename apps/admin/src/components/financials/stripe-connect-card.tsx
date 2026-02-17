'use client'

/**
 * Stripe Connect Card Component
 *
 * Manages Stripe Connect integration for agencies:
 * - Onboarding status
 * - Dashboard access
 * - Account status monitoring
 */

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CreditCard,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  RefreshCw,
} from 'lucide-react'
import {
  useAgencySettings,
  useStripeAccountStatus,
  useStartStripeOnboarding,
  useRefreshStripeStatus,
  useStripeDashboardLink,
} from '@/hooks/use-agency-settings'
import type { StripeAccountStatus } from '@tailfire/shared-types/api'

// Status configuration
const statusConfig: Record<
  StripeAccountStatus,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  not_connected: {
    label: 'Not Connected',
    color: 'bg-gray-100 text-gray-800',
    icon: XCircle,
  },
  pending: {
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800',
    icon: Clock,
  },
  active: {
    label: 'Active',
    color: 'bg-green-100 text-green-800',
    icon: CheckCircle,
  },
  restricted: {
    label: 'Restricted',
    color: 'bg-orange-100 text-orange-800',
    icon: AlertCircle,
  },
  disabled: {
    label: 'Disabled',
    color: 'bg-red-100 text-red-800',
    icon: XCircle,
  },
}

interface StripeConnectCardProps {
  agencyId: string
}

export function StripeConnectCard({ agencyId }: StripeConnectCardProps) {
  const { data: settings, isLoading: settingsLoading } = useAgencySettings(agencyId)
  const { data: stripeStatus, isLoading: statusLoading } = useStripeAccountStatus(agencyId)
  const startOnboarding = useStartStripeOnboarding(agencyId)
  const refreshStatus = useRefreshStripeStatus(agencyId)
  const getDashboardLink = useStripeDashboardLink(agencyId)

  const isLoading = settingsLoading || statusLoading

  if (isLoading) {
    return <StripeConnectCardSkeleton />
  }

  const status = settings?.stripeAccountStatus ?? 'not_connected'
  const config = statusConfig[status]
  const StatusIcon = config.icon

  const handleStartOnboarding = () => {
    const baseUrl = window.location.origin
    startOnboarding.mutate({
      returnUrl: `${baseUrl}/settings?stripe=success`,
      refreshUrl: `${baseUrl}/settings?stripe=refresh`,
    })
  }

  const handleRefreshStatus = () => {
    refreshStatus.mutate()
  }

  const handleOpenDashboard = () => {
    getDashboardLink.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Stripe Connect
            </CardTitle>
            <CardDescription>
              Accept payments from your clients through Stripe
            </CardDescription>
          </div>
          <Badge className={config.color}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Details */}
        {status === 'not_connected' ? (
          <div className="p-4 border border-dashed border-ash-200 rounded-lg text-center">
            <CreditCard className="mx-auto h-12 w-12 text-ash-400" />
            <h4 className="mt-4 text-sm font-medium text-ash-900">
              Connect your Stripe account
            </h4>
            <p className="mt-1 text-sm text-ash-500">
              Enable payment collection by connecting to Stripe.
            </p>
            <Button
              className="mt-4"
              onClick={handleStartOnboarding}
              disabled={startOnboarding.isPending}
            >
              {startOnboarding.isPending ? 'Redirecting...' : 'Connect Stripe'}
            </Button>
          </div>
        ) : status === 'pending' ? (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-800">Onboarding in progress</h4>
                  <p className="mt-1 text-sm text-yellow-700">
                    Complete your Stripe account setup to start accepting payments.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleStartOnboarding} disabled={startOnboarding.isPending}>
                Continue Setup
              </Button>
              <Button
                variant="outline"
                onClick={handleRefreshStatus}
                disabled={refreshStatus.isPending}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshStatus.isPending ? 'animate-spin' : ''}`} />
                Refresh Status
              </Button>
            </div>
          </div>
        ) : status === 'active' ? (
          <div className="space-y-4">
            {/* Account Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-ash-50 rounded-lg">
                <p className="text-sm text-ash-500">Charges</p>
                <p className="flex items-center gap-2 font-medium">
                  {stripeStatus?.chargesEnabled ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Enabled
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      Disabled
                    </>
                  )}
                </p>
              </div>
              <div className="p-3 bg-ash-50 rounded-lg">
                <p className="text-sm text-ash-500">Payouts</p>
                <p className="flex items-center gap-2 font-medium">
                  {stripeStatus?.payoutsEnabled ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Enabled
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-500" />
                      Disabled
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleOpenDashboard}
                disabled={getDashboardLink.isPending}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Stripe Dashboard
              </Button>
              <Button
                variant="ghost"
                onClick={handleRefreshStatus}
                disabled={refreshStatus.isPending}
              >
                <RefreshCw className={`h-4 w-4 ${refreshStatus.isPending ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        ) : status === 'restricted' ? (
          <div className="space-y-4">
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-orange-800">Action required</h4>
                  <p className="mt-1 text-sm text-orange-700">
                    Additional information is needed to enable full functionality.
                  </p>
                  {stripeStatus?.requirements && stripeStatus.requirements.length > 0 && (
                    <ul className="mt-2 text-sm text-orange-700 list-disc list-inside">
                      {stripeStatus.requirements.map((req, i) => (
                        <li key={i}>{req.replace(/_/g, ' ')}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleStartOnboarding} disabled={startOnboarding.isPending}>
                Complete Requirements
              </Button>
              <Button
                variant="outline"
                onClick={handleRefreshStatus}
                disabled={refreshStatus.isPending}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshStatus.isPending ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-800">Account disabled</h4>
                <p className="mt-1 text-sm text-red-700">
                  Your Stripe account has been disabled. Please contact Stripe support.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Loading skeleton
function StripeConnectCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  )
}
