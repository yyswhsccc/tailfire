import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'

/**
 * IcInvoiceNumberAllocator
 *
 * Produces sequential, race-free invoice numbers per IC per tax year.
 *
 * Format: INV-{taxYear}-{userIdShort8}-{seq:000000}
 *   - taxYear:       4-digit year (e.g. 2026)
 *   - userIdShort8:  first 8 hex characters of the user UUID (hyphens stripped)
 *   - seq:           zero-padded 6-digit sequence counter starting at 000001
 *
 * Example: INV-2026-11111111-000001
 *
 * Race-freeness guarantee:
 *   The atomic primitive is the single SQL statement:
 *     INSERT ... ON CONFLICT DO UPDATE SET next_seq = next_seq + 1 RETURNING next_seq
 *
 *   Under Postgres MVCC, an INSERT…ON CONFLICT…DO UPDATE is a single atomic
 *   operation. Concurrent callers will serialize at the row lock (the "DO UPDATE"
 *   implicitly takes a row-level lock on the existing row before incrementing),
 *   so each caller gets a distinct value. No application-level locking is needed.
 *
 *   The explicit transaction wrapper is intentional: it ensures the RETURNING value
 *   is consumed within the same connection context, consistent with how other
 *   services in this codebase structure upsert-then-read patterns.
 */
@Injectable()
export class IcInvoiceNumberAllocator {
  constructor(private readonly db: DatabaseService) {}

  async allocate(agencyId: string, userId: string, taxYear: number): Promise<string> {
    return await this.db.client.transaction(async (tx) => {
      const result = await tx.execute(sql`
        INSERT INTO ic_invoice_number_sequences (agency_id, user_id, tax_year, next_seq)
        VALUES (${agencyId}, ${userId}, ${taxYear}, 1)
        ON CONFLICT (agency_id, user_id, tax_year)
        DO UPDATE SET next_seq = ic_invoice_number_sequences.next_seq + 1
        RETURNING next_seq AS allocated
      `)
      const allocated = (result as any[])[0].allocated as number
      const userIdShort = userId.replace(/-/g, '').slice(0, 8)
      return `INV-${taxYear}-${userIdShort}-${String(allocated).padStart(6, '0')}`
    })
  }
}
