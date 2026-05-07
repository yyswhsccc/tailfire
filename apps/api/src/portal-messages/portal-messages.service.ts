import { Injectable, ForbiddenException } from '@nestjs/common'
import { eq, and, desc, isNull, inArray, sql } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'

@Injectable()
export class PortalMessagesService {
  constructor(private readonly db: DatabaseService) {}

  /** Get all messages for a contact (portal consumer view), optionally scoped to a trip */
  async getMessagesForContact(contactId: string, tripId?: string) {
    const { portalMessages } = this.db.schema

    const conditions = [eq(portalMessages.contactId, contactId)]
    if (tripId) conditions.push(eq(portalMessages.tripId, tripId))

    return this.db.client
      .select()
      .from(portalMessages)
      .where(and(...conditions))
      .orderBy(desc(portalMessages.createdAt))
      .limit(100)
  }

  /** Send a message from a consumer, with optional tripId ownership validation */
  async sendFromConsumer(
    contactId: string,
    contactName: string,
    dto: { body: string; tripId?: string },
  ) {
    const { portalMessages } = this.db.schema

    // Validate tripId ownership before inserting (Issue 3)
    if (dto.tripId) {
      await this.assertTripAccess(contactId, dto.tripId)
    }

    const [msg] = await this.db.client
      .insert(portalMessages)
      .values({
        contactId,
        tripId: dto.tripId ?? null,
        senderType: 'consumer',
        senderId: contactId,
        senderName: contactName,
        body: dto.body,
      })
      .returning()

    return msg
  }

  /** Send a message from an agent */
  async sendFromAgent(
    contactId: string,
    agentId: string,
    agentName: string,
    dto: { body: string; tripId?: string },
  ) {
    const { portalMessages } = this.db.schema

    const [msg] = await this.db.client
      .insert(portalMessages)
      .values({
        contactId,
        tripId: dto.tripId ?? null,
        senderType: 'agent',
        senderId: agentId,
        senderName: agentName,
        body: dto.body,
      })
      .returning()

    return msg
  }

  /**
   * Mark only a specific list of message IDs as read (Issue 4).
   * Only marks the exact messages returned in the current fetch.
   */
  async markAsReadByIds(ids: string[]) {
    if (ids.length === 0) return
    const { portalMessages } = this.db.schema
    await this.db.client
      .update(portalMessages)
      .set({ readAt: new Date() })
      .where(inArray(portalMessages.id, ids))
  }

  /** Get count of unread agent messages for a contact using count(*) (Issue 5) */
  async getUnreadCount(contactId: string): Promise<number> {
    const { portalMessages } = this.db.schema

    const result = await this.db.client
      .select({ count: sql<number>`count(*)` })
      .from(portalMessages)
      .where(
        and(
          eq(portalMessages.contactId, contactId),
          eq(portalMessages.senderType, 'agent'),
          isNull(portalMessages.readAt),
        ),
      )

    return Number(result[0]?.count ?? 0)
  }

  /** Get all messages for a contact — admin agent view */
  async getMessagesForAdmin(contactId: string) {
    return this.getMessagesForContact(contactId)
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Assert that the given contact has access to a trip.
   * Checks trip_travelers first, then primary contact. Throws ForbiddenException if neither matches.
   */
  private async assertTripAccess(contactId: string, tripId: string): Promise<void> {
    const { tripTravelers, trips } = this.db.schema

    // Check via trip_travelers join table
    const [traveler] = await this.db.client
      .select({ tripId: tripTravelers.tripId })
      .from(tripTravelers)
      .where(and(eq(tripTravelers.tripId, tripId), eq(tripTravelers.contactId, contactId)))
      .limit(1)

    if (traveler) return

    // Check via primaryContactId
    const [primaryTrip] = await this.db.client
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.id, tripId), eq(trips.primaryContactId, contactId)))
      .limit(1)

    if (primaryTrip) return

    throw new ForbiddenException('No access to this trip')
  }
}
