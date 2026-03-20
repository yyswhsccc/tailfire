import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { DatabaseService } from '../db/database.service'
import type { SecurityAuditEvent } from './security-audit.types'

@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name)

  constructor(private readonly db: DatabaseService) {}

  @OnEvent('security.*')
  async handleSecurityEvent(event: SecurityAuditEvent): Promise<void> {
    try {
      await this.db.client.insert(this.db.schema.securityAuditLogs).values({
        event: event.event,
        userId: event.userId ?? null,
        actorId: event.actorId ?? null,
        agencyId: event.agencyId ?? null,
        metadata: event.metadata ?? {},
      })
    } catch (error) {
      this.logger.error(`Failed to log security event: ${event.event}`, error)
    }
  }
}
