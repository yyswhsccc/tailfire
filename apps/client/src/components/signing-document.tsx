'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Button,
  Checkbox,
  Input,
  Label,
  Separator,
  cn,
} from '@tailfire/ui-public'

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface SigningDocumentSection {
  title: string
  content: React.ReactNode
}

export interface SigningDocumentAcknowledgment {
  id: string
  text: string
  required?: boolean
}

export interface SigningDocumentSubmitPayload {
  fullName: string
  date: string
  acknowledgments: Record<string, boolean>
}

export interface SigningDocumentProps {
  // Header
  agencyName: string
  documentTitle: string
  referenceNumber?: string
  date?: string

  // Document context block
  metadata?: Array<{ label: string; value: string }>

  // Content sections
  sections: SigningDocumentSection[]

  // Acknowledgment checkboxes shown before signature
  acknowledgments?: SigningDocumentAcknowledgment[]

  // Signature block
  requireSignature?: boolean
  signatureLabel?: string
  signatureLegalText?: string

  // Footer
  footerText?: string
  ticoRegistration?: string

  // Actions
  submitLabel?: string
  onSubmit: (payload: SigningDocumentSubmitPayload) => Promise<void>
  isSubmitting?: boolean

  // Optional: render extra content before the submit button (e.g. error messages)
  submitError?: string | null
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function todayFormatted() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function SigningDocument({
  agencyName,
  documentTitle,
  referenceNumber,
  date,
  metadata,
  sections,
  acknowledgments,
  requireSignature = true,
  signatureLabel = 'Full Legal Name',
  signatureLegalText = 'By typing my full name above, I acknowledge that this constitutes my legal electronic signature pursuant to applicable electronic signature laws.',
  footerText,
  ticoRegistration,
  submitLabel = 'Submit Signed Document',
  onSubmit,
  isSubmitting = false,
  submitError,
}: SigningDocumentProps) {
  const today = date ?? todayFormatted()

  // Acknowledgment state — keyed by acknowledgment id
  const [ackState, setAckState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const ack of acknowledgments ?? []) {
      initial[ack.id] = false
    }
    return initial
  })

  const [signatureName, setSignatureName] = useState('')

  const allRequiredAcksChecked = (acknowledgments ?? [])
    .filter((a) => a.required !== false)
    .every((a) => ackState[a.id])

  const isSignatureValid = requireSignature ? signatureName.trim().length >= 2 : true

  const canSubmit = allRequiredAcksChecked && isSignatureValid

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return
    await onSubmit({
      fullName: signatureName.trim(),
      date: new Date().toISOString(),
      acknowledgments: ackState,
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4 pt-8 pb-16">
      <div className="w-full max-w-[700px] bg-white shadow-sm border border-gray-200 rounded-lg">

        {/* ── Document Header ── */}
        <div className="p-8 md:p-12 pb-0">
          <div className="text-center mb-8">
            <p className="text-sm font-medium tracking-widest uppercase text-phoenix-gold mb-4">
              {agencyName}
            </p>
            <h1
              className="text-2xl md:text-[1.65rem] font-bold text-gray-900 tracking-tight"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              {documentTitle}
            </h1>
          </div>

          {/* Reference / Date / Metadata block */}
          {(referenceNumber ?? metadata?.length) ? (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm space-y-1.5">
              {referenceNumber && (
                <div className="flex justify-between flex-wrap gap-1">
                  <span className="text-gray-500">Reference:</span>
                  <span className="font-mono font-medium text-gray-900">{referenceNumber}</span>
                </div>
              )}
              <div className="flex justify-between flex-wrap gap-1">
                <span className="text-gray-500">Date:</span>
                <span className="text-gray-900 font-medium">{today}</span>
              </div>
              {(metadata ?? []).map(({ label, value }) => (
                <div key={label} className="flex justify-between flex-wrap gap-1">
                  <span className="text-gray-500">{label}:</span>
                  <span className="text-gray-900 font-medium text-right">{value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* ── Sections ── */}
        {sections.map((section, idx) => (
          <div key={idx}>
            <div className="px-8 md:px-12">
              <Separator />
            </div>
            <div className="p-8 md:p-12 pb-0">
              <h2
                className="text-base font-bold text-gray-900 mb-4 tracking-wide"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                {section.title}
              </h2>
              <div
                className="text-sm text-gray-700 leading-relaxed"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                {section.content}
              </div>
            </div>
          </div>
        ))}

        {/* ── Acknowledgment Checkboxes ── */}
        {acknowledgments && acknowledgments.length > 0 && (
          <>
            <div className="px-8 md:px-12 pt-6">
              <Separator />
            </div>
            <div className="p-8 md:p-12 pb-0 space-y-4">
              {acknowledgments.map((ack) => (
                <div key={ack.id} className="flex items-start gap-3">
                  <Checkbox
                    id={`ack-${ack.id}`}
                    checked={ackState[ack.id] ?? false}
                    onCheckedChange={(checked) =>
                      setAckState((prev) => ({ ...prev, [ack.id]: checked === true }))
                    }
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor={`ack-${ack.id}`}
                    className="text-sm leading-relaxed cursor-pointer text-gray-700"
                    style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                  >
                    {ack.text}
                  </Label>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Digital Signature Block ── */}
        {requireSignature && (
          <>
            <div className="px-8 md:px-12 pt-6">
              <Separator />
            </div>
            <div className="p-8 md:p-12 pb-0">
              <h2
                className="text-base font-bold text-gray-900 mb-4 tracking-wide"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                DIGITAL SIGNATURE
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="signingDocumentName"
                    className="text-sm font-medium text-gray-700"
                  >
                    {signatureLabel}
                  </Label>
                  <Input
                    id="signingDocumentName"
                    type="text"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    placeholder="Type your full legal name"
                    className="bg-white text-lg"
                    style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                    autoComplete="off"
                  />
                </div>

                <div className="flex justify-between text-sm text-gray-500">
                  <span>Date:</span>
                  <span className="text-gray-900 font-medium">{today}</span>
                </div>

                <p
                  className="text-xs text-gray-400 leading-relaxed"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  {signatureLegalText}
                </p>
              </div>
            </div>
          </>
        )}

        {/* ── Submit Section ── */}
        <div className="px-8 md:px-12 pt-6">
          <Separator />
        </div>

        <div className="p-8 md:p-12">
          {submitError && (
            <p className="text-sm text-red-600 flex items-center gap-1.5 mb-4">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {submitError}
            </p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={cn(
              'w-full h-12 text-base font-medium',
              'bg-phoenix-gold hover:bg-phoenix-gold/90 text-white',
            )}
          >
            {isSubmitting ? 'Submitting...' : submitLabel}
          </Button>
        </div>

        {/* ── Document Footer ── */}
        <div className="border-t border-gray-100 px-8 md:px-12 py-4">
          <p className="text-xs text-gray-400 text-center">
            {footerText ?? `This document was generated by Tailfire on behalf of ${agencyName}.`}
          </p>
          {ticoRegistration && (
            <p className="text-xs text-gray-400 text-center mt-1">
              TICO Registration: {ticoRegistration}
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
