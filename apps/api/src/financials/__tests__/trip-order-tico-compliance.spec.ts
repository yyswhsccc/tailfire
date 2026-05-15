/**
 * Unit Tests: validateTICOCompliance — B4 §38 expansion
 *
 * Pure-function tests on the validation logic. The function is extracted
 * from TripOrderService into ./tico-compliance so tests don't drag the
 * full service tree (and the API typecheck baseline) into ts-jest.
 *
 * The tests below cover only the B4 expansion (insurance, travel-document,
 * cancellation, non-refundable, TICO registration format, price-increase).
 * The pre-existing §38(1)/(2)/(3)/(5)/(7)/(12) checks are exercised
 * implicitly by the "valid invoice → no violations" baseline test.
 */

import { validateTICOCompliance } from '../tico-compliance'
import type {
  TICOTripOrder,
  BusinessConfiguration,
  TripOrderBookingDetail,
  TripOrderPaymentSummary,
} from '../pdf/types'

// Build a fully-valid tripOrder shape, then override per test.
function makeValidShape() {
  const orderData: TICOTripOrder = {
    order_header: {
      title: 'Test Order',
      order_number: 'TF-001',
      order_date: '2026-05-15',
      agency_info: {
        name: 'Phoenix Voyages',
        address: '123 Yonge St, Toronto',
        phone: '416-555-0100',
        email: 'hello@phoenixvoyages.ca',
      } as never,
      customer_info: { name: 'Jane Smith' } as never,
      agent_info: { name: 'Bob Agent' } as never,
    },
    service_details: {
      description: 'Beach week in Punta Cana',
      travel_dates: { departure: '2026-07-01', return: '2026-07-08' },
    },
    cost_breakdown: { final_total: 5000 } as never,
    compliance_statement: 'TICO disclosures apply.',
    generated_at: '2026-05-15T12:00:00Z',
  }

  const businessConfig: BusinessConfiguration = {
    company_name: 'Phoenix Voyages',
    full_address: '123 Yonge St, Toronto, ON',
    email: 'hello@phoenixvoyages.ca',
    tico_registration: '5012345',
    document_passport_requirements: 'A passport valid 6 months past return is required.',
    document_visa_requirements: 'Visas are the traveller responsibility.',
    document_insurance_requirements: 'Insurance was offered and may be declined in writing.',
    include_default_tico_disclosures: true,
  }

  const bookingDetails: TripOrderBookingDetail[] = [
    {
      booking_id: 'a1',
      title: 'Hotel X — 7 nights',
      booking_type: 'hotel',
      cancellation_policy: 'Non-refundable after 30 days from booking.',
      non_refundable: true,
    },
    {
      booking_id: 'a2',
      title: 'Flight Y — Round trip',
      booking_type: 'flight',
      cancellation_policy: 'Refundable up to 24h before departure.',
      non_refundable: false,
    },
  ]

  const paymentSummary: TripOrderPaymentSummary = {} as TripOrderPaymentSummary

  return { orderData, businessConfig, bookingDetails, paymentSummary }
}

