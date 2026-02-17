/**
 * Generic Audit Event
 *
 * A unified event class for all entity audit logging.
 * Replaces the need for entity-specific event classes for new entity types.
 *
 * Usage:
 *   this.eventEmitter.emit('audit.created', new AuditEvent(
 *     'activity',
 *     activity.id,
 *     'created',
 *     tripId,
 *     actorId,
 *     `Hotel - ${activity.name}`,
 *     { subType: activity.activityType }
 *   ))
 */

/**
 * Metadata for audit events
 */
export interface AuditMetadata {
  /** State before the change (whitelisted fields only) */
  before?: Record<string, unknown>
  /** State after the change (whitelisted fields only) */
  after?: Record<string, unknown>
  /** List of field names that were changed */
  changedFields?: string[]
  /** Subtype of entity (e.g., activityType: 'hotel', 'tour') */
  subType?: string
  /** Parent entity ID (e.g., bookingId for installments) */
  parentId?: string
  /** Count for bulk operations */
  count?: number
  /** IDs involved in bulk operations */
  ids?: string[]
  /** Any additional context */
  [key: string]: unknown
}

/**
 * Audit actions that can be logged
 */
export type AuditAction = 'created' | 'updated' | 'deleted' | 'status_changed' | 'moved_to_group' | 'removed_from_group'

/**
 * Entity types that can be audited
 */
export type AuditEntityType =
  | 'trip'
  | 'trip_traveler'
  | 'itinerary'
  | 'contact'
  | 'user'
  | 'activity'
  | 'booking'
  | 'installment'
  | 'activity_document'
  | 'contact_document'
  | 'booking_document'
  | 'activity_media'
  | 'trip_media'
  | 'trip_group'
  | 'contact_loyalty_program'

/**
 * Generic audit event for all entity changes
 */
export class AuditEvent {
  constructor(
    /** The type of entity being audited */
    public readonly entityType: AuditEntityType,
    /** The ID of the entity */
    public readonly entityId: string,
    /** The action performed */
    public readonly action: AuditAction,
    /** The trip this entity belongs to (null for non-trip entities like contacts) */
    public readonly tripId: string | null,
    /** The user who performed the action (null for system actions) */
    public readonly actorId: string | null,
    /** Human-readable display name for the log entry */
    public readonly displayName: string,
    /** Optional metadata with before/after states, changed fields, etc. */
    public readonly metadata?: AuditMetadata
  ) {}
}
