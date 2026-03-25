'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Shield } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Label,
  Textarea,
  cn,
} from '@tailfire/ui-public'
import type { TripInsurancePackageDto } from '@tailfire/shared-types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface WaiverFormProps {
  token: string
  tripName: string
  tripStartDate: string | null
  tripEndDate: string | null
  agencyName: string
  travelerIds: string[]
  travelerNames: string[] // primary traveler + dependent names
  packages: TripInsurancePackageDto[]
}

type FormPath = 'choose' | 'purchase' | 'decline'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatCents(cents: number, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function formatPolicyType(type: string) {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

function FormHeader({
  agencyName,
  tripName,
  tripStartDate,
  tripEndDate,
  travelerNames,
}: {
  agencyName: string
  tripName: string
  tripStartDate: string | null
  tripEndDate: string | null
  travelerNames: string[]
}) {
  const start = formatDate(tripStartDate)
  const end = formatDate(tripEndDate)

  return (
    <div className="text-center mb-8">
      <p className="text-sm text-muted-foreground mb-1">{agencyName}</p>
      <h1 className="font-display text-2xl font-bold text-foreground mb-1">{tripName}</h1>
      {(start || end) && (
        <p className="text-sm text-muted-foreground mb-3">
          {start}
          {start && end && ' – '}
          {end}
        </p>
      )}
      <div className="inline-flex items-center gap-2 bg-primary/10 rounded-full px-4 py-1.5 mb-4">
        <Shield className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-primary">Insurance Coverage Decision</span>
      </div>
      <div className="text-sm text-muted-foreground">
        {travelerNames.length === 1 ? (
          <p>
            This form is for: <strong className="text-foreground">{travelerNames[0]}</strong>
          </p>
        ) : (
          <div>
            <p className="mb-1">This form covers:</p>
            <ul className="space-y-0.5">
              {travelerNames.map((name, i) => (
                <li key={i} className="font-medium text-foreground">
                  {name}
                  {i === 0 && travelerNames.length > 1 && (
                    <span className="text-muted-foreground font-normal"> (decision-maker)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function PackageCard({
  pkg,
  selected,
  onSelect,
}: {
  pkg: TripInsurancePackageDto
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-xl border-2 p-4 transition-all duration-200',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card hover:border-primary/40 hover:bg-primary/5',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Selection indicator */}
        <div
          className={cn(
            'mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
            selected ? 'border-primary bg-primary' : 'border-muted-foreground',
          )}
        >
          {selected && <div className="h-2 w-2 rounded-full bg-white" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-semibold text-foreground">{pkg.packageName}</p>
              <p className="text-sm text-muted-foreground">{pkg.providerName}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-foreground text-lg">
                {formatCents(pkg.premiumCents, pkg.currency)}
              </p>
              <p className="text-xs text-muted-foreground">per person</p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {formatPolicyType(pkg.policyType)}
            </span>
            {pkg.coverageAmountCents && (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                Up to {formatCents(pkg.coverageAmountCents, pkg.currency)} coverage
              </span>
            )}
          </div>

          {pkg.termsUrl && (
            <a
              href={pkg.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-2 inline-block text-xs text-primary hover:underline"
            >
              View policy terms →
            </a>
          )}
        </div>
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────

export function InsuranceWaiverForm({
  token,
  tripName,
  tripStartDate,
  tripEndDate,
  agencyName,
  travelerIds,
  travelerNames,
  packages,
}: WaiverFormProps) {
  const [path, setPath] = useState<FormPath>('choose')
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  const [declineAcknowledged, setDeclineAcknowledged] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handlePurchaseSubmit = async () => {
    if (!selectedPackageId) return
    setIsSubmitting(true)
    setError(null)

    try {
      const decisions = travelerIds.map((travelerId) => ({
        travelerId,
        action: 'purchase' as const,
        packageId: selectedPackageId,
      }))

      const res = await fetch(`${API_URL}/forms/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { message?: string }).message || 'Submission failed')
      }

      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeclineSubmit = async () => {
    if (!declineAcknowledged) return
    setIsSubmitting(true)
    setError(null)

    try {
      const decisions = travelerIds.map((travelerId) => ({
        travelerId,
        action: 'decline' as const,
        reason: declineReason.trim() || undefined,
      }))

      const res = await fetch(`${API_URL}/forms/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { message?: string }).message || 'Submission failed')
      }

      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Confirmation screen ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-[600px]">
          <Card className="bg-card border-border shadow-lg">
            <CardContent className="p-8 text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-500/15 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-foreground mb-2">
                Decision Recorded
              </h2>
              <p className="text-muted-foreground mb-1">
                Your insurance decision has been recorded.
              </p>
              <p className="text-muted-foreground text-sm">
                Your travel advisor will be in touch if there is anything further required.
              </p>
              <p className="mt-6 text-xs text-muted-foreground">You may close this page.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4 pt-10 pb-16">
      <div className="w-full max-w-[600px]">
        <FormHeader
          agencyName={agencyName}
          tripName={tripName}
          tripStartDate={tripStartDate}
          tripEndDate={tripEndDate}
          travelerNames={travelerNames}
        />

        {/* ── Path: Choose ── */}
        {path === 'choose' && (
          <Card className="bg-card border-border shadow-lg">
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Please review the insurance options below and let us know your decision.
              </p>
              <div className="flex flex-col gap-3">
                {packages.length > 0 && (
                  <Button
                    className="h-auto py-4 flex-col gap-1"
                    onClick={() => setPath('purchase')}
                  >
                    <span className="font-display text-base tracking-wide">Purchase Insurance</span>
                    <span className="text-xs font-normal opacity-80">
                      Choose a coverage plan for your trip
                    </span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-1"
                  onClick={() => setPath('decline')}
                >
                  <span className="font-display text-base tracking-wide">Decline Coverage</span>
                  <span className="text-xs font-normal opacity-70">
                    I will travel without insurance coverage
                  </span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Path: Purchase ── */}
        {path === 'purchase' && (
          <div className="space-y-4">
            <Card className="bg-card border-border shadow-lg">
              <CardContent className="p-6 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground mb-1">
                    Select a Coverage Plan
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Choose the insurance plan that best suits your needs.
                  </p>
                </div>

                <div className="space-y-3">
                  {packages.map((pkg) => (
                    <PackageCard
                      key={pkg.id}
                      pkg={pkg}
                      selected={selectedPackageId === pkg.id}
                      onSelect={() => setSelectedPackageId(pkg.id)}
                    />
                  ))}
                </div>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handlePurchaseSubmit}
                    disabled={!selectedPackageId || isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? 'Submitting…' : 'Confirm Selection'}
                  </Button>
                  <Button variant="ghost" onClick={() => setPath('choose')}>
                    Back
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Path: Decline ── */}
        {path === 'decline' && (
          <div className="space-y-4">
            <Card className="bg-destructive/10 border-destructive/30 shadow-lg">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-display text-lg font-bold text-foreground mb-1">
                      Decline Insurance Coverage
                    </h2>
                    <p className="text-sm text-foreground leading-relaxed">
                      By declining insurance coverage, you acknowledge that you are assuming all
                      financial risk for trip cancellation, medical emergencies, and other
                      travel-related losses. This decision applies to{' '}
                      {travelerNames.length === 1 ? (
                        <strong>{travelerNames[0]}</strong>
                      ) : (
                        <>
                          all travelers:{' '}
                          <strong>{travelerNames.join(', ')}</strong>
                        </>
                      )}
                      .
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="acknowledge"
                      checked={declineAcknowledged}
                      onCheckedChange={(checked) => setDeclineAcknowledged(checked === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="acknowledge" className="text-sm leading-relaxed cursor-pointer">
                      I have read and understand the above statement, and I am choosing to travel
                      without insurance coverage.
                    </Label>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reason" className="text-sm text-muted-foreground">
                      Reason for declining (optional)
                    </Label>
                    <Textarea
                      id="reason"
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      placeholder="e.g. I have coverage through my credit card, employer, or another policy"
                      className="resize-none"
                      rows={3}
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="destructive"
                    onClick={handleDeclineSubmit}
                    disabled={!declineAcknowledged || isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? 'Submitting…' : 'Decline Coverage'}
                  </Button>
                  <Button variant="ghost" onClick={() => setPath('choose')}>
                    Back
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
