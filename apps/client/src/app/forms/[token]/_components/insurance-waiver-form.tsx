'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
  Separator,
  Textarea,
  cn,
} from '@tailfire/ui-public'
import type { TripInsurancePackageDto } from '@tailfire/shared-types'
import { SigningDocument } from '@/components/signing-document'
import { SigningConfirmation } from '@/components/signing-confirmation'
import type { SigningDocumentSubmitPayload } from '@/components/signing-document'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface FormTemplateData {
  formJson: {
    fields?: Array<{
      id: string
      type: string
      label: string
      required?: boolean
      options?: string[]
      showWhen?: { field: string; value: string }
    }>
    settings?: {
      submitButtonText?: string
    }
  } | null
  emailHtml: string | null
  name: string
  variables: unknown
}

interface WaiverFormProps {
  token: string
  tripName: string
  tripStartDate: string | null
  tripEndDate: string | null
  agencyName: string
  travelerIds: string[]
  travelerNames: string[] // primary traveler + dependent names
  packages: TripInsurancePackageDto[]
  formTemplate?: FormTemplateData | null
}

interface SubmissionResult {
  success: boolean
  referenceNumber: string
  signedAt: string
  pdfBase64: string
  travelerEmail: string | null
}

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

function todayFormatted() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

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
        'w-full text-left rounded-lg border-2 p-4 transition-all duration-200',
        selected
          ? 'border-[#c59746] bg-[#c59746]/5'
          : 'border-gray-200 bg-white hover:border-[#c59746]/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
            selected ? 'border-[#c59746] bg-[#c59746]' : 'border-gray-400',
          )}
        >
          {selected && <div className="h-2 w-2 rounded-full bg-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="font-semibold text-gray-900">{pkg.packageName}</p>
              <p className="text-sm text-gray-500">{pkg.providerName}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-gray-900 text-lg">
                {formatCents(pkg.premiumCents, pkg.currency)}
              </p>
              <p className="text-xs text-gray-500">per person</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-[#c59746]/10 px-2.5 py-0.5 text-xs font-medium text-[#c59746]">
              {formatPolicyType(pkg.policyType)}
            </span>
            {pkg.coverageAmountCents && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
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
              className="mt-2 inline-block text-xs text-[#c59746] hover:underline"
            >
              View policy terms
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
  // Form state
  const [decision, setDecision] = useState<'purchase' | 'decline' | null>(null)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null)

  const start = formatDate(tripStartDate)
  const end = formatDate(tripEndDate)
  const today = todayFormatted()

  const canSubmitPurchase = decision === 'purchase' && selectedPackageId !== null

  // ── Shared submission logic ──
  const submitForm = async (payload?: SigningDocumentSubmitPayload) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const decisions = travelerIds.map((travelerId) => ({
        travelerId,
        action: decision as 'purchase' | 'decline',
        ...(decision === 'purchase' ? { packageId: selectedPackageId } : {}),
        ...(decision === 'decline' && declineReason.trim()
          ? { reason: declineReason.trim() }
          : {}),
      }))

      const body: Record<string, unknown> = { decisions }

      // Include signature data for decline path
      if (decision === 'decline' && payload) {
        body.signature = {
          fullName: payload.fullName,
          date: payload.date,
        }
      }

      const res = await fetch(`${API_URL}/forms/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          (data as { message?: string }).message || 'Submission failed',
        )
      }

      const result = await res.json()
      setSubmissionResult(result as SubmissionResult)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      )
      // Re-throw so SigningDocument can stay in its submitting=false state
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Confirmation screen ──
  if (submissionResult) {
    return (
      <SigningConfirmation
        agencyName={agencyName}
        documentTitle={
          submissionResult.pdfBase64
            ? 'Insurance Waiver Signed Successfully'
            : 'Insurance Decision Recorded'
        }
        referenceNumber={submissionResult.referenceNumber}
        signedAt={submissionResult.signedAt}
        recipientEmail={submissionResult.travelerEmail}
        pdfBase64={submissionResult.pdfBase64}
        pdfFilename={`insurance-waiver-${submissionResult.referenceNumber}`}
      />
    )
  }

  // ── Decline path: render as SigningDocument ──
  if (decision === 'decline') {
    return (
      <SigningDocument
        agencyName={agencyName}
        documentTitle="TRAVEL INSURANCE WAIVER & ACKNOWLEDGMENT"
        metadata={[
          { label: 'Trip', value: tripName },
          ...(start || end
            ? [
                {
                  label: 'Travel Dates',
                  value: [start, end].filter(Boolean).join(' \u2013 '),
                },
              ]
            : []),
          {
            label: travelerNames.length > 1 ? 'Travelers' : 'Traveler',
            value: travelerNames.join(', '),
          },
        ]}
        sections={[
          {
            title: 'SECTION 1: INSURANCE COVERAGE DECISION',
            content: (
              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg border-2 p-4',
                  'border-red-300 bg-red-50/50',
                )}
              >
                <div className="h-5 w-5 shrink-0 rounded-full border-2 border-red-400 bg-red-400 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-white" />
                </div>
                <span className="text-gray-900 font-medium">
                  I DECLINE travel insurance coverage
                </span>
              </div>
            ),
          },
          {
            title: 'SECTION 2: ACKNOWLEDGMENT & WAIVER',
            content: (
              <div className="space-y-4">
                <div className="space-y-3">
                  <p>I, the undersigned, acknowledge that:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>
                      Travel insurance has been offered to me by{' '}
                      <strong>{agencyName}</strong>.
                    </li>
                    <li>
                      I understand the risks of travelling without insurance
                      including but not limited to medical emergencies, trip
                      cancellation, lost baggage, and travel delays.
                    </li>
                    <li>
                      I voluntarily decline insurance coverage and assume all
                      financial responsibility for any losses or expenses incurred.
                    </li>
                    <li>
                      I release {agencyName} and its agents from any liability
                      arising from my decision to decline coverage.
                    </li>
                  </ul>
                </div>

                {/* Optional reason */}
                <div className="mt-2 space-y-1.5">
                  <Label htmlFor="reason" className="text-sm text-gray-500">
                    Reason for declining (optional)
                  </Label>
                  <Textarea
                    id="reason"
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="e.g. I have coverage through my credit card, employer, or another policy"
                    className="resize-none bg-white"
                    rows={2}
                  />
                </div>
              </div>
            ),
          },
        ]}
        acknowledgments={[
          {
            id: 'decline-acknowledged',
            text: 'I have read and understood the above acknowledgment and waiver.',
            required: true,
          },
        ]}
        submitLabel="Submit Signed Waiver"
        onSubmit={submitForm}
        isSubmitting={isSubmitting}
        submitError={error}
      />
    )
  }

  // ── Purchase path + initial decision screen ──
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-8 pb-16">
      <div className="w-full max-w-[700px] bg-white shadow-sm border border-gray-200 rounded-lg">
        {/* ── Document Header ── */}
        <div className="p-8 md:p-12 pb-0">
          <div className="text-center mb-8">
            <p className="text-sm font-medium tracking-widest uppercase text-[#c59746] mb-4">
              {agencyName}
            </p>
            <h1
              className="text-2xl md:text-[1.65rem] font-bold text-gray-900 tracking-tight"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              TRAVEL INSURANCE WAIVER & ACKNOWLEDGMENT
            </h1>
          </div>

          {/* Trip Details Block */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm space-y-1.5">
            <div className="flex justify-between flex-wrap gap-1">
              <span className="text-gray-500">Date:</span>
              <span className="text-gray-900 font-medium">{today}</span>
            </div>
            <div className="flex justify-between flex-wrap gap-1">
              <span className="text-gray-500">Trip:</span>
              <span className="text-gray-900 font-medium">{tripName}</span>
            </div>
            {(start || end) && (
              <div className="flex justify-between flex-wrap gap-1">
                <span className="text-gray-500">Travel Dates:</span>
                <span className="text-gray-900 font-medium">
                  {start}
                  {start && end && ' \u2013 '}
                  {end}
                </span>
              </div>
            )}
            <div className="flex justify-between flex-wrap gap-1">
              <span className="text-gray-500">
                Traveler{travelerNames.length > 1 ? 's' : ''}:
              </span>
              <span className="text-gray-900 font-medium text-right">
                {travelerNames.join(', ')}
              </span>
            </div>
          </div>
        </div>

        <div className="px-8 md:px-12">
          <Separator />
        </div>

        {/* ── Section 1: Insurance Coverage Decision ── */}
        <div className="p-8 md:p-12 pb-0">
          <h2
            className="text-base font-bold text-gray-900 mb-4 tracking-wide"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            SECTION 1: INSURANCE COVERAGE DECISION
          </h2>

          <RadioGroup
            value={decision ?? ''}
            onValueChange={(value) => {
              setDecision(value as 'purchase' | 'decline')
              setError(null)
            }}
            className="space-y-3"
          >
            {packages.length > 0 && (
              <div
                className={cn(
                  'flex items-center gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors',
                  decision === 'purchase'
                    ? 'border-[#c59746] bg-[#c59746]/5'
                    : 'border-gray-200 hover:border-gray-300',
                )}
                onClick={() => {
                  setDecision('purchase')
                  setError(null)
                }}
              >
                <RadioGroupItem value="purchase" id="purchase" />
                <Label
                  htmlFor="purchase"
                  className="cursor-pointer text-gray-900 font-medium"
                >
                  I wish to PURCHASE travel insurance
                </Label>
              </div>
            )}
            <div
              className={cn(
                'flex items-center gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors',
                (decision as string) === 'decline'
                  ? 'border-red-300 bg-red-50/50'
                  : 'border-gray-200 hover:border-gray-300',
              )}
              onClick={() => {
                setDecision('decline')
                setError(null)
              }}
            >
              <RadioGroupItem value="decline" id="decline" />
              <Label
                htmlFor="decline"
                className="cursor-pointer text-gray-900 font-medium"
              >
                I DECLINE travel insurance coverage
              </Label>
            </div>
          </RadioGroup>

          {/* Package selection (purchase path) */}
          {decision === 'purchase' && packages.length > 0 && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-gray-600 mb-3">
                Select a coverage plan:
              </p>
              {packages.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  selected={selectedPackageId === pkg.id}
                  onSelect={() => setSelectedPackageId(pkg.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Submit Section ── */}
        <div className="px-8 md:px-12 pt-6">
          <Separator />
        </div>

        <div className="p-8 md:p-12">
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5 mb-4">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {decision === 'purchase' && (
            <Button
              onClick={() => submitForm()}
              disabled={isSubmitting || !canSubmitPurchase}
              className={cn(
                'w-full h-12 text-base font-medium',
                'bg-[#c59746] hover:bg-[#b08636] text-white',
              )}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Insurance Selection'}
            </Button>
          )}

          {!decision && (
            <p className="text-center text-sm text-gray-400">
              Please select an option above to continue.
            </p>
          )}
        </div>

        {/* ── Document Footer ── */}
        <div className="border-t border-gray-100 px-8 md:px-12 py-4">
          <p className="text-xs text-gray-400 text-center">
            This document was generated by Tailfire on behalf of {agencyName}.
          </p>
        </div>
      </div>
    </div>
  )
}
