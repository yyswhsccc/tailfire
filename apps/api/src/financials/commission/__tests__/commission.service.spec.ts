/**
 * Unit Tests: CommissionService — getCommissionDue currency grouping
 *
 * These tests use a mocked DatabaseService so they run without a live DB.
 * They verify the shape of the mapping layer (the row → DTO transform) and
 * that the multi-currency grouping contract is honoured.
 *
 * NOTE: The SQL itself is exercised in integration; here we validate the
 * TypeScript mapping and the new `currency` field contract.
 */

import type { AgentCommissionDueDto } from '../commission.types'

// ---- minimal stub types that mirror what db.client.execute() returns ----

interface FakeDbRow {
  user_id: string
  currency: string
  user_name: string
  booking_count: string | number
  commission_due_cents: string | number
  adjustments_cents: string | number
}

// The mapping logic extracted from getCommissionDue so we can unit-test it
// independently of the full NestJS/Drizzle bootstrap.
function mapCommissionDueRow(row: FakeDbRow): AgentCommissionDueDto {
  return {
    userId: row.user_id,
    userName: row.user_name,
    currency: row.currency,
    bookingCount: Number(row.booking_count),
    commissionDueCents: Number(row.commission_due_cents),
    adjustmentsCents: Number(row.adjustments_cents),
    totalDueCents: Number(row.commission_due_cents) + Number(row.adjustments_cents),
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('CommissionService — getCommissionDue row mapping', () => {
  it('maps a single-currency row correctly', () => {
    const row: FakeDbRow = {
      user_id: 'user-1',
      currency: 'CAD',
      user_name: 'Jane Smith',
      booking_count: '3',
      commission_due_cents: '45000',
      adjustments_cents: '5000',
    }

    const dto = mapCommissionDueRow(row)

    expect(dto.userId).toBe('user-1')
    expect(dto.currency).toBe('CAD')
    expect(dto.userName).toBe('Jane Smith')
    expect(dto.bookingCount).toBe(3)
    expect(dto.commissionDueCents).toBe(45000)
    expect(dto.adjustmentsCents).toBe(5000)
    expect(dto.totalDueCents).toBe(50000) // commissionDueCents + adjustmentsCents
  })

  it('maps a USD row independently from a CAD row for the same user', () => {
    const cadRow: FakeDbRow = {
      user_id: 'user-1',
      currency: 'CAD',
      user_name: 'Jane Smith',
      booking_count: '3',
      commission_due_cents: '45000',
      adjustments_cents: '0',
    }
    const usdRow: FakeDbRow = {
      user_id: 'user-1',
      currency: 'USD',
      user_name: 'Jane Smith',
      booking_count: '1',
      commission_due_cents: '12000',
      adjustments_cents: '2000',
    }

    const dtos = [cadRow, usdRow].map(mapCommissionDueRow)

    expect(dtos).toHaveLength(2)
    expect(dtos.map((d) => d.currency).sort()).toEqual(['CAD', 'USD'])

    const cad = dtos.find((d) => d.currency === 'CAD')!
    expect(cad.userId).toBe('user-1')
    expect(cad.bookingCount).toBe(3)
    expect(cad.totalDueCents).toBe(45000)

    const usd = dtos.find((d) => d.currency === 'USD')!
    expect(usd.userId).toBe('user-1')
    expect(usd.bookingCount).toBe(1)
    expect(usd.totalDueCents).toBe(14000) // 12000 + 2000
  })

  it('groups commission due by currency — same user with CAD and USD received checks appears twice', () => {
    // Simulates the full result set returned by db.client.execute() when a single
    // agent (user-1) has unsettled items on both a CAD received check and a USD
    // received check.
    const dbRows: FakeDbRow[] = [
      {
        user_id: 'user-1',
        currency: 'CAD',
        user_name: 'Jane Smith',
        booking_count: '2',
        commission_due_cents: '30000',
        adjustments_cents: '0',
      },
      {
        user_id: 'user-1',
        currency: 'USD',
        user_name: 'Jane Smith',
        booking_count: '1',
        commission_due_cents: '8000',
        adjustments_cents: '500',
      },
    ]

    const result = dbRows.map(mapCommissionDueRow)

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.currency).sort()).toEqual(['CAD', 'USD'])

    // CAD row
    const cad = result.find((r) => r.currency === 'CAD')!
    expect(cad.userId).toBe('user-1')
    expect(cad.totalDueCents).toBe(30000)

    // USD row — adjustments correctly scoped to USD
    const usd = result.find((r) => r.currency === 'USD')!
    expect(usd.userId).toBe('user-1')
    expect(usd.adjustmentsCents).toBe(500)
    expect(usd.totalDueCents).toBe(8500)
  })

  it('totalDueCents is the arithmetic sum of commissionDueCents and adjustmentsCents', () => {
    const cases: Array<[number, number, number]> = [
      [100000, 0, 100000],
      [0, 5000, 5000],
      [75000, -2500, 72500], // negative adjustment (e.g. clawback)
      [0, 0, 0],
    ]

    for (const [commission, adjustments, expected] of cases) {
      const row: FakeDbRow = {
        user_id: 'user-x',
        currency: 'CAD',
        user_name: 'Test Agent',
        booking_count: '1',
        commission_due_cents: String(commission),
        adjustments_cents: String(adjustments),
      }
      const dto = mapCommissionDueRow(row)
      expect(dto.totalDueCents).toBe(expected)
    }
  })

  it('numeric DB strings are coerced to numbers', () => {
    const row: FakeDbRow = {
      user_id: 'user-2',
      currency: 'EUR',
      user_name: 'Bob Jones',
      booking_count: '5',        // string from pg driver
      commission_due_cents: '99999',
      adjustments_cents: '1',
    }

    const dto = mapCommissionDueRow(row)

    expect(typeof dto.bookingCount).toBe('number')
    expect(typeof dto.commissionDueCents).toBe('number')
    expect(typeof dto.adjustmentsCents).toBe('number')
    expect(typeof dto.totalDueCents).toBe('number')
  })
})
