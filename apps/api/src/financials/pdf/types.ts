/**
 * Trip Order PDF Types
 *
 * Type definitions for the professional Trip Order PDF generation.
 * Adapted from tailfire-alpha for server-side rendering.
 */

/**
 * Payment summary aggregating all trip payments
 */
export interface TripOrderPaymentSummary {
  total_payments: number
  processed_payments: number
  pending_payments: number
  refunds: number
  balance_due: number
  payments_list: Array<{
    date: string
    amount: number
    payment_method_type: string
    status: string
    notes?: string
  }>
}

/**
 * Individual booking detail for display in Trip Order
 */
export interface TripOrderBookingDetail {
  booking_id: string
  title: string
  booking_type: string
  vendor_confirmation?: string
  start_date?: string
  end_date?: string
  base_price?: number
  taxes?: number
  amount?: number
  currency?: string
  // TICO-required financial details
  cancellation_policy?: string
  terms_and_conditions?: string
  non_refundable?: boolean
  net_price?: number
  supplier?: string
  per_passenger_breakdown?: Array<{
    passengerId: string
    passengerName: string
    total: number
  }>
  /** Child activities included in this package (displayed as "Included" sub-items) */
  included_items?: Array<{ name: string; type: string; confirmationNumber?: string | null }>
}

/**
 * Payment schedule summary for Trip Order
 */
export interface TripOrderPaymentScheduleSummary {
  total_scheduled_amount: number
  total_pending_amount: number
  total_paid_from_schedule: number
  schedule_items: Array<{
    booking_title: string
    description: string
    due_date: string
    amount: number
    amount_paid: number
    status: string
    disclosure_text?: string
  }>
}

/**
 * Customer address structure
 */
export interface CustomerAddress {
  street1?: string
  street2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

/**
 * Customer information in order header
 */
export interface CustomerInfo {
  name: string
  email?: string
  phone?: string
  address?: CustomerAddress
}

/**
 * Agency information in order header
 */
export interface AgencyInfo {
  name: string
  tico_registration?: string
  address?: string
  phone?: string
  email?: string
}

/**
 * Agent information in order header
 */
export interface AgentInfo {
  name: string
  email?: string
  phone?: string
  extension?: string
}

/**
 * Cost line item
 */
export interface CostLineItem {
  description: string
  amount: number
  supplier_name?: string
}

/**
 * Payment instructions
 */
export interface PaymentInstructions {
  pay_to_supplier?: {
    amount: number
    instructions: string
    deadline?: string
  }
  pay_to_agency?: {
    amount: number
    instructions: string
    deadline?: string
  }
}

/**
 * Cost breakdown structure
 */
export interface CostBreakdown {
  service_description: string
  base_cost: number
  supplier_fees: CostLineItem[]
  ncf_fees: CostLineItem[]
  agency_fees?: CostLineItem[]
  subtotal: number
  agency_total?: number
  final_total: number
  payment_instructions: PaymentInstructions
  compliance_notes: string[]
  per_passenger_breakdown?: Array<{
    passenger_id: string
    passenger_name: string
    base_fare: number
    taxes?: number
    fees?: number
    total: number
  }>
}

/**
 * Passenger data structure
 */
export interface Passenger {
  id: string
  firstName: string
  lastName: string
  type?: 'adult' | 'child' | 'infant'
  dateOfBirth?: string
}

/**
 * Travel dates structure
 */
export interface TravelDates {
  departure: string
  return?: string
}

/**
 * TICO Trip Order structure
 */
export interface TICOTripOrder {
  order_header: {
    title: string
    order_number: string
    order_date: string
    agency_info: AgencyInfo
    customer_info: CustomerInfo
    agent_info?: AgentInfo
  }
  service_details: {
    description: string
    travel_dates?: TravelDates
    destination?: string
    currency?: string
    passengers?: Passenger[]
  }
  cost_breakdown: CostBreakdown
  compliance_statement: string
  generated_at: string
}

/**
 * Business configuration for PDF branding
 */
export interface BusinessConfiguration {
  company_name: string
  company_tagline?: string
  logo_url?: string
  full_address: string
  phone?: string
  toll_free?: string
  email: string
  tico_registration: string
  hst_number?: string
  trip_order_terms?: string
  document_passport_requirements?: string
  document_visa_requirements?: string
  document_insurance_requirements?: string
  document_disclaimer?: string
  include_default_tico_disclosures?: boolean
  custom_compliance_disclosures?: string[]
  primary_color?: string
  secondary_color?: string
}

/**
 * Props for PDF Trip Order Document
 */
export interface TripOrderPDFProps {
  tripOrder: TICOTripOrder
  businessConfig: BusinessConfiguration
  paymentSummary?: TripOrderPaymentSummary
  bookingDetails?: TripOrderBookingDetail[]
  paymentScheduleSummary?: TripOrderPaymentScheduleSummary
  version?: number
}
