/**
 * Change Detector Service Tests
 *
 * Tests:
 * - Correct bucketing: insert / update / unchanged / deactivate
 * - Edge cases: empty incoming, empty existing
 * - computeHash: deterministic SHA256 hex output
 */

import { Test, TestingModule } from '@nestjs/testing'
import { ChangeDetectorService } from '../change-detector.service'

interface TestItem {
  key: string
  value: string
}

describe('ChangeDetectorService', () => {
  let service: ChangeDetectorService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChangeDetectorService],
    }).compile()

    service = module.get<ChangeDetectorService>(ChangeDetectorService)
  })

  // ============================================================================
  // computeHash
  // ============================================================================

  describe('computeHash', () => {
    it('should return a 64-character hex string', () => {
      const hash = service.computeHash({ foo: 'bar' })
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce the same hash for identical data', () => {
      const data = { a: 1, b: 'hello' }
      expect(service.computeHash(data)).toBe(service.computeHash(data))
    })

    it('should produce different hashes for different data', () => {
      const hash1 = service.computeHash({ a: 1 })
      const hash2 = service.computeHash({ a: 2 })
      expect(hash1).not.toBe(hash2)
    })
  })

  // ============================================================================
  // detectChanges — main scenario
  // ============================================================================

  describe('detectChanges', () => {
    /**
     * Scenario:
     *   Existing: A (unchanged hash), B (will change hash), C (missing from feed)
     *   Incoming: A (same hash), B (new hash), D (new record)
     *
     *   Expected:
     *     toInsert    = [D]
     *     toUpdate    = [{ item: B-new, existingId: B's id }]
     *     unchanged   = [A's id]
     *     toDeactivate = [C's id]
     */
    it('should correctly bucket insert / update / unchanged / deactivate', () => {
      const hashA = service.computeHash({ key: 'A', value: 'original-a' })
      const hashB_old = service.computeHash({ key: 'B', value: 'original-b' })

      const existing = new Map([
        ['A', { id: 'id-A', contentHash: hashA }],
        ['B', { id: 'id-B', contentHash: hashB_old }],
        ['C', { id: 'id-C', contentHash: service.computeHash({ key: 'C', value: 'original-c' }) }],
      ])

      const incomingA: TestItem = { key: 'A', value: 'original-a' }
      const incomingB: TestItem = { key: 'B', value: 'changed-b' }
      const incomingD: TestItem = { key: 'D', value: 'new-d' }

      const incoming: TestItem[] = [incomingA, incomingB, incomingD]

      const keyFn = (item: TestItem) => item.key
      const hashFn = (item: TestItem) => service.computeHash({ key: item.key, value: item.value })

      const result = service.detectChanges(incoming, existing, hashFn, keyFn)

      // D is new
      expect(result.toInsert).toHaveLength(1)
      expect(result.toInsert[0]).toEqual(incomingD)

      // B hash changed
      expect(result.toUpdate).toHaveLength(1)
      const updateEntry = result.toUpdate[0]
      expect(updateEntry).toBeDefined()
      expect(updateEntry!.item).toEqual(incomingB)
      expect(updateEntry!.existingId).toBe('id-B')

      // A is identical
      expect(result.unchanged).toHaveLength(1)
      expect(result.unchanged[0]).toBe('id-A')

      // C is missing from feed
      expect(result.toDeactivate).toHaveLength(1)
      expect(result.toDeactivate[0]).toBe('id-C')
    })

    // ============================================================================
    // Edge cases
    // ============================================================================

    it('should deactivate all existing records when incoming is empty', () => {
      const existing = new Map([
        ['A', { id: 'id-A', contentHash: 'hash-a' }],
        ['B', { id: 'id-B', contentHash: 'hash-b' }],
      ])

      const result = service.detectChanges([], existing, () => '', () => '')

      expect(result.toInsert).toHaveLength(0)
      expect(result.toUpdate).toHaveLength(0)
      expect(result.unchanged).toHaveLength(0)
      expect(result.toDeactivate).toHaveLength(2)
      expect(result.toDeactivate).toContain('id-A')
      expect(result.toDeactivate).toContain('id-B')
    })

    it('should insert all records when existing map is empty', () => {
      const incoming: TestItem[] = [
        { key: 'X', value: 'val-x' },
        { key: 'Y', value: 'val-y' },
      ]

      const result = service.detectChanges(
        incoming,
        new Map(),
        (item) => service.computeHash({ key: item.key, value: item.value }),
        (item) => item.key,
      )

      expect(result.toInsert).toHaveLength(2)
      expect(result.toUpdate).toHaveLength(0)
      expect(result.unchanged).toHaveLength(0)
      expect(result.toDeactivate).toHaveLength(0)
    })

    it('should return all empty arrays when incoming and existing are both empty', () => {
      const result = service.detectChanges([], new Map(), () => '', () => '')

      expect(result.toInsert).toHaveLength(0)
      expect(result.toUpdate).toHaveLength(0)
      expect(result.unchanged).toHaveLength(0)
      expect(result.toDeactivate).toHaveLength(0)
    })
  })
})
