/**
 * Booking Validation Service
 *
 * Validates whether an activity meets all Tier 1 requirements to be marked as booked.
 * Called before transitioning bookingStatus to 'booked'.
 */

import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

export interface BookingValidationResult {
  valid: boolean
  errors: string[]
}

@Injectable()
export class BookingValidationService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Validate all Tier 1 booking requirements for an activity.
   * Returns { valid: true, errors: [] } if all checks pass,
   * or { valid: false, errors: [...] } with human-readable error messages.
   */
  async validateBooking(activityId: string): Promise<BookingValidationResult> {
    const errors: string[] = []

    // Fetch activity + pricing in one query
    const activityData = await this.fetchActivityWithPricing(activityId)
    if (!activityData) {
      return { valid: false, errors: ['Activity not found'] }
    }

    // Fetch travelers with their contacts
    const travelers = await this.fetchTravelersWithContacts(activityId)

    // Fetch payment schedule config and expected payment items
    const paymentData = await this.fetchPaymentData(activityData.pricing_id)

    // === Check 1: Supplier identified ===
    if (!activityData.supplier || activityData.supplier.trim() === '') {
      errors.push('Supplier must be identified')
    }

    // === Check 2: Booking date set ===
    if (!activityData.booking_date) {
      errors.push('Booking date is required')
    }

    // === Check 3: Departure + return dates ===
    if (!activityData.start_datetime) {
      errors.push('Start date/time is required')
    }
    if (!activityData.end_datetime) {
      errors.push('End date/time is required')
    }
    if (activityData.start_datetime && activityData.end_datetime) {
      const start = new Date(activityData.start_datetime)
      const end = new Date(activityData.end_datetime)
      if (start >= end) {
        errors.push('Start date/time must be before end date/time')
      }
    }

    // === Check 4: Traveler assigned ===
    if (travelers.length === 0) {
      errors.push('At least one traveler must be assigned to this activity')
    }

    // === Check 5: Traveler contact complete ===
    for (const t of travelers) {
      const name = t.first_name && t.last_name
        ? `${t.first_name} ${t.last_name}`
        : t.first_name || t.last_name || 'Unknown traveler'

      if (!t.first_name || t.first_name.trim() === '') {
        errors.push(`Traveler "${name}" is missing first name`)
      }
      if (!t.last_name || t.last_name.trim() === '') {
        errors.push(`Traveler "${name}" is missing last name`)
      }
      if (!t.date_of_birth) {
        errors.push(`Traveler "${name}" is missing date of birth`)
      }
      if (!t.address_line1 || t.address_line1.trim() === '') {
        errors.push(`Traveler "${name}" is missing address`)
      }
    }

    // === Check 6: Total price > 0 ===
    if (!activityData.total_price_cents || activityData.total_price_cents <= 0) {
      errors.push('Total price must be greater than zero')
    }

    // === Check 7: Payment schedule defined ===
    if (paymentData.scheduleConfigs.length === 0) {
      errors.push('Payment schedule must be defined')
    }

    // === Check 8: Deposit + due dates ===
    if (paymentData.expectedItems.length === 0) {
      errors.push('At least one expected payment item must exist')
    } else {
      const hasItemWithDueDate = paymentData.expectedItems.some(item => item.due_date !== null)
      if (!hasItemWithDueDate) {
        errors.push('At least one expected payment item must have a due date')
      }
    }

    // === Check 9: Confirmation number ===
    if (!activityData.confirmation_number || activityData.confirmation_number.trim() === '') {
      errors.push('Confirmation number is required')
    }

    // === Check 10: Passport check ===
    if (!activityData.passport_verified && travelers.length > 0) {
      for (const t of travelers) {
        const name = t.first_name && t.last_name
          ? `${t.first_name} ${t.last_name}`
          : t.first_name || t.last_name || 'Unknown traveler'

        if (!t.passport_number) {
          errors.push(`Traveler "${name}" is missing passport number`)
          continue
        }

        if (!t.passport_expiry) {
          errors.push(`Traveler "${name}" is missing passport expiry date`)
          continue
        }

        // Passport must be valid for at least 6 months after trip end
        if (activityData.end_datetime) {
          const endDate = new Date(activityData.end_datetime)
          const sixMonthsAfterEnd = new Date(endDate)
          sixMonthsAfterEnd.setMonth(sixMonthsAfterEnd.getMonth() + 6)

          const passportExpiry = new Date(t.passport_expiry)
          if (passportExpiry <= sixMonthsAfterEnd) {
            errors.push(
              `Traveler "${name}" passport expires too soon (must be valid at least 6 months after trip end)`
            )
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
          errors.push('Final payment due date must be before departure date')
        }
      }
    }

    // === Check 12: Non-refundable flagged ===
    for (const config of paymentData.scheduleConfigs) {
      if (config.non_refundable_deposit === true) {
        if (!config.non_refundable_amount_cents || config.non_refundable_amount_cents <= 0) {
          errors.push('Non-refundable deposit is flagged but non-refundable amount is not set or zero')
        } else if (config.deposit_amount_cents && config.non_refundable_amount_cents > config.deposit_amount_cents) {
          errors.push('Non-refundable amount cannot exceed deposit amount')
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
        ap.supplier,
        ap.total_price_cents,
        ap.non_refundable_deposit
      FROM itinerary_activities ia
      LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
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
      non_refundable_deposit: boolean | null
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
          non_refundable_deposit,
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
