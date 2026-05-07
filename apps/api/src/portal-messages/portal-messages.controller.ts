import { Controller, Get, Post, Body, Param, Query, UseGuards, NotFoundException, ForbiddenException } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { eq, and } from 'drizzle-orm'
import { Public } from '../auth/decorators/public.decorator'
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard'
import { GetPortalAuth } from '../auth/decorators/portal-auth-context.decorator'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { PortalAuthContext, AuthContext } from '../auth/auth.types'
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
   * Marks only the returned unread agent messages as read (Issue 4).
   * tripId is validated for ownership in sendMessage; filtered reads are safe — they
   * only expose messages already scoped to this contact.
   */
  @Get('portal/my-messages')
  @ApiOperation({ summary: 'Get messages for authenticated consumer' })
  async getMyMessages(
    @GetPortalAuth() auth: PortalAuthContext,
    @Query('tripId') tripId?: string,
  ) {
    const contactId = await this.resolveContactId(auth.userId)

    // Fetch first, then mark only what was returned (avoids over-marking messages from other trips)
    const messages = await this.service.getMessagesForContact(contactId, tripId)

    const unreadIds = messages
      .filter((m) => m.senderType === 'agent' && !m.readAt)
      .map((m) => m.id)

    if (unreadIds.length > 0) {
      await this.service.markAsReadByIds(unreadIds)
    }

    return messages
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

// ============================================================================
// Admin Controller — agent-side messaging (Issue 2)
// Uses standard JWT auth (global guard) — no @Public() decorator needed.
// ============================================================================

@ApiTags('Admin Portal Messages')
@Controller('admin/contacts/:contactId/messages')
export class AdminPortalMessagesController {
  constructor(
    private readonly service: PortalMessagesService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * GET /admin/contacts/:contactId/messages
   * Returns all portal messages for a contact (agent view).
   * Verifies contact belongs to the requesting agent's agency.
   */
  @Get()
  @ApiOperation({ summary: 'Get portal messages for a contact (agent view)' })
  async getMessagesForContact(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
  ) {
    await this.assertContactAccess(contactId, auth.agencyId)
    return this.service.getMessagesForAdmin(contactId)
  }

  /**
   * POST /admin/contacts/:contactId/messages
   * Sends a message from the authenticated agent to the contact's portal inbox.
   */
  @Post()
  @ApiOperation({ summary: 'Send a portal message from agent to contact' })
  async sendMessageAsAgent(
    @GetAuthContext() auth: AuthContext,
    @Param('contactId') contactId: string,
    @Body() dto: SendMessageDto,
  ) {
    await this.assertContactAccess(contactId, auth.agencyId)

    // Resolve agent display name from user_profiles
    const { userProfiles } = this.db.schema
    const [profile] = await this.db.client
      .select({
        firstName: userProfiles.firstName,
        lastName: userProfiles.lastName,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, auth.userId))
      .limit(1)

    const agentName = profile
      ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Travel Advisor'
      : 'Travel Advisor'

    return this.service.sendFromAgent(contactId, auth.userId, agentName, dto)
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Verify the contact belongs to the agent's agency. Throws ForbiddenException otherwise. */
  private async assertContactAccess(contactId: string, agencyId: string): Promise<void> {
    const { contacts } = this.db.schema
    const [contact] = await this.db.client
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.agencyId, agencyId)))
      .limit(1)

    if (!contact) {
      throw new ForbiddenException('Contact not found or access denied')
    }
  }
}
