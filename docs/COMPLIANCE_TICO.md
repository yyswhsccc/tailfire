# TICO Compliance — Ontario Reg. 26/05 §38

How the codebase satisfies TICO's mandatory invoice requirements
(Ontario Travel Industry Act, Regulation 26/05, Section 38).

**Authoritative implementation:** `apps/api/src/financials/tico-compliance.ts`
(pure validator, called from `TripOrderService.finalizeTripOrder()`).

**Tests:** `apps/api/src/financials/__tests__/trip-order-tico-compliance.spec.ts`

**External references:**
- [TICO Disclosure & Invoicing Guidelines](https://tico.ca/travel-professionals/resources-guidelines/disclosure-invoicing.html)
- [TICO Guidelines PDF (Aug 2016)](https://www.tico.ca/files/Disclosure%20and%20Invoicing%20Guidelines-August2016-Final.pdf)
- [Reg. 26/05 — Ontario Travel Industry Act](https://www.ontario.ca/laws/regulation/050026)

---

## §38 clause → code mapping

| §38 Clause | Required disclosure | Where it's enforced | How an agency satisfies it |
|---|---|---|---|
| **§38(1)** | Customer name (and address where the trip is sold) | `tico-compliance.ts` — checks `orderData.order_header.customer_info.name` is present and not the placeholder "Customer" | Populate the contact's name on the trip's primary contact |
| **§38(2)** | Date of booking | `tico-compliance.ts` — checks `orderData.order_header.order_date` | Auto-populated from `trip_orders.created_at` |
| **§38(3)** | Payment amount and balance owing | `tico-compliance.ts` — requires `paymentSummary` to be non-null | Auto-populated from `payment_transactions` + `payment_schedule` |
| **§38(5)** | Total price of the travel services | `tico-compliance.ts` — checks `orderData.cost_breakdown.final_total` | Auto-populated from activity pricing aggregation |
| **§38(6)** | Travel agency name + address + TICO registration | `tico-compliance.ts` — requires `businessConfig` populated; the **TICO registration** check (below) is separate | Agency settings → company name + full address + TICO registration |
| **§38(7)** | Service description, destination, departure date, list of services | `tico-compliance.ts` — checks `service_details.description`, `service_details.travel_dates.departure`, and at least one `bookingDetails` entry | Activities + itinerary populate this automatically when finalized |
| **§38(12)** | Travel counsellor's name | `tico-compliance.ts` — checks `orderData.order_header.agent_info.name` | Auto-populated from the trip's owner / signed-in agent |
| **§38** (general — compliance statement) | Standard TICO compliance language on every invoice | `tico-compliance.ts` — checks `orderData.compliance_statement` is non-empty | Auto-rendered from agency settings + default TICO disclosures |

---

## §38 disclosure expansions added in B4 (2026-05-15)

These are the disclosures TICO expects in addition to the structural fields above. Each is satisfied when the agency has populated the corresponding setting in `business_settings` (read into `BusinessConfiguration` at render time).

| Required disclosure | Where it's enforced | How an agency satisfies it |
|---|---|---|
| **TICO registration number — present and well-formed** | `tico-compliance.ts` — non-empty + matches `^\d{4,9}$` | Agency settings → TICO registration. Surfaces drift if format changes |
| **Insurance offered/declined disclosure** | `tico-compliance.ts` — `document_insurance_requirements` populated OR a custom disclosure mentions "insur" | Agency settings → "Insurance requirements" text field |
| **Travel-document advice (passport + visa)** | `tico-compliance.ts` — both `document_passport_requirements` AND `document_visa_requirements` populated, OR custom disclosures mention both keywords | Agency settings → passport + visa text fields |
| **Price-increase / surcharge terms** | `tico-compliance.ts` — `include_default_tico_disclosures !== false` OR `trip_order_terms` populated OR custom disclosure mentions price/fare/surcharge change | Default TICO disclosures bundle (recommended) OR custom trip-order terms |
| **Cancellation policy on every booked service** | `tico-compliance.ts` — every `bookingDetails[].cancellation_policy` non-empty | Activity-level cancellation policy (falls back to supplier default in the renderer) |
| **Non-refundable status disclosed in plain text** | `tico-compliance.ts` — when `bookingDetails[].non_refundable=true`, the cancellation_policy text must contain "non-refundable" or "non refundable" | Set the activity flag AND make sure the cancellation text says so explicitly |

---

## What's NOT enforced at the gate (still owed by the agency at sale time)

These TICO-mandated disclosures aren't part of the invoice gate because they happen earlier in the sale (e.g., quote stage) or in conversation:

- **§40 — Disclosure of conflict of interest** when applicable
- **Verbal pre-disclosure of total price + currency** before booking
- **Receipt of payment** (separate from the invoice; acknowledged by `payment_transactions`)
- **Refund eligibility under TICO compensation fund** (covered by the standard compliance statement template, but not field-level enforced)

These are documented as agent-training items, not finalization blockers.

---

## How to add a new §38 check

1. Add the check to `apps/api/src/financials/tico-compliance.ts` (push a violation string).
2. Add a row to the table above explaining the clause + how an agency satisfies it.
3. Add a unit test in `apps/api/src/financials/__tests__/trip-order-tico-compliance.spec.ts` covering both reject + accept paths.
4. If the check requires a new field on `BusinessConfiguration`, also update `apps/api/src/financials/pdf/types.ts` and the agency-settings UI in `apps/admin`.

---

## Auditing your live invoices

To spot-check that finalized invoices satisfy §38 today:

```bash
# Hit the finalize endpoint with `--dry-run=true` semantics by calling
# the validator directly via a tiny script:
pnpm --filter @tailfire/api exec tsx -e "
import { validateTICOCompliance } from './apps/api/src/financials/tico-compliance'
// fetch a real trip order from prod (read-only) and pass into validateTICOCompliance
"
```

Or just attempt a finalize via the admin UI — the gate now blocks with a per-clause violation list.
