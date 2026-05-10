'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { TaxProfileStep } from './_components/tax-profile-step'
import { AuthorizationStep } from './_components/authorization-step'
import { cn } from '@/lib/utils'

// Steps 2 and 3 will be added by Tasks 14 and 15
const STEPS = [
  { num: 1, label: 'Tax profile' },
  { num: 2, label: 'Authorization' },
  { num: 3, label: 'First account' },
]

// ─── Inner component (reads searchParams) ────────────────────────────────────

function OnboardingContent() {
  const params = useSearchParams()
  const router = useRouter()
  const step = Math.max(1, Math.min(3, parseInt(params.get('step') ?? '1', 10)))

  const goToStep = (n: number) =>
    router.push(`/portal/payouts/onboarding?step=${n}`)

  return (
    <div className="container max-w-3xl py-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Set up commission payouts</h1>
        <p className="text-sm text-muted-foreground">
          Complete these three steps to start receiving commission payouts directly to your account.
        </p>
      </header>

      <ProgressIndicator current={step} steps={STEPS} />

      <div>
        {step === 1 && <TaxProfileStep onComplete={() => goToStep(2)} />}
        {step === 2 && <AuthorizationStep onComplete={() => goToStep(3)} />}
        {step === 3 && <PlaceholderStep label="First account (coming in Task 15)" />}
      </div>
    </div>
  )
}

// ─── Page export — Suspense required for useSearchParams ─────────────────────

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="container max-w-3xl py-8 text-sm text-muted-foreground">Loading…</div>}>
      <OnboardingContent />
    </Suspense>
  )
}

// ─── Progress indicator ───────────────────────────────────────────────────────

interface Step {
  num: number
  label: string
}

function ProgressIndicator({ current, steps }: { current: number; steps: Step[] }) {
  return (
    <nav aria-label="Onboarding progress">
      <ol className="flex items-center gap-0">
        {steps.map((step, i) => {
          const isActive = step.num === current
          const isDone = step.num < current

          return (
            <li key={step.label} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  aria-current={isActive ? 'step' : undefined}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors',
                    isActive && 'bg-primary text-primary-foreground border-primary',
                    isDone && 'bg-muted text-muted-foreground border-muted',
                    !isActive && !isDone && 'text-muted-foreground border-border',
                  )}
                >
                  {isDone ? (
                    // Checkmark for completed steps
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    step.num
                  )}
                </div>
                <span
                  className={cn(
                    'text-sm whitespace-nowrap',
                    isActive && 'font-medium text-foreground',
                    !isActive && 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="mx-3 h-px w-8 shrink-0 bg-border" aria-hidden="true" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ─── Placeholder for steps not yet implemented ────────────────────────────────

function PlaceholderStep({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {label}
    </div>
  )
}
