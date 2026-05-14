'use client'

import { useState } from 'react'
import { useMyTaxProfile, useAcceptAuthorization, useMyAuthorization } from '@/hooks/use-ic-payouts'
import { SignaturePad } from '@/components/signature-pad'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

// ─── Agreement text ───────────────────────────────────────────────────────────
//
// IMPORTANT: This text MUST match rcti-template.ts on the API exactly.
// The server hashes this text for audit purposes. If the server bumps
// RCTI_AGREEMENT_VERSION, update this constant in lockstep.
//
// Agency name is hardcoded as "Phoenix Voyages" here (matching the server's
// agency lookup result). If the agency name changes, update both places.

const RCTI_AGREEMENT_VERSION = 'v1-2026-05'
const AGENCY_LEGAL_NAME = 'Phoenix Voyages'

function buildAgreementText(icLegalName: string): string {
  return `RECIPIENT-CREATED TAX INVOICE AGREEMENT (Phoenix Voyages — IC Commission)

Effective: ${new Date().toISOString().split('T')[0]}
Version: ${RCTI_AGREEMENT_VERSION}

This agreement is between ${AGENCY_LEGAL_NAME} ("Recipient") and
${icLegalName} ("Supplier"), under the Excise Tax Act, R.S.C., 1985, c. E-15.

1. The Recipient is authorized to issue tax invoices on the Supplier's behalf for
   commissions earned by the Supplier on travel bookings recorded in the
   Recipient's Tailfire system.

2. The Supplier confirms it is registered for GST/HST under the registration number
   provided in its IC Tax Profile (where applicable). If not registered, no
   GST/HST will be charged on the Supplier's invoices.

3. The Supplier agrees not to issue any other tax invoice in respect of the
   commission supplies covered by this agreement.

4. This agreement remains in force until either party gives 30 days' written
   notice, the Supplier's GST/HST registration changes, or the Recipient updates
   the agreement version.

5. The Supplier confirms the SIN or Business Number provided is correct and
   authorizes the Recipient to use it for T4A reporting under section 200 of the
   Income Tax Regulations.

By accepting electronically below, the Supplier confirms agreement to the above
terms.`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void
}

export function AuthorizationStep({ onComplete }: Props) {
  const { data: profile, isLoading: profileLoading } = useMyTaxProfile()
  const { data: existingAuth, isLoading: authLoading } = useMyAuthorization()
  const accept = useAcceptAuthorization()

  const [sig, setSig] = useState<Blob | null>(null)
  const [attestPayer, setAttestPayer] = useState(false)
  const [attestRecipient, setAttestRecipient] = useState(false)

  // Loading state
  if (profileLoading || authLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>
  }

  // Already have an active authorization — skip step
  if (existingAuth?.status === 'active') {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          You already have an active RCTI authorization (version{' '}
          <span className="font-medium">{existingAuth.agreementVersion}</span>).
        </p>
        <Button onClick={onComplete}>Continue</Button>
      </div>
    )
  }

  // Tax profile must exist before accepting authorization
  if (!profile) {
    return (
      <div className="text-sm text-muted-foreground">
        Please complete step 1 (tax profile) first.
      </div>
    )
  }

  const agreementText = buildAgreementText(profile.legalName)

  const canSubmit = sig !== null && attestPayer && attestRecipient && !accept.isPending

  const handleSubmit = async () => {
    if (!sig) return
    const fd = new FormData()
    fd.append('signature', sig, 'signature.png')
    fd.append('payerTaxRegistrationAttested', 'true')
    fd.append('recipientTaxRegistrationAttested', 'true')
    await accept.mutateAsync(fd)
    onComplete()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">RCTI Agreement</h2>
        <p className="text-sm text-muted-foreground">
          Read the agreement below, check both attestation boxes, and sign to continue.
        </p>
      </div>

      {/* Agreement text */}
      <pre className="whitespace-pre-wrap rounded border p-4 bg-muted/40 text-sm max-h-[28rem] overflow-y-auto font-mono leading-relaxed">
        {agreementText}
      </pre>

      {/* Attestation checkboxes */}
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Checkbox
            id="attest-payer"
            checked={attestPayer}
            onCheckedChange={(v) => setAttestPayer(!!v)}
          />
          <Label htmlFor="attest-payer" className="font-normal text-sm leading-snug cursor-pointer">
            I confirm Phoenix Voyages is a registered business and authorized to issue invoices on
            my behalf.
          </Label>
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="attest-recipient"
            checked={attestRecipient}
            onCheckedChange={(v) => setAttestRecipient(!!v)}
          />
          <Label
            htmlFor="attest-recipient"
            className="font-normal text-sm leading-snug cursor-pointer"
          >
            I confirm my GST/HST registration status (if any) is accurate as recorded in my tax
            profile.
          </Label>
        </div>
      </div>

      {/* Signature */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Electronic signature</Label>
        <p className="text-xs text-muted-foreground">Sign in the box below using your mouse or finger.</p>
        <SignaturePad onChange={setSig} />
      </div>

      {/* Error */}
      {accept.isError && (
        <p className="text-sm text-destructive">
          Something went wrong. Please try again.
        </p>
      )}

      <Button disabled={!canSubmit} onClick={handleSubmit} className="w-full sm:w-auto">
        {accept.isPending ? 'Submitting…' : 'Accept and continue'}
      </Button>
    </div>
  )
}
