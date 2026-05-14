import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import type { AuthContext } from '../auth/auth.types'

const SESSION_DURATION_MS = 30 * 60 * 1000 // 30 minutes
const MAX_TOTAL_DURATION_MS = 4 * 60 * 60 * 1000 // 4 hours

@Injectable()
export class ImpersonationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startSession(targetUserId: string, auth: AuthContext) {
    if (auth.role !== 'admin') throw new ForbiddenException('Admin access required')

    // Validate target user
    const targetUser = await this.db.client.query.userProfiles.findFirst({
      where: eq(this.db.schema.userProfiles.id, targetUserId),
    })
    if (!targetUser) throw new NotFoundException('User not found')
    if (targetUser.agencyId !== auth.agencyId) throw new ForbiddenException('Cannot impersonate users in different agencies')
    if (targetUser.role === 'admin') throw new ForbiddenException('Cannot impersonate other admins')
    if (targetUser.status === 'locked' || targetUser.status === 'pending') {
      throw new BadRequestException(`Cannot impersonate ${targetUser.status} users`)
    }

    // Check for existing active session
    const existing = await this.getActiveSession(auth.userId)
    if (existing) throw new BadRequestException('You already have an active impersonation session. End it first.')

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    const [session] = await this.db.client.insert(this.db.schema.impersonationSessions).values({
      adminUserId: auth.userId,
      targetUserId,
      agencyId: auth.agencyId,
      expiresAt,
    }).returning()

    this.eventEmitter.emit('security.impersonation_started', {
      event: 'security.impersonation_started',
      userId: targetUserId,
      actorId: auth.userId,
      agencyId: auth.agencyId,
      metadata: { sessionId: session!.id },
    })

    return {
      sessionId: session!.id,
      targetUserId,
      expiresAt,
    }
  }

  async extendSession(auth: AuthContext) {
    const session = await this.getActiveSession(auth.userId)
    if (!session) throw new NotFoundException('No active impersonation session')

    // Check max total duration
    const totalDuration = Date.now() - session.createdAt.getTime()
    if (totalDuration + SESSION_DURATION_MS > MAX_TOTAL_DURATION_MS) {
      throw new BadRequestException('Maximum session duration reached (4 hours)')
    }

    const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    await this.db.client.update(this.db.schema.impersonationSessions)
      .set({ expiresAt: newExpiresAt })
      .where(eq(this.db.schema.impersonationSessions.id, session.id))

    return { expiresAt: newExpiresAt }
  }

  async endSession(auth: AuthContext) {
    const session = await this.getActiveSession(auth.userId)
    if (!session) throw new NotFoundException('No active impersonation session')

    await this.db.client.update(this.db.schema.impersonationSessions)
      .set({ endedAt: new Date(), endReason: 'manual' })
      .where(eq(this.db.schema.impersonationSessions.id, session.id))

    const duration = Date.now() - session.createdAt.getTime()

    this.eventEmitter.emit('security.impersonation_ended', {
      event: 'security.impersonation_ended',
      userId: session.targetUserId,
      actorId: auth.userId,
      agencyId: auth.agencyId,
      metadata: {
        sessionId: session.id,
        durationMs: duration,
        reason: 'manual',
      },
    })

    // Notify the target agent
    this.eventEmitter.emit('impersonation.ended', {
      adminUserId: auth.userId,
      targetUserId: session.targetUserId,
      agencyId: auth.agencyId,
      sessionId: session.id,
      duration,
    })

    return { ended: true }
  }

  async getStatus(auth: AuthContext) {
    const session = await this.getActiveSession(auth.userId)
    if (!session) return { active: false }

    const targetUser = await this.db.client.query.userProfiles.findFirst({
      where: eq(this.db.schema.userProfiles.id, session.targetUserId),
      columns: { firstName: true, lastName: true, role: true, agencyId: true, email: true },
    })

    return {
      active: true,
      sessionId: session.id,
      targetUserId: session.targetUserId,
      targetName: [targetUser?.firstName, targetUser?.lastName].filter(Boolean).join(' '),
      // targetRole + targetAgencyId + targetEmail let the admin frontend swap
      // UI gating to the impersonated user's identity without forging a JWT.
      // The real admin's JWT still flows on every request as the Authorization
      // header — these fields are advisory for the client only.
      targetRole: targetUser?.role ?? null,
      targetAgencyId: targetUser?.agencyId ?? null,
      targetEmail: targetUser?.email ?? null,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    }
  }

  private async getActiveSession(adminUserId: string) {
    return this.db.client.query.impersonationSessions.findFirst({
      where: and(
        eq(this.db.schema.impersonationSessions.adminUserId, adminUserId),
        isNull(this.db.schema.impersonationSessions.endedAt),
        gt(this.db.schema.impersonationSessions.expiresAt, new Date()),
      ),
    })
  }
}
