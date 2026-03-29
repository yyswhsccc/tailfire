/**
 * Change Detector Service
 *
 * Computes SHA256 content hashes and categorizes incoming records into
 * insert / update / unchanged / deactivate buckets for efficient catalog sync.
 */

import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'

@Injectable()
export class ChangeDetectorService {
  /**
   * Compute a SHA256 hex digest of the given data object.
   * The object is first serialized with JSON.stringify for determinism.
   */
  computeHash(data: Record<string, unknown>): string {
    const stringified = JSON.stringify(data)
    return createHash('sha256').update(stringified).digest('hex')
  }

  /**
   * Diff incoming records against existing DB records and categorize them.
   *
   * @param incoming  - Full list of records from the upstream feed
   * @param existing  - Map keyed by provider key → { id, contentHash }
   * @param hashFn    - Derives the content hash for an incoming item
   * @param keyFn     - Derives the lookup key for an incoming item
   *
   * @returns
   *   toInsert    - Items not present in existing (new records)
   *   toUpdate    - Items whose hash changed ({ item, existingId })
   *   unchanged   - IDs of records whose hash is identical (skip)
   *   toDeactivate - IDs of existing records absent from incoming feed
   */
  detectChanges<T>(
    incoming: T[],
    existing: Map<string, { id: string; contentHash: string }>,
    hashFn: (item: T) => string,
    keyFn: (item: T) => string,
  ): {
    toInsert: T[]
    toUpdate: { item: T; existingId: string }[]
    unchanged: string[]
    toDeactivate: string[]
  } {
    const toInsert: T[] = []
    const toUpdate: { item: T; existingId: string }[] = []
    const unchanged: string[] = []

    // Track which existing keys are still present in the feed
    const seenKeys = new Set<string>()

    for (const item of incoming) {
      const key = keyFn(item)
      const hash = hashFn(item)
      seenKeys.add(key)

      const existingRecord = existing.get(key)

      if (!existingRecord) {
        // Net-new record — needs to be inserted
        toInsert.push(item)
      } else if (existingRecord.contentHash === hash) {
        // Identical content — nothing to do
        unchanged.push(existingRecord.id)
      } else {
        // Content changed — needs to be updated
        toUpdate.push({ item, existingId: existingRecord.id })
      }
    }

    // Any existing key not seen in the incoming feed should be deactivated
    const toDeactivate: string[] = []
    for (const [key, record] of existing.entries()) {
      if (!seenKeys.has(key)) {
        toDeactivate.push(record.id)
      }
    }

    return { toInsert, toUpdate, unchanged, toDeactivate }
  }
}
