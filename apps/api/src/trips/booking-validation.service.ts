/**
 * Booking Validation Service
 *
 * Validates whether an activity meets all Tier 1 requirements to be marked as booked.
 * Called before transitioning bookingStatus to 'booked'.
 */

import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { BookingValidationResult } from '@tailfire/shared-types'

export type { BookingValidationResult }

@Injectable()
export class BookingValidationService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Validate all Tier 1 booking requirements for an activity.
   * Returns { valid: true, errors: [] } if all checks pass,
   * or { valid: false, errors: [...] } with human-readable error messages.
   */
  async validateBooking(activityId: string): Promise<BookingValidationResult> {
    const errors: BookingValidationResult['errors'] = []

    // Fetch activity + pricing in one query
    const activityData = await this.fetchActivityWithPricing(activityId)
    if (!activityData) {
      return { valid: false, errors: [{ message: 'Activity not found', code: 'ACTIVITY_NOT_FOUND' }] }
    }

    // Fetch travelers with their contacts
    const travelers = await this.fetchTravelersWithContacts(activityId)

    // Fetch payment schedule config and expected payment items
    const paymentData = await this.fetchPaymentData(activityData.pricing_id)

    // === Check 1: Supplier identified ===
    if (!activityData.supplier || activityData.supplier.trim() === '') {
      errors.push({ message: 'Supplier must be identified', code: 'SUPPLIER_MISSING' })
    }

    // === Check 2: Booking date set ===
    if (!activityData.booking_date) {
      errors.push({ message: 'Booking date is required', code: 'BOOKING_DATE_MISSING' })
    }

    // === Check 3: Departure + return dates ===
    if (!activityData.start_datetime) {
      errors.push({ message: 'Start date/time is required', code: 'START_DATE_MISSING' })
    }
    if (!activityData.end_datetime) {
      errors.push({ message: 'End date/time is required', code: 'END_DATE_MISSING' })
    }
    if (activityData.start_datetime && activityData.end_datetime) {
      const start = new Date(activityData.start_datetime)
      const end = new Date(activityData.end_datetime)
      if (start >= end) {
        errors.push({ message: 'Start date/time must be before end date/time', code: 'DATE_ORDER_INVALID' })
      }
    }

    // === Check 4: Traveler assigned ===
    if (travelers.length === 0) {
      errors.push({ message: 'At least one traveler must be assigned to this activity', code: 'NO_TRAVELERS' })
    }

    // === Check 5: Traveler contact complete ===
    for (const t of travelers) {
      const name = t.first_name && t.last_name
        ? `${t.first_name} ${t.last_name}`
        : t.first_name || t.last_name || 'Unknown traveler'

      if (!t.first_name || t.first_name.trim() === '') {
        errors.push({ message: `Traveler "${name}" is missing first name`, code: 'TRAVELER_FIRST_NAME' })
      }
      if (!t.last_name || t.last_name.trim() === '') {
        errors.push({ message: `Traveler "${name}" is missing last name`, code: 'TRAVELER_LAST_NAME' })
      }
      if (!t.date_of_birth) {
        errors.push({ message: `Traveler "${name}" is missing date of birth`, code: 'TRAVELER_DOB' })
      }
      if (!t.address_line1 || t.address_line1.trim() === '') {
        errors.push({ message: `Traveler "${name}" is missing address`, code: 'TRAVELER_ADDRESS' })
      }
    }

    // === Check 6: Total price > 0 ===
    if (!activityData.total_price_cents || activityData.total_price_cents <= 0) {
      errors.push({ message: 'Total price must be greater than zero', code: 'PRICE_MISSING' })
    }

    // === Check 7: Payment schedule defined ===
    if (paymentData.scheduleConfigs.length === 0) {
      errors.push({ message: 'Payment schedule must be defined', code: 'PAYMENT_SCHEDULE_MISSING' })
    }

    // === Check 8: Deposit + due dates ===
    if (paymentData.expectedItems.length === 0) {
      errors.push({ message: 'At least one expected payment item must exist', code: 'PAYMENT_ITEMS_MISSING' })
    } else {
      const hasItemWithDueDate = paymentData.expectedItems.some(item => item.due_date !== null)
      if (!hasItemWithDueDate) {
        errors.push({ message: 'At least one expected payment item must have a due date', code: 'PAYMENT_DUE_DATE_MISSING' })
      }
    }

    // === Check 9: Confirmation number ===
    if (!activityData.confirmation_number || activityData.confirmation_number.trim() === '') {
      errors.push({ message: 'Confirmation number is required', code: 'CONFIRMATION_NUMBER_MISSING' })
    }

    // === Check 10: Passport check ===
    if (!activityData.passport_verified && travelers.length > 0) {
      for (const t of travelers) {
        const name = t.first_name && t.last_name
          ? `${t.first_name} ${t.last_name}`
          : t.first_name || t.last_name || 'Unknown traveler'

        if (!t.passport_number) {
          errors.push({ message: `Traveler "${name}" is missing passport number`, code: 'PASSPORT_NUMBER_MISSING' })
          continue
        }

        if (!t.passport_expiry) {
          errors.push({ message: `Traveler "${name}" is missing passport expiry date`, code: 'PASSPORT_EXPIRY_MISSING' })
          continue
        }

        // Passport must be valid for at least 6 months after trip end
        if (activityData.end_datetime) {
          const endDate = new Date(activityData.end_datetime)
          const sixMonthsAfterEnd = new Date(endDate)
          sixMonthsAfterEnd.setMonth(sixMonthsAfterEnd.getMonth() + 6)

          const passportExpiry = new Date(t.passport_expiry)
          if (passportExpiry <= sixMonthsAfterEnd) {
            errors.push({
              message: `Traveler "${name}" passport expires too soon (must be valid at least 6 months after trip end)`,
              code: 'PASSPORT_EXPIRY_TOO_SOON',
            })
          }
        }
      }
    }

    // === Check 11: Final payment due before departure ===
    if (activityData.start_datetime && paymentData.expectedItems.length > 0) {
      const itemsWithDueDate = paymentData.expectedItems
        .filter(item => item.due_date !== null)
        .sort((a, b) => new Date(b.due_date!).getTime() - new Date(a.due_date!).getTime())

      if (itemsWithDueDate.length > 0) {
        const lastDueDate = new Date(itemsWithDueDate[0]!.due_date!)
        const startDate = new Date(activityData.start_datetime)
        if (lastDueDate >= startDate) {
          errors.push({ message: 'Final payment due date must be before departure date', code: 'FINAL_PAYMENT_AFTER_DEPARTURE' })
        }
      }
    }

    // === Check 12: Non-refundable flagged ===
    // non_refundable_deposit flag lives on activity_pricing, amounts on payment_schedule_config
    if (activityData.non_refundable_deposit === true) {
      for (const config of paymentData.scheduleConfigs) {
        if (!config.non_refundable_amount_cents || config.non_refundable_amount_cents <= 0) {
          errors.push({ message: 'Non-refundable deposit is flagged but non-refundable amount is not set or zero', code: 'NON_REFUNDABLE_NOT_SET' })
        } else if (config.deposit_amount_cents && config.non_refundable_amount_cents > config.deposit_amount_cents) {
          errors.push({ message: 'Non-refundable amount cannot exceed deposit amount', code: 'NON_REFUNDABLE_EXCEEDS_DEPOSIT' })
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Fetch activity with its pricing data in a single query.
   */
  private async fetchActivityWithPricing(activityId: string) {
    type ActivityPricingRow = {
      id: string
      start_datetime: string | null
      end_datetime: string | null
      booking_date: string | null
      confirmation_number: string | null
      passport_verified: boolean
      pricing_id: string | null
      supplier: string | null
      total_price_cents: number | null
      non_refundable_deposit: boolean | null
    }

    const result = await this.db.client.execute(sql`
      SELECT
        ia.id,
        ia.start_datetime,
        ia.end_datetime,
        ia.booking_date,
        ia.confirmation_number,
        ia.passport_verified,
        ap.id as pricing_id,
        COALESCE(NULLIF(BTRIM(pd.supplier_name), ''), NULLIF(BTRIM(ap.supplier), '')) as supplier,
        ap.total_price_cents,
        ap.non_refundable_deposit
      FROM itinerary_activities ia
      LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
      LEFT JOIN package_details pd ON pd.activity_id = ia.id
      WHERE ia.id = ${activityId}
      LIMIT 1
    `) as unknown as ActivityPricingRow[]

    if (!result || result.length === 0) {
      return null
    }

    return result[0]!
  }

  /**
   * Fetch travelers assigned to this activity with their contact details.
   * Join path: activity_travelers -> trip_travelers -> contacts
   */
  private async fetchTravelersWithContacts(activityId: string) {
    type TravelerContactRow = {
      activity_traveler_id: string
      contact_id: string
      first_name: string | null
      last_name: string | null
      date_of_birth: string | null
      address_line1: string | null
      passport_number: string | null
      passport_expiry: string | null
    }

    const result = await this.db.client.execute(sql`
      SELECT
        at_tbl.id as activity_traveler_id,
        c.id as contact_id,
        c.first_name,
        c.last_name,
        c.date_of_birth,
        c.address_line1,
        c.passport_number,
        c.passport_expiry
      FROM activity_travelers at_tbl
      JOIN trip_travelers tt ON tt.id = at_tbl.trip_traveler_id
      JOIN contacts c ON c.id = tt.contact_id
      WHERE at_tbl.activity_id = ${activityId}
    `) as unknown as TravelerContactRow[]

    return result || []
  }

  /**
   * Fetch payment schedule configs and expected payment items for an activity's pricing.
   */
  private async fetchPaymentData(pricingId: string | null) {
    if (!pricingId) {
      return { scheduleConfigs: [], expectedItems: [] }
    }

    type ScheduleConfigRow = {
      id: string
      schedule_type: string
      deposit_type: string | null
      deposit_amount_cents: number | null
      non_refundable_amount_cents: number | null
    }

    type ExpectedPaymentRow = {
      id: string
      due_date: string | null
      expected_amount_cents: number
      sequence_order: number
    }

    const [configResult, itemsResult] = await Promise.all([
      this.db.client.execute(sql`
        SELECT
          id,
          schedule_type,
          deposit_type,
          deposit_amount_cents,
          non_refundable_amount_cents
        FROM payment_schedule_config
        WHERE component_pricing_id = ${pricingId}
      `) as unknown as Promise<ScheduleConfigRow[]>,

      this.db.client.execute(sql`
        SELECT
          epi.id,
          epi.due_date,
          epi.expected_amount_cents,
          epi.sequence_order
        FROM expected_payment_items epi
        JOIN payment_schedule_config psc ON psc.id = epi.payment_schedule_config_id
        WHERE psc.component_pricing_id = ${pricingId}
        ORDER BY epi.sequence_order ASC
      `) as unknown as Promise<ExpectedPaymentRow[]>,
    ])

    return {
      scheduleConfigs: configResult || [],
      expectedItems: itemsResult || [],
    }
  }
}
