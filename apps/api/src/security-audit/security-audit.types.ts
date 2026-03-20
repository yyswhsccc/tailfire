export interface SecurityAuditEvent {
  event: string
  userId?: string | null
  actorId?: string | null
  agencyId?: string | null
  metadata?: Record<string, unknown>
}
