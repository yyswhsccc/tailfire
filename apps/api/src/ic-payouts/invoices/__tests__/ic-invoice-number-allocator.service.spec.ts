/**
 * Unit Tests: IcInvoiceNumberAllocator
 *
 * TDD — tests written against the public API of the service.
 *
 * Approach: pure unit tests with a mocked DatabaseService.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  IMPORTANT: race-freeness caveat                                        │
 * │                                                                         │
 * │  The mock below simulates INSERT…ON CONFLICT DO UPDATE atomically via   │
 * │  a shared in-memory Map. In a single JS event loop this is trivially    │
 * │  correct — there is no real concurrency. The concurrency test below     │
 * │  verifies that the SERVICE layer correctly forwards 50 parallel calls   │
 * │  to the DB primitive and assembles the results, but it does NOT prove   │
 * │  DB-level race-freeness.                                                │
 * │                                                                         │
 * │  Real race-freeness is guaranteed by the SQL itself:                    │
 * │    INSERT…ON CONFLICT DO UPDATE takes a row-level lock on the           │
 * │    conflicting row before incrementing, so concurrent Postgres           │
 * │    transactions serialize at that lock and each gets a distinct value.  │
 * │                                                                         │
 * │  Full integration verification requires running the concurrency test    │
 * │  against a real Postgres (e.g., using the integration test pattern in   │
 * │  trips/__tests__/reference-numbers.spec.ts with a live DATABASE_URL).   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { Test } from '@nestjs/testing'
import { IcInvoiceNumberAllocator } from '../ic-invoice-number-allocator.service'
import { DatabaseService } from '../../../db/database.service'

// ─── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Build a mock DatabaseService whose `client.transaction(cb)` executes the
 * callback with a tx object that has a single method: `execute(sqlTag)`.
 *
 * The mock maintains an internal counter Map keyed by
 * `${agencyId}:${userId}:${taxYear}`. On each call it increments the counter
 * atomically (within the JS event loop — see caveat above) and returns the
 * new value as `allocated`, mirroring what the real
 * INSERT…ON CONFLICT DO UPDATE…RETURNING produces.
 *
 * The `sql` tagged-template from drizzle-orm produces an object; we extract
 * the interpolated parameter values to reconstruct the key. The values are
 * in the `.params` or `.values` array depending on the drizzle version.
 * Rather than parsing SQL, the mock wraps `allocate` via the closure
 * approach: we intercept the params that `sql\`...\`` injects.
 *
 * Simpler approach used here: expose `_counters` so tests can inspect state,
 * and capture params via the `sql` object's queryChunks / values property.
 */
