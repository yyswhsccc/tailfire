/**
 * RCTI Agreement Template
 *
 * IMPORTANT: This is placeholder text. Tax counsel MUST review and replace
 * before production launch. See spec section 10 (Open risks, risk #3).
 */

export const RCTI_AGREEMENT_VERSION = 'v1-2026-05'

export const rctiAgreementText = (params: {
  agencyLegalName: string
  icLegalName: string
}): string => `RECIPIENT-CREATED TAX INVOICE AGREEMENT (Phoenix Voyages — IC Commission)

Effective: ${new Date().toISOString().split('T')[0]}
Version: ${RCTI_AGREEMENT_VERSION}

This agreement is between ${params.agencyLegalName} ("Recipient") and
${params.icLegalName} ("Supplier"), under the Excise Tax Act, R.S.C., 1985, c. E-15.

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
terms.
`
