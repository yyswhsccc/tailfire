import { Controller, Get, Post, Body, Query, UseGuards, NotFoundException } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { eq } from 'drizzle-orm'
import { Public } from '../auth/decorators/public.decorator'
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard'
import { GetPortalAuth } from '../auth/decorators/portal-auth-context.decorator'
import type { PortalAuthContext } from '../auth/auth.types'
import { DatabaseService } from '../db/database.service'
import { PortalMessagesService } from './portal-messages.service'
import { SendMessageDto } from './dto/send-message.dto'

@ApiTags('Portal Messages')
@Controller()
@Public()
@UseGuards(PortalAuthGuard)
export class PortalMessagesController {
  constructor(
    private readonly service: PortalMessagesService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * GET /portal/my-messages
   * Returns messages for the authenticated consumer, optionally filtered by tripId.
   * Marks all unread agent messages as read on open.
   */
  @Get('portal/my-messages')
  @ApiOperation({ summary: 'Get messages for authenticated consumer' })
  async getMyMessages(
    @GetPortalAuth() auth: PortalAuthContext,
    @Query('tripId') tripId?: string,
  ) {
    const contactId = await this.resolveContactId(auth.userId)
    await this.service.markAsRead(contactId)
    return this.service.getMessagesForContact(contactId, tripId)
  }

  /**
   * POST /portal/my-messages
   * Sends a message from the authenticated consumer.
   */
  @Post('portal/my-messages')
  @ApiOperation({ summary: 'Send a message from consumer' })
  async sendMessage(
    @GetPortalAuth() auth: PortalAuthContext,
    @Body() dto: SendMessageDto,
  ) {
    const contact = await this.resolveContact(auth.userId)
    const displayName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Consumer'
    return this.service.sendFromConsumer(contact.id, displayName, dto)
  }

  /**
   * GET /portal/my-messages/unread
   * Returns the count of unread agent messages for the authenticated consumer.
   */
  @Get('portal/my-messages/unread')
  @ApiOperation({ summary: 'Get unread message count for authenticated consumer' })
  async getUnreadCount(@GetPortalAuth() auth: PortalAuthContext) {
    const contactId = await this.resolveContactId(auth.userId)
    const count = await this.service.getUnreadCount(contactId)
    return { count }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Resolve the contact row for this portal user */
  private async resolveContact(portalUserId: string) {
    const { contacts } = this.db.schema
    const [contact] = await this.db.client
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(eq(contacts.portalUserId, portalUserId))
      .limit(1)

    if (!contact) {
      throw new NotFoundException('Portal profile not found')
    }

    return contact
  }

  /** Resolve just the contact ID (used when name is not needed) */
  private async resolveContactId(portalUserId: string): Promise<string> {
    const contact = await this.resolveContact(portalUserId)
    return contact.id
  }
}
