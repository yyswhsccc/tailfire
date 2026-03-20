/**
 * Contact Share Requests Service
 *
 * Handles the workflow for agents to request access to contacts owned by other agents.
 * Owners (or admins) can approve or deny requests.
 */

import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, desc, gt, lt } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { ContactSharesService } from './contact-shares.service'
import { ContactAccessService } from './contact-access.service'
import type { AuthContext } from '../auth/auth.types'

@Injectable()
export class ContactShareRequestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly contactSharesService: ContactSharesService,
    private readonly contactAccessService: ContactAccessService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new access request for a contact
   */
  async createRequest(contactId: string, auth: AuthContext) {
    // Verify contact exists and is in same agency
    const contact = await this.db.client.query.contacts.findFirst({
      where: and(
        eq(this.db.schema.contacts.id, contactId),
        eq(this.db.schema.contacts.agencyId, auth.agencyId),
      ),
    })
    if (!contact) throw new NotFoundException('Contact not found')
    if (!contact.ownerId) throw new BadRequestException('Cannot request access to agency-wide contacts')
    if (contact.ownerId === auth.userId) throw new BadRequestException('You already own this contact')

    // Check if already shared with full access
    const accessResult = await this.contactAccessService.canAccessSensitiveData(contactId, auth)
    if (accessResult.canAccessSensitive) {
      throw new BadRequestException('You already have full access to this contact')
    }

    // Expire stale pending requests (>30 days) before checking for duplicates.
    // Without this, the partial unique index on (contactId, requesterId) WHERE status='pending'
    // would block new requests even though the old one is logically expired.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await this.db.client
      .update(this.db.schema.contactShareRequests)
      .set({ status: 'expired' })
      .where(
        and(
          eq(this.db.schema.contactShareRequests.contactId, contactId),
          eq(this.db.schema.contactShareRequests.requesterId, auth.userId),
          eq(this.db.schema.contactShareRequests.status, 'pending'),
          lt(this.db.schema.contactShareRequests.createdAt, thirtyDaysAgo),
        ),
      )

    // Check for existing active pending request
    const existing = await this.db.client.query.contactShareRequests.findFirst({
      where: and(
        eq(this.db.schema.contactShareRequests.contactId, contactId),
        eq(this.db.schema.contactShareRequests.requesterId, auth.userId),
        eq(this.db.schema.contactShareRequests.status, 'pending'),
      ),
    })
    if (existing) throw new BadRequestException('You already have a pending request for this contact')

    const [request] = await this.db.client
      .insert(this.db.schema.contactShareRequests)
      .values({
        contactId,
        requesterId: auth.userId,
        ownerId: contact.ownerId,
        agencyId: auth.agencyId,
        status: 'pending',
      })
      .returning()

    // Get requester name for notification payload
    const requester = await this.db.client.query.userProfiles.findFirst({
      where: eq(this.db.schema.userProfiles.id, auth.userId),
      columns: { firstName: true, lastName: true },
    })
    const requesterName = [requester?.firstName, requester?.lastName].filter(Boolean).join(' ') || 'Unknown'
    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'

    this.eventEmitter.emit('contact.share_requested', {
      requestId: request!.id,
      contactId,
      contactName,
      ownerId: contact.ownerId,
      requesterId: auth.userId,
      requesterName,
      agencyId: auth.agencyId,
    })

    this.eventEmitter.emit('security.share_requested', {
      event: 'security.share_requested',
      userId: contact.ownerId,
      actorId: auth.userId,
      agencyId: auth.agencyId,
      metadata: { requestId: request!.id, contactId },
    })

    return request
  }

  /**
   * Get pending share requests for contacts owned by the current user
   */
  async getPendingForOwner(auth: AuthContext) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    return this.db.client.query.contactShareRequests.findMany({
      where: and(
        eq(this.db.schema.contactShareRequests.ownerId, auth.userId),
        eq(this.db.schema.contactShareRequests.status, 'pending'),
        eq(this.db.schema.contactShareRequests.agencyId, auth.agencyId),
        gt(this.db.schema.contactShareRequests.createdAt, thirtyDaysAgo),
      ),
      orderBy: [desc(this.db.schema.contactShareRequests.createdAt)],
    })
  }

  /**
   * Approve or deny a pending share request
   */
  async resolve(
    requestId: string,
    status: 'approved' | 'denied',
    reason: string | undefined,
    auth: AuthContext,
  ) {
    const request = await this.db.client.query.contactShareRequests.findFirst({
      where: and(
        eq(this.db.schema.contactShareRequests.id, requestId),
        eq(this.db.schema.contactShareRequests.agencyId, auth.agencyId),
      ),
    })
    if (!request) throw new NotFoundException('Share request not found')
    if (request.status !== 'pending') throw new BadRequestException('Request already resolved')

    // Only contact owner or admin can resolve
    if (auth.role !== 'admin' && request.ownerId !== auth.userId) {
      throw new ForbiddenException('Only the contact owner or an admin can resolve share requests')
    }

    // Update request status
    await this.db.client
      .update(this.db.schema.contactShareRequests)
      .set({
        status,
        reason: reason ?? null,
        resolvedAt: new Date(),
        resolvedBy: auth.userId,
      })
      .where(eq(this.db.schema.contactShareRequests.id, requestId))

    if (status === 'approved') {
      // Create the actual share via existing ContactSharesService
      await this.contactSharesService.create(
        request.contactId,
        {
          sharedWithUserId: request.requesterId,
          accessLevel: 'full',
        },
        auth,
      )

      this.eventEmitter.emit('contact.share_approved', {
        requestId,
        contactId: request.contactId,
        requesterId: request.requesterId,
        ownerId: request.ownerId,
        agencyId: auth.agencyId,
      })

      this.eventEmitter.emit('security.share_approved', {
        event: 'security.share_approved',
        userId: request.requesterId,
        actorId: auth.userId,
        agencyId: auth.agencyId,
        metadata: { requestId },
      })
    } else {
      this.eventEmitter.emit('contact.share_denied', {
        requestId,
        contactId: request.contactId,
        requesterId: request.requesterId,
        ownerId: request.ownerId,
        reason,
        agencyId: auth.agencyId,
      })

      this.eventEmitter.emit('security.share_denied', {
        event: 'security.share_denied',
        userId: request.requesterId,
        actorId: auth.userId,
        agencyId: auth.agencyId,
        metadata: { requestId, reason },
      })
    }

    return { status }
  }
}
