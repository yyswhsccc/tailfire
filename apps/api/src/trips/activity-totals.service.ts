/**
 * Activity Totals Service
 *
 * Handles aggregated financial totals for activities, particularly packages.
 * Uses set-based SQL queries to avoid N+1 performance issues.
 *
 * Key features:
 * - Package totals: aggregates package + all child activities
 * - Trip booked totals: all booked packages AND standalone booked activities
 * - Efficient single-query aggregation
 */

import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

export interface ActivityTotalDto {
  activityId: string
  totalCost: number
  totalPaid: number
  totalUnpaid: number
}

export interface TripBookedTotalsDto {
  totalItems: number
  totalPackages: number
  totalCost: number
  totalPaid: number
  totalUnpaid: number
  byStatus: Record<string, number>
}

@Injectable()
export class ActivityTotalsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Calculate totals for a package including all children - SET-BASED query
   * Avoids N+1 by fetching all related data in single queries
   *
   * Payment chain: activity → activity_pricing → payment_schedule_config → expected_payment_items → payment_transactions
   */
  async calculatePackageTotal(packageId: string): Promise<ActivityTotalDto> {
    // Single query: Get package + all children with their pricing
    const result = await this.db.client.execute(sql`
      WITH package_activities AS (
        -- Package itself
        SELECT ia.id, ia.activity_type, ap.total_price_cents
        FROM itinerary_activities ia
        LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
        WHERE ia.id = ${packageId}

        UNION ALL

        -- All children (non-recursive since we don't allow deep nesting)
        SELECT ia.id, ia.activity_type, ap.total_price_cents
        FROM itinerary_activities ia
        LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
        WHERE ia.parent_activity_id = ${packageId}
      ),
      activity_payments AS (
        SELECT pa.id as activity_id, COALESCE(SUM(ptx.amount_cents), 0) as paid
        FROM package_activities pa
        LEFT JOIN activity_pricing ap ON ap.activity_id = pa.id
        LEFT JOIN payment_schedule_config psc ON psc.component_pricing_id = ap.id
        LEFT JOIN expected_payment_items epi ON epi.payment_schedule_config_id = psc.id
        LEFT JOIN payment_transactions ptx ON ptx.expected_payment_item_id = epi.id
        GROUP BY pa.id
      )
      SELECT
        COALESCE(SUM(pa.total_price_cents), 0)::bigint as total_cost,
        COALESCE(SUM(ap.paid), 0)::bigint as total_paid
      FROM package_activities pa
      LEFT JOIN activity_payments ap ON ap.activity_id = pa.id
    `)

    // Result is an array (postgres-js driver)
    const row = result[0] as { total_cost: string; total_paid: string } | undefined
    const totalCost = Number(row?.total_cost ?? 0)
    const totalPaid = Number(row?.total_paid ?? 0)

    return {
      activityId: packageId,
      totalCost,
      totalPaid,
      totalUnpaid: totalCost - totalPaid,
    }
  }

  /**
   * Calculate totals for all booked items in a trip (packages + standalone booked activities)
   * Single query for efficiency
   *
   * Payment chain: activity → activity_pricing → payment_schedule_config → expected_payment_items → payment_transactions
   */
  async calculateTripBookedTotals(tripId: string): Promise<TripBookedTotalsDto> {
    const result = await this.db.client.execute(sql`
      WITH booked_items AS (
        -- Packages (always shown in payments) and standalone booked activities
        SELECT ia.id, ia.activity_type, ia.proposal_status, ia.booking_status,
               ap.total_price_cents, ia.parent_activity_id
        FROM itinerary_activities ia
        JOIN itinerary_days id ON ia.itinerary_day_id = id.id
        JOIN itineraries i ON id.itinerary_id = i.id
        LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
        WHERE i.trip_id = ${tripId}
          AND (
            ia.activity_type = 'package'
            OR (ia.booking_status = 'booked' AND ia.parent_activity_id IS NULL)
          )
      ),
      -- Include children of packages for cost aggregation
      all_costs AS (
        SELECT bi.id as root_id, bi.activity_type, bi.proposal_status, bi.booking_status,
               COALESCE(bi.total_price_cents, 0) + COALESCE(SUM(child_ap.total_price_cents), 0) as total_cost
        FROM booked_items bi
        LEFT JOIN itinerary_activities child ON child.parent_activity_id = bi.id
        LEFT JOIN activity_pricing child_ap ON child_ap.activity_id = child.id
        WHERE bi.activity_type = 'package' OR bi.parent_activity_id IS NULL
        GROUP BY bi.id, bi.activity_type, bi.proposal_status, bi.booking_status, bi.total_price_cents
      ),
      payments AS (
        SELECT ac.root_id, COALESCE(SUM(ptx.amount_cents), 0) as paid
        FROM all_costs ac
        LEFT JOIN activity_pricing ap ON ap.activity_id = ac.root_id
        LEFT JOIN payment_schedule_config psc ON psc.component_pricing_id = ap.id
        LEFT JOIN expected_payment_items epi ON epi.payment_schedule_config_id = psc.id
        LEFT JOIN payment_transactions ptx ON ptx.expected_payment_item_id = epi.id
        GROUP BY ac.root_id
      ),
      status_counts AS (
        SELECT status, COUNT(*)::int as count
        FROM all_costs
        WHERE status IS NOT NULL
        GROUP BY status
      )
      SELECT
        COUNT(DISTINCT ac.root_id)::int as total_items,
        COUNT(DISTINCT ac.root_id) FILTER (WHERE ac.activity_type = 'package')::int as total_packages,
        COALESCE(SUM(ac.total_cost), 0)::bigint as total_cost,
        COALESCE(SUM(p.paid), 0)::bigint as total_paid,
        COALESCE(
          (SELECT jsonb_object_agg(status, count) FROM status_counts),
          '{}'::jsonb
        ) as by_status
      FROM all_costs ac
      LEFT JOIN payments p ON p.root_id = ac.root_id
    `)

    // Result is an array (postgres-js driver)
    const row = result[0] as {
      total_items: number
      total_packages: number
      total_cost: string
      total_paid: string
      by_status: Record<string, number>
    } | undefined

    const totalCost = Number(row?.total_cost ?? 0)
    const totalPaid = Number(row?.total_paid ?? 0)

    return {
      totalItems: row?.total_items ?? 0,
      totalPackages: row?.total_packages ?? 0,
      totalCost,
      totalPaid,
      totalUnpaid: totalCost - totalPaid,
      byStatus: row?.by_status ?? {},
    }
  }

  /**
   * Calculate totals for a single activity (not a package)
   * Simpler query without child aggregation
   *
   * Payment chain: activity → activity_pricing → payment_schedule_config → expected_payment_items → payment_transactions
   */
  async calculateActivityTotal(activityId: string): Promise<ActivityTotalDto> {
    const result = await this.db.client.execute(sql`
      SELECT
        COALESCE(ap.total_price_cents, 0)::bigint as total_cost,
        COALESCE(
          (SELECT SUM(ptx.amount_cents)
           FROM activity_pricing ap2
           LEFT JOIN payment_schedule_config psc ON psc.component_pricing_id = ap2.id
           LEFT JOIN expected_payment_items epi ON epi.payment_schedule_config_id = psc.id
           LEFT JOIN payment_transactions ptx ON ptx.expected_payment_item_id = epi.id
           WHERE ap2.activity_id = ${activityId}),
          0
        )::bigint as total_paid
      FROM itinerary_activities ia
      LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
      WHERE ia.id = ${activityId}
    `)

    // Result is an array (postgres-js driver)
    const row = result[0] as { total_cost: string; total_paid: string } | undefined
    const totalCost = Number(row?.total_cost ?? 0)
    const totalPaid = Number(row?.total_paid ?? 0)

    return {
      activityId,
      totalCost,
      totalPaid,
      totalUnpaid: totalCost - totalPaid,
    }
  }
}
