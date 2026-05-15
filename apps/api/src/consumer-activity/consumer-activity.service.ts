import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { and, eq, desc } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { TrackEventDto } from './dto/track-event.dto'

@Injectable()
export class ConsumerActivityService {
  private readonly logger = new Logger(ConsumerActivityService.name)

  constructor(private readonly db: DatabaseService) {}

  /**
   * Verify the contact belongs to the actor's agency.
   * Throws ForbiddenException if not — does not distinguish missing from cross-agency
   * to avoid leaking contact existence across agencies.
   */
  private async assertContactInAgency(contactId: string, agencyId: string): Promise<void> {
    const { contacts } = this.db.schema

    const rows = await this.db.client
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.agencyId, agencyId)))
      .limit(1)

    if (rows.length === 0) {
      throw new ForbiddenException('Contact not accessible from this agency')
    }
  }

  /**
   * Record a consumer activity event.
   * Events are keyed by sessionId. contactId is backfilled on registration.
   */
  async trackEvent(dto: TrackEventDto) {
    const { consumerActivity } = this.db.schema

    await this.db.client.insert(consumerActivity).values({
      sessionId: dto.sessionId,
      event: dto.event,
      entityType: dto.entityType || null,
      entitySlug: dto.entitySlug || null,
      entityName: dto.entityName || null,
      searchQuery: dto.searchQuery || null,
      metadata: dto.metadata || null,
    })
  }

  /**
   * Backfill contactId on all activity for a session.
   * Called during consumer registration.
   */
  async backfillContact(sessionId: string, contactId: string) {
    const { consumerActivity } = this.db.schema

    const result = await this.db.client
      .update(consumerActivity)
      .set({ contactId })
      .where(eq(consumerActivity.sessionId, sessionId))

    this.logger.log(`Backfilled ${sessionId} activity with contactId ${contactId}`)
    return result
  }

  /**
   * Get activity for a contact (for the admin contact profile).
   * Returns the most recent events, grouped by entity for signal generation.
   * Verifies the contact belongs to the actor's agency before reading.
   */
  async getActivityForContact(contactId: string, agencyId: string, limit = 50) {
    await this.assertContactInAgency(contactId, agencyId)

    const { consumerActivity } = this.db.schema

    const events = await this.db.client
      .select()
      .from(consumerActivity)
      .where(eq(consumerActivity.contactId, contactId))
      .orderBy(desc(consumerActivity.createdAt))
      .limit(limit)

    return events
  }

  /**
   * Get insights (AI summaries + purchase signals) for a contact.
   * Verifies the contact belongs to the actor's agency before reading.
   */
  async getInsightsForContact(contactId: string, agencyId: string) {
    await this.assertContactInAgency(contactId, agencyId)

    const { consumerInsights } = this.db.schema

    return this.db.client
      .select()
      .from(consumerInsights)
      .where(eq(consumerInsights.contactId, contactId))
      .orderBy(desc(consumerInsights.createdAt))
      .limit(20)
  }

  /**
   * Generate purchase signals from browsing activity.
   * Returns aggregated signals like "Viewed Caribbean 5 times", "Searched cruises 3 times".
   * Agency check happens inside getActivityForContact.
   */
  async generateSignals(contactId: string, agencyId: string) {
    const events = await this.getActivityForContact(contactId, agencyId, 200)

    // Aggregate page views by entity
    const entityCounts = new Map<string, { name: string; type: string; count: number }>()
    const searchCounts = new Map<string, number>()

    for (const e of events) {
      if (e.event === 'page_view' && e.entitySlug) {
        const key = `${e.entityType}:${e.entitySlug}`
        const existing = entityCounts.get(key)
        if (existing) {
          existing.count++
        } else {
          entityCounts.set(key, { name: e.entityName || e.entitySlug, type: e.entityType || 'unknown', count: 1 })
        }
      }
      if (e.event === 'search' && e.entityType) {
        const key = e.entityType
        searchCounts.set(key, (searchCounts.get(key) || 0) + 1)
      }
    }

    // Build signals
    const signals: Array<{ label: string; strength: 'high' | 'medium' | 'low' }> = []

    for (const [, entity] of entityCounts) {
      if (entity.count >= 3) {
        signals.push({ label: `Viewed ${entity.name} ${entity.count} times`, strength: 'high' })
      } else if (entity.count >= 2) {
        signals.push({ label: `Interested in ${entity.name}`, strength: 'medium' })
      }
    }

    for (const [type, count] of searchCounts) {
      if (count >= 3) {
        signals.push({ label: `Searched ${type} ${count} times`, strength: 'high' })
      } else if (count >= 1) {
        signals.push({ label: `Explored ${type} options`, strength: 'low' })
      }
    }

    return signals.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.strength] - order[b.strength]
    })
  }
}