function createMockDb() {
  // agencyId:userId:taxYear → current count
  const counters = new Map<string, number>()

  function makeAtomicUpsert(agencyId: string, userId: string, taxYear: number): number {
    const key = `${agencyId}:${userId}:${taxYear}`
    const next = (counters.get(key) ?? 0) + 1
    counters.set(key, next)
    return next
  }

  const mockTx = {
    execute: jest.fn(async (sqlTag: any) => {
      // Extract params from drizzle sql`` object.
      // drizzle-orm's sql`` template produces an object with a `queryChunks`
      // array where odd-indexed entries are the interpolated param values.
      // The params are in order: agencyId, userId, taxYear (matching the VALUES clause).
      const params: any[] = sqlTag.queryChunks
        ? sqlTag.queryChunks.filter((_: any, i: number) => i % 2 === 1)
        : (sqlTag.params ?? sqlTag.values ?? [])

      const [agencyId, userId, taxYear] = params as [string, string, number]
      const allocated = makeAtomicUpsert(agencyId, userId, taxYear)
      return [{ allocated }]
    }),
  }

  const mockClient = {
    transaction: jest.fn(async (cb: (tx: typeof mockTx) => Promise<any>) => {
      return cb(mockTx)
    }),
  }

  const mockDbService = {
    client: mockClient,
    _counters: counters,
    _tx: mockTx,
  }

  return mockDbService
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('IcInvoiceNumberAllocator', () => {
  let allocator: IcInvoiceNumberAllocator
  let mockDb: ReturnType<typeof createMockDb>

  beforeEach(async () => {
    mockDb = createMockDb()

    const module = await Test.createTestingModule({
      providers: [
        IcInvoiceNumberAllocator,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
      ],
    }).compile()

    allocator = module.get(IcInvoiceNumberAllocator)
  })

  describe('basic sequential allocation', () => {
    it('allocates sequential numbers per IC per year, race-free', async () => {
      const a = await allocator.allocate('agency-1', 'user-1', 2026)
      const b = await allocator.allocate('agency-1', 'user-1', 2026)

      // userIdShort for 'user-1' stripped of hyphens = 'user1', first 8 chars = 'user1'
      // (non-UUID input: hyphens stripped → 'user1', slice(0,8) → 'user1')
      expect(a).toMatch(/^INV-2026-[0-9a-zA-Z]{1,8}-000001$/)
      expect(b).toMatch(/^INV-2026-[0-9a-zA-Z]{1,8}-000002$/)
    })

    it('formats the invoice number with zero-padded 6-digit sequence', async () => {
      const result = await allocator.allocate(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111',
        2026,
      )
      expect(result).toBe('INV-2026-11111111-000001')
    })

    it('uses first 8 hex chars of UUID (hyphens stripped) as userIdShort', async () => {
      const result = await allocator.allocate(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '123e4567-e89b-12d3-a456-426614174000',
        2026,
      )
      // '123e4567-e89b-12d3...' → strip hyphens → '123e4567e89b12d3...' → slice(0,8) → '123e4567'
      expect(result).toBe('INV-2026-123e4567-000001')
    })
  })

  describe('separate counters per IC', () => {
    it('maintains independent sequence per user ID', async () => {
      const uA = '11111111-1111-1111-1111-111111111111'
      const uB = '22222222-2222-2222-2222-222222222222'
      const agency = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

      const a1 = await allocator.allocate(agency, uA, 2026)
      const b1 = await allocator.allocate(agency, uB, 2026)
      const a2 = await allocator.allocate(agency, uA, 2026)

      expect(a1).toMatch(/-000001$/)
      expect(b1).toMatch(/-000001$/)
      expect(a2).toMatch(/-000002$/)

      // Ensure user ID shorts are different in the output
      expect(a1.split('-')[2]).toBe('11111111')
      expect(b1.split('-')[2]).toBe('22222222')
    })
  })

  describe('separate counters per tax year', () => {
    it('resets sequence for each tax year independently', async () => {
      const u = '33333333-3333-3333-3333-333333333333'
      const agency = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

      const x = await allocator.allocate(agency, u, 2025)
      const y = await allocator.allocate(agency, u, 2026)

      expect(x).toMatch(/^INV-2025-33333333-000001$/)
      expect(y).toMatch(/^INV-2026-33333333-000001$/)
    })

    it('increments independently per year even when interleaved', async () => {
      const u = '33333333-3333-3333-3333-333333333333'
      const agency = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

      await allocator.allocate(agency, u, 2025)
      await allocator.allocate(agency, u, 2026)
      await allocator.allocate(agency, u, 2025)

      const third2025 = await allocator.allocate(agency, u, 2025)
      const second2026 = await allocator.allocate(agency, u, 2026)

      expect(third2025).toMatch(/-000003$/)
      expect(second2026).toMatch(/-000002$/)
    })
  })

  describe('concurrent allocations', () => {
    /**
     * Concurrency test — unit mock limitation noted above.
     *
     * This test fires 50 parallel calls and asserts:
     *   1. No duplicate sequence numbers are produced.
     *   2. No sequence numbers are skipped (exactly 1–50 present).
     *   3. All invoice numbers parse correctly.
     *
     * CAVEAT: Because the mock runs in a single JS event loop, JavaScript's
     * cooperative threading means the mock's Map.get/set is not truly concurrent.
     * This test verifies SERVICE-LAYER correctness (no dropped promises, correct
     * formatting of each response), NOT the atomic SQL upsert semantics.
     * Real DB-level race-freeness is proven only by the SQL itself (see service
     * file JSDoc) and should be validated with an integration test against a live
     * Postgres when the integration test infrastructure is available.
     */
    it('runs concurrent allocations without skipping or duplicating (unit-mock level)', async () => {
      const u = '44444444-4444-4444-4444-444444444444'
      const agency = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

      const promises = Array.from({ length: 50 }, () =>
        allocator.allocate(agency, u, 2026),
      )
      const results = await Promise.all(promises)

      // All results should be valid invoice numbers
      for (const r of results) {
        expect(r).toMatch(/^INV-2026-44444444-\d{6}$/)
      }

      // Extract and sort sequence numbers — should be exactly 1..50 with no gaps or dups
      const seqs = results
        .map((r) => parseInt(r.split('-').pop()!, 10))
        .sort((a, b) => a - b)

      expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 1))
    })
  })
})