describe('validateTICOCompliance — B4 §38 expansion', () => {

  // ============================================================================
  // Baseline: a fully-populated shape returns no violations
  // ============================================================================

  it('returns no violations for a fully-compliant order', () => {
    const shape = makeValidShape()
    expect(validateTICOCompliance(shape)).toEqual([])
  })

  // ============================================================================
  // TICO registration number drift
  // ============================================================================

  describe('TICO registration number', () => {
    it('rejects empty tico_registration', () => {
      const shape = makeValidShape()
      shape.businessConfig.tico_registration = ''
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/TICO registration number is required/))
    })

    it('rejects whitespace-only tico_registration', () => {
      const shape = makeValidShape()
      shape.businessConfig.tico_registration = '   '
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/TICO registration number is required/))
    })

    it('rejects malformed tico_registration (alphabetic)', () => {
      const shape = makeValidShape()
      shape.businessConfig.tico_registration = 'ABC1234'
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/not in the expected 4-9 digit numeric format/))
    })

    it('rejects too-short tico_registration', () => {
      const shape = makeValidShape()
      shape.businessConfig.tico_registration = '123'
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/4-9 digit/))
    })

    it('accepts 7-digit tico_registration (canonical)', () => {
      const shape = makeValidShape()
      shape.businessConfig.tico_registration = '5012345'
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => x.includes('TICO registration'))).toEqual([])
    })
  })

  // ============================================================================
  // Insurance disclosure
  // ============================================================================

  describe('insurance disclosure', () => {
    it('rejects when document_insurance_requirements is missing', () => {
      const shape = makeValidShape()
      shape.businessConfig.document_insurance_requirements = ''
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/Insurance disclosure/))
    })

    it('accepts when custom_compliance_disclosures mentions insurance', () => {
      const shape = makeValidShape()
      shape.businessConfig.document_insurance_requirements = ''
      shape.businessConfig.custom_compliance_disclosures = [
        'Travel insurance was offered. Customer signed an insurance waiver.',
      ]
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => /Insurance disclosure/.test(x))).toEqual([])
    })

    it('rejects when neither field nor custom disclosure mentions insurance', () => {
      const shape = makeValidShape()
      shape.businessConfig.document_insurance_requirements = ''
      shape.businessConfig.custom_compliance_disclosures = ['Some unrelated disclosure']
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/Insurance disclosure/))
    })
  })

  // ============================================================================
  // Travel-document advice (passport + visa)
  // ============================================================================

  describe('travel-document advice', () => {
    it('rejects when passport requirements missing', () => {
      const shape = makeValidShape()
      shape.businessConfig.document_passport_requirements = ''
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/Travel-document advice/))
    })

    it('rejects when visa requirements missing', () => {
      const shape = makeValidShape()
      shape.businessConfig.document_visa_requirements = ''
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/Travel-document advice/))
    })

    it('accepts when both fields populated', () => {
      const shape = makeValidShape()
      // Already populated via makeValidShape
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => /Travel-document advice/.test(x))).toEqual([])
    })

    it('accepts when fields missing but custom disclosures cover both', () => {
      const shape = makeValidShape()
      shape.businessConfig.document_passport_requirements = ''
      shape.businessConfig.document_visa_requirements = ''
      shape.businessConfig.custom_compliance_disclosures = [
        'Passport required, valid 6 months past return.',
        'Visa requirements: traveller is responsible for confirming entry visas.',
      ]
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => /Travel-document advice/.test(x))).toEqual([])
    })

    it('rejects when only passport mentioned in custom disclosures', () => {
      const shape = makeValidShape()
      shape.businessConfig.document_passport_requirements = ''
      shape.businessConfig.document_visa_requirements = ''
      shape.businessConfig.custom_compliance_disclosures = ['Passport required.']
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/Travel-document advice/))
    })
  })

  // ============================================================================
  // Price-increase / surcharge terms
  // ============================================================================

  describe('price-increase terms', () => {
    it('accepts default TICO disclosures (the common case)', () => {
      const shape = makeValidShape()
      // include_default_tico_disclosures defaults to true via makeValidShape
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => /Price-increase/.test(x))).toEqual([])
    })

    it('rejects when defaults disabled and no custom terms present', () => {
      const shape = makeValidShape()
      shape.businessConfig.include_default_tico_disclosures = false
      shape.businessConfig.trip_order_terms = ''
      shape.businessConfig.custom_compliance_disclosures = []
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/Price-increase/))
    })

    it('accepts when trip_order_terms populated', () => {
      const shape = makeValidShape()
      shape.businessConfig.include_default_tico_disclosures = false
      shape.businessConfig.trip_order_terms = 'Detailed terms including surcharge clauses.'
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => /Price-increase/.test(x))).toEqual([])
    })

    it('accepts when custom disclosure mentions price changes', () => {
      const shape = makeValidShape()
      shape.businessConfig.include_default_tico_disclosures = false
      shape.businessConfig.trip_order_terms = ''
      shape.businessConfig.custom_compliance_disclosures = [
        'Price increase rules apply per the cruise line tariff.',
      ]
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => /Price-increase/.test(x))).toEqual([])
    })
  })

  // ============================================================================
  // Cancellation policy on every booking
  // ============================================================================

  describe('cancellation policy', () => {
    it('rejects when one booking has missing cancellation_policy', () => {
      const shape = makeValidShape()
      shape.bookingDetails[1] = {
        ...shape.bookingDetails[1]!,
        cancellation_policy: '',
      }
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/Cancellation policy missing on 1 booking/))
    })

    it('rejects with correct count when multiple bookings missing', () => {
      const shape = makeValidShape()
      shape.bookingDetails = shape.bookingDetails.map((b) => ({
        ...b,
        cancellation_policy: undefined,
      })) as TripOrderBookingDetail[]
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/Cancellation policy missing on 2 booking/))
    })
  })

  // ============================================================================
  // Non-refundable deposit disclosure
  // ============================================================================

  describe('non-refundable deposit disclosure', () => {
    it('rejects when non_refundable=true but cancellation_policy text doesnt mention it', () => {
      const shape = makeValidShape()
      shape.bookingDetails[0] = {
        ...shape.bookingDetails[0]!,
        non_refundable: true,
        cancellation_policy: 'Standard 60-day policy applies.',
      }
      const v = validateTICOCompliance(shape)
      expect(v).toContainEqual(expect.stringMatching(/non-refundable but cancellation_policy text does not disclose/))
    })

    it('accepts when policy text contains "non-refundable"', () => {
      const shape = makeValidShape()
      // Already configured this way in makeValidShape
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => /non-refundable but cancellation_policy/.test(x))).toEqual([])
    })

    it('accepts when policy text contains "non refundable" (no hyphen)', () => {
      const shape = makeValidShape()
      shape.bookingDetails[0] = {
        ...shape.bookingDetails[0]!,
        non_refundable: true,
        cancellation_policy: 'Deposit is non refundable after deposit confirmation.',
      }
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => /non-refundable but cancellation_policy/.test(x))).toEqual([])
    })

    it('does not require disclosure when non_refundable=false', () => {
      const shape = makeValidShape()
      shape.bookingDetails = [
        {
          ...shape.bookingDetails[1]!,
          non_refundable: false,
          cancellation_policy: 'Refundable up to 24h before departure.',
        },
      ]
      const v = validateTICOCompliance(shape)
      expect(v.filter((x) => /non-refundable/.test(x))).toEqual([])
    })
  })
})
