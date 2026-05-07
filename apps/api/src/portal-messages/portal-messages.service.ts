import { Injectable } from '@nestjs/common'
import { eq, and, desc, isNull } from 'drizzle-orm'
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

  /** Send a message from a consumer */
  async sendFromConsumer(contactId: string, contactName: string, dto: { body: string; tripId?: string }) {
    const { portalMessages } = this.db.schema

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

  /** Send a message from an agent (admin-facing, future use) */
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

  /** Mark all unread agent messages as read for a contact (consumer opens inbox) */
  async markAsRead(contactId: string) {
    const { portalMessages } = this.db.schema

    await this.db.client
      .update(portalMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(portalMessages.contactId, contactId),
          eq(portalMessages.senderType, 'agent'),
          isNull(portalMessages.readAt),
        ),
      )
  }

  /** Get count of unread agent messages for a contact */
  async getUnreadCount(contactId: string): Promise<number> {
    const { portalMessages } = this.db.schema

    const result = await this.db.client
      .select()
      .from(portalMessages)
      .where(
        and(
          eq(portalMessages.contactId, contactId),
          eq(portalMessages.senderType, 'agent'),
          isNull(portalMessages.readAt),
        ),
      )

    return result.length
  }

  /** Get all messages for a contact — admin agent view */
  async getMessagesForAdmin(contactId: string) {
    return this.getMessagesForContact(contactId)
  }
}
