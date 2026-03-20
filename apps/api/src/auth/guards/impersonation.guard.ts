import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { DatabaseService } from '../../db/database.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { BYPASS_IMPERSONATION_KEY } from '../decorators/bypass-impersonation.decorator'
import type { AuthContext } from '../auth.types'

@Injectable()
export class ImpersonationGuard implements CanActivate {
  private readonly logger = new Logger(ImpersonationGuard.name)
  private tableExists: boolean | null = null

  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Check if impersonation_sessions table exists.
   * Cached after first check to avoid repeated queries.
   * Handles deploy race conditions where code deploys before migrations run.
   */
  private async ensureTableExists(): Promise<boolean> {
    if (this.tableExists === true) return true
    try {
      await this.db.client.execute({ sql: `SELECT 1 FROM impersonation_sessions LIMIT 0`, params: [] } as any)
      this.tableExists = true
      return true
    } catch {
      this.logger.warn('impersonation_sessions table not found — skipping impersonation checks')
      return false
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip for public endpoints
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest()
    const user = request.user as AuthContext
    const impersonateUserId = request.headers['x-impersonate-user-id']

    // Check bypass decorator (needed for both branches)
    const bypass = this.reflector.getAllAndOverride<boolean>(BYPASS_IMPERSONATION_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // No impersonation header — but check for active session lock
    // If admin has an active session, block non-bypass endpoints even without the header
    // This prevents admins from bypassing impersonation by omitting the header
    if (!impersonateUserId) {
      if (user?.role === 'admin' && !bypass) {
        if (!(await this.ensureTableExists())) return true
        const activeSession = await this.db.client.query.impersonationSessions.findFirst({
          where: and(
            eq(this.db.schema.impersonationSessions.adminUserId, user.userId),
            isNull(this.db.schema.impersonationSessions.endedAt),
            gt(this.db.schema.impersonationSessions.expiresAt, new Date()),
          ),
        })
        if (activeSession) {
          throw new UnauthorizedException(
            'Active impersonation session exists. Include X-Impersonate-User-Id header or end the session.',
          )
        }
      }
      return true
    }

    // Header present + bypass decorator — skip (for impersonation control endpoints)
    if (bypass) return true

    // Header present — validate impersonation
    if (!user || user.role !== 'admin') {
      throw new UnauthorizedException('Only admins can impersonate')
    }

    // Find active session
    if (!(await this.ensureTableExists())) {
      throw new UnauthorizedException('Impersonation not available — table not yet migrated')
    }
    const session = await this.db.client.query.impersonationSessions.findFirst({
      where: and(
        eq(this.db.schema.impersonationSessions.adminUserId, user.userId),
        eq(this.db.schema.impersonationSessions.targetUserId, impersonateUserId),
        isNull(this.db.schema.impersonationSessions.endedAt),
        gt(this.db.schema.impersonationSessions.expiresAt, new Date()),
      ),
    })

    if (!session) {
      throw new UnauthorizedException('No active impersonation session')
    }

    // Verify same agency
    if (session.agencyId !== user.agencyId) {
      throw new UnauthorizedException('Cannot impersonate users in different agencies')
    }

    // Load target user
    const targetUser = await this.db.client.query.userProfiles.findFirst({
      where: eq(this.db.schema.userProfiles.id, impersonateUserId),
    })

    if (!targetUser) {
      throw new UnauthorizedException('Target user not found')
    }

    // Store original admin context
    // NOTE: AuthContext only has userId, email, agencyId, role, userStatus — no name fields.
    // Admin name is resolved downstream from userProfiles if needed (e.g., in audit logging).
    request.originalAdmin = {
      id: user.userId,
      role: user.role,
    }

    // Build FULL impersonated AuthContext from target user
    // IMPORTANT: Do NOT spread admin's context — email, userStatus must come from target
    // so that downstream guards (ActiveUserGuard, UserStatusGuard) check the target's status
    request.user = {
      userId: targetUser.id,
      email: targetUser.email,
      agencyId: user.agencyId, // Same agency (already verified)
      role: targetUser.role,
      userStatus: targetUser.status,
    } as AuthContext

    return true
  }
}
