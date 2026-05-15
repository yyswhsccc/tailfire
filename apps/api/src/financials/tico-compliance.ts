/**
 * TICO §38 compliance validator (B4)
 *
 * Pure validation function. No DB / Nest dependencies — extracted from
 * TripOrderService so the test fixture can exercise it without dragging
 * the entire service tree (and the API typecheck baseline) into ts-jest.
 *
 * Source: Ontario Regulation 26/05, Section 38 + TICO Disclosure & Invoicing
 * Guidelines (https://tico.ca/travel-professionals/resources-guidelines/disclosure-invoicing.html).
 *
 * The canonical mapping of each §38 clause to its check is documented in
 * docs/COMPLIANCE_TICO.md.
 */

import type {
  BusinessConfiguration,
  TICOTripOrder,
  TripOrderBookingDetail,
  TripOrderPaymentSummary,
} from './pdf/types'

export interface TICOComplianceInput {
  orderData: unknown
  paymentSummary: unknown
  bookingDetails: unknown
  businessConfig: unknown
}

export function validateTICOCompliance(tripOrder: TICOComplianceInput): string[] {
  const violations: string[] = []
  const orderData = tripOrder.orderData as TICOTripOrder | null
  const businessConfig = tripOrder.businessConfig as BusinessConfiguration | null
  const paymentSummary = tripOrder.paymentSummary as TripOrderPaymentSummary | null
  const bookingDetails = tripOrder.bookingDetails as TripOrderBookingDetail[] | null

  // §38(1) — Customer name and address
  const customer = orderData?.order_header?.customer_info
  if (!customer?.name || customer.name === 'Customer') {
    violations.push('Customer name is required (Reg. 26/05 §38(1))')
  }

  // §38(2) — Date of booking
  if (!orderData?.order_header?.order_date) {
    violations.push('Order date is required (Reg. 26/05 §38(2))')
  }

  // §38(3) — Payment amount and balance owing
  if (paymentSummary == null) {
    violations.push('Payment summary is required (Reg. 26/05 §38(3))')
  }

  // §38(5) — Total price of travel services
  if (!orderData?.cost_breakdown?.final_total && orderData?.cost_breakdown?.final_total !== 0) {
    violations.push('Total price is required (Reg. 26/05 §38(5))')
  }

  // §38(6) — Agency info is built into the template from agency_settings,
  // so we only check that businessConfig was populated at all
  if (!businessConfig) {
    violations.push('Agency configuration is missing — cannot generate compliant invoice')
  }

  // §38(7) — Service description with destination and departure date
  if (!orderData?.service_details?.description) {
    violations.push('Service description is required (Reg. 26/05 §38(7))')
  }
  if (!orderData?.service_details?.travel_dates?.departure) {
    violations.push('Departure date is required (Reg. 26/05 §38(7))')
  }

  // §38(7) — At least one booking/service must be listed
  if (!bookingDetails || bookingDetails.length === 0) {
    violations.push('At least one booking must be included (Reg. 26/05 §38(7))')
  }

  // §38(12) — Travel counsellor name
  if (!orderData?.order_header?.agent_info?.name) {
    violations.push('Travel counsellor name is required (Reg. 26/05 §38(12))')
  }

  // §38 — Compliance statement must be present
  if (!orderData?.compliance_statement) {
    violations.push('TICO compliance statement is required')
  }

  // ─── B4: Section §38 expansion (2026-05-15) ─────────────────────────────
  // The clauses below cover the disclosure language TICO expects on the
  // invoice itself. Each one is satisfied when the agency has populated the
  // corresponding field in BusinessConfiguration (via agency_settings).

  if (businessConfig) {
    // §38 — TICO registration number must be present and look valid.
    // TICO registrations are typically 7-digit numeric. Accept 4-9 digit
    // numeric to tolerate older / future formatting without being too loose.
    const ticoReg = (businessConfig.tico_registration ?? '').trim()
    if (!ticoReg) {
      violations.push('TICO registration number is required on every invoice (Reg. 26/05 §38)')
    } else if (!/^\d{4,9}$/.test(ticoReg)) {
      violations.push(
        `TICO registration number "${ticoReg}" is not in the expected 4-9 digit numeric format — verify against current TICO record`,
      )
    }

    // §38 — Insurance disclosure (offered/declined). Customer must see it.
    const hasInsuranceDisclosure =
      Boolean(businessConfig.document_insurance_requirements?.trim()) ||
      (businessConfig.custom_compliance_disclosures ?? []).some((s) =>
        /insur/i.test(s),
      )
    if (!hasInsuranceDisclosure) {
      violations.push(
        'Insurance disclosure (offered/declined) is required (Reg. 26/05 §38). ' +
          'Set business_settings.document_insurance_requirements OR add a custom compliance disclosure mentioning insurance.',
      )
    }

    // §38 — Travel-document advice (passport, visa).
    const passportPresent = Boolean(businessConfig.document_passport_requirements?.trim())
    const visaPresent = Boolean(businessConfig.document_visa_requirements?.trim())
    const customDocs = businessConfig.custom_compliance_disclosures ?? []
    const customMentionsBoth =
      customDocs.some((s) => /passport/i.test(s)) &&
      customDocs.some((s) => /visa/i.test(s))
    if (!((passportPresent && visaPresent) || customMentionsBoth)) {
      violations.push(
        'Travel-document advice (passport AND visa) is required (Reg. 26/05 §38). ' +
          'Populate document_passport_requirements + document_visa_requirements OR add custom compliance disclosures mentioning both.',
      )
    }

    // §38 — Price-increase terms / cancellation terms / disclaimer.
    const usesDefaultDisclosures = businessConfig.include_default_tico_disclosures !== false
    const hasOrderTerms = Boolean(businessConfig.trip_order_terms?.trim())
    const hasPriceIncreaseDisclosure =
      usesDefaultDisclosures ||
      hasOrderTerms ||
      customDocs.some((s) => /price.*(increase|change)|fare.*(increase|change)|surcharge/i.test(s))
    if (!hasPriceIncreaseDisclosure) {
      violations.push(
        'Price-increase / surcharge terms required (Reg. 26/05 §38). ' +
          'Either keep include_default_tico_disclosures=true, populate trip_order_terms, or add a custom disclosure covering price-change terms.',
      )
    }
  }

  // §38 — Cancellation policy must be disclosed for every booked service.
  if (bookingDetails && bookingDetails.length > 0) {
    const missingCancellation = bookingDetails.filter(
      (b) => !b.cancellation_policy?.trim(),
    )
    if (missingCancellation.length > 0) {
      violations.push(
        `Cancellation policy missing on ${missingCancellation.length} booking(s) — required for each service (Reg. 26/05 §38)`,
      )
    }

    // Non-refundable amount must be disclosed when the deposit is marked
    // non-refundable. Ensure cancellation_policy text doesn't leave the
    // non-refundable status implicit when the flag is set.
    const nonRefundableMissingDisclosure = bookingDetails.filter((b) => {
      if (!b.non_refundable) return false
      const policy = (b.cancellation_policy ?? '').toLowerCase()
      return !policy.includes('non-refundable') && !policy.includes('non refundable')
    })
    if (nonRefundableMissingDisclosure.length > 0) {
      violations.push(
        `${nonRefundableMissingDisclosure.length} booking(s) marked non-refundable but cancellation_policy text does not disclose this — required (Reg. 26/05 §38)`,
      )
    }
  }

  return violations
}
