import type { Metadata } from 'next'
import type { TripInsurancePackageDto } from '@tailfire/shared-types'
import { InsuranceWaiverForm } from './_components/insurance-waiver-form'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3101/api/v1'

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface PackageSnapshot {
  id: string
  tripId: string
  providerName: string
  packageName: string
  policyType: string
  coverageAmountCents: number | null
  premiumCents: number
  deductibleCents: number | null
  currency: string
  coverageStartDate: string | null
  coverageEndDate: string | null
  termsUrl: string | null
  isFromCatalog: boolean
  displayOrder: number
  activityId: string | null
  isActive: boolean
}

interface FormTemplate {
  formJson: Record<string, unknown> | null
  emailHtml: string | null
  name: string
  variables: unknown
}

interface FormContext {
  formType: string
  tripId: string | null
  travelerIds: string[] | null
  agencyId: string
  contextData: {
    recipientName?: string
    tripName?: string
    tripStartDate?: string | null
    tripEndDate?: string | null
    dependentNames?: string[]
    packages?: PackageSnapshot[]
    [key: string]: unknown
  } | null
  template: FormTemplate | null
}

type FormError = 'not_found' | 'expired' | 'completed' | 'unknown'

interface ResolvedForm {
  form: FormContext
  agencyName: string
}

// ──────────────────────────────────────────────────────────────────────────────
// Data fetching
// ──────────────────────────────────────────────────────────────────────────────

async function resolveForm(
  token: string,
): Promise<{ data: ResolvedForm } | { error: FormError }> {
  // 1. Resolve the token
  let formData: FormContext
  try {
    const res = await fetch(`${API_URL}/forms/${token}`, { cache: 'no-store' })

    if (res.status === 404) return { error: 'not_found' }

    if (res.status === 400) {
      const body = await res.json().catch(() => ({ message: '' }))
      const msg: string = (body as { message?: string }).message ?? ''
      if (msg.toLowerCase().includes('expired')) return { error: 'expired' }
      if (msg.toLowerCase().includes('already been submitted')) return { error: 'completed' }
      return { error: 'unknown' }
    }

    if (!res.ok) return { error: 'unknown' }

    formData = (await res.json()) as FormContext
  } catch {
    return { error: 'unknown' }
  }

  // 2. Resolve agency name
  const agencyName = 'Phoenix Voyages'

  return {
    data: {
      form: formData,
      agencyName,
    },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Metadata
// ──────────────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const result = await resolveForm(token)

  if ('error' in result) {
    return { title: 'Form | Phoenix Voyages' }
  }

  const tripName = result.data.form.contextData?.tripName ?? 'Your Trip'
  return {
    title: `Insurance Decision — ${tripName} | Phoenix Voyages`,
    description: `Insurance coverage decision form for ${tripName}`,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Error views
// ──────────────────────────────────────────────────────────────────────────────

function ErrorPage({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <h1 className="font-display text-2xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-muted-foreground text-sm">{message}</p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────────

export default async function FormPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await resolveForm(token)

  if ('error' in result) {
    switch (result.error) {
      case 'not_found':
        return (
          <ErrorPage
            title="Invalid Link"
            message="This form link is invalid. Please check your email and try the link again, or contact your travel agent."
          />
        )
      case 'expired':
        return (
          <ErrorPage
            title="Link Expired"
            message="This form has expired. Please contact your travel agent to receive a new form link."
          />
        )
      case 'completed':
        return (
          <ErrorPage
            title="Already Submitted"
            message="This form has already been submitted. If you need to make a change, please contact your travel agent."
          />
        )
      default:
        return (
          <ErrorPage
            title="Something Went Wrong"
            message="We were unable to load this form. Please try again or contact your travel agent."
          />
        )
    }
  }

  const { form, agencyName } = result.data

  // Insurance waiver form
  if (form.formType === 'insurance_waiver') {
    const ctx = form.contextData ?? {}
    const tripName = ctx.tripName ?? 'Your Trip'
    const tripStartDate = ctx.tripStartDate ?? null
    const tripEndDate = ctx.tripEndDate ?? null
    const recipientName = ctx.recipientName ?? ''
    const dependentNames: string[] = ctx.dependentNames ?? []
    const packages = (ctx.packages ?? []) as TripInsurancePackageDto[]

    // Build the traveler name list: primary first, then dependents
    const travelerNames = [
      ...(recipientName ? [recipientName] : []),
      ...dependentNames,
    ]

    return (
      <InsuranceWaiverForm
        token={token}
        tripName={tripName}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        agencyName={agencyName}
        travelerIds={form.travelerIds ?? []}
        travelerNames={travelerNames}
        packages={packages}
        formTemplate={form.template}
      />
    )
  }

  // Fallback for unknown form types
  return (
    <ErrorPage
      title="Unknown Form Type"
      message="This form type is not supported. Please contact your travel agent."
    />
  )
}
