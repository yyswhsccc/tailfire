/**
 * Audit Sanitizer
 *
 * Utility for sanitizing entity data before storing in audit logs.
 * Implements field whitelisting to:
 * 1. Prevent PII/sensitive data from being logged
 * 2. Keep metadata size reasonable
 * 3. Only log fields relevant for audit display
 */

/**
 * Whitelisted fields per entity type
 * Only these fields will be included in audit metadata
 */
const ALLOWED_FIELDS: Record<string, string[]> = {
  activity: [
    'name',
    'proposalStatus',
    'activityType',
    'startTime',
    'endTime',
    'startDate',
    'endDate',
    'bookingStatus',
    'bookingDate',
    'location',
    'description',
    'sequenceOrder',
  ],
  booking: [
    'name',
    'status',
    'paymentStatus',
    'confirmationNumber',
    'dateBooked',
    'supplierName',
    'pricingType',
    'currency',
  ],
  installment: [
    'amountCents',
    'dueDate',
    'paidDate',
    'status',
    'description',
    'sequenceOrder',
  ],
  activity_document: ['fileName', 'documentType', 'category', 'description'],
  contact_document: ['fileName', 'documentType'],
  booking_document: ['fileName', 'documentType', 'category', 'description'],
  activity_media: ['fileName', 'mediaType', 'isPrimary', 'caption', 'sequenceOrder'],
  trip_media: ['fileName', 'mediaType', 'isPrimary', 'caption', 'sequenceOrder'],
  trip: ['name', 'status', 'tripType', 'startDate', 'endDate'],
  trip_traveler: ['travelerType', 'role', 'isPrimaryTraveler'],
  itinerary: ['name', 'status', 'startDate', 'endDate', 'isSelected'],
  contact: [
    'firstName', 'lastName', 'displayName', 'preferredName', 'prefix',
    'email', 'phone',
    'contactType', 'contactStatus',
    'city', 'province', 'country',
    'tags',
  ],
  user: ['firstName', 'lastName', 'displayName', 'role'],
  trip_group: ['name', 'description', 'type', 'groupNumber', 'destination', 'startDate', 'endDate', 'status'],
  contact_loyalty_program: ['programName', 'providerName', 'membershipNumber', 'tierLevel', 'loyaltyProgramId'],
  loyalty_program: ['providerName', 'programName', 'programType', 'isActive'],
  activity_traveler: ['contactLoyaltyProgramId'],
}

/**
 * Fields that should never be logged, even if accidentally whitelisted
 * These take precedence over ALLOWED_FIELDS
 */
const BLOCKED_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'secretKey',
  'privateKey',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
  'socialSecurityNumber',
  'content',
  'blob',
  'base64',
  'encryptedData',
  'bankAccount',
  'routingNumber',
]

/**
 * Maximum size for metadata JSON in bytes
 */
const MAX_METADATA_SIZE = 4096

/**
 * Sanitize entity data for audit logging
 *
 * @param entityType - The type of entity (must match ALLOWED_FIELDS keys)
 * @param data - The raw entity data to sanitize
 * @returns Sanitized data containing only whitelisted, non-blocked fields
 */
export function sanitizeForAudit(
  entityType: string,
  data: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!data) return {}

  const allowed = ALLOWED_FIELDS[entityType] || []
  const result: Record<string, unknown> = {}

  for (const key of allowed) {
    // Skip if field doesn't exist in data
    if (!(key in data)) continue

    // Skip blocked fields (case-insensitive check)
    if (BLOCKED_FIELDS.some((blocked) => key.toLowerCase().includes(blocked.toLowerCase()))) {
      continue
    }

    const value = data[key]

    // Skip null/undefined values to keep payload small
    if (value === null || value === undefined) continue

    // Skip empty strings
    if (typeof value === 'string' && value.trim() === '') continue

    result[key] = value
  }

  // Check size and truncate if necessary
  const json = JSON.stringify(result)
  if (json.length > MAX_METADATA_SIZE) {
    return {
      _truncated: true,
      changedFields: Object.keys(result),
      _message: `Metadata exceeded ${MAX_METADATA_SIZE} bytes and was truncated`,
    }
  }

  return result
}

/**
 * Compute the diff between before and after states
 *
 * @param entityType - The type of entity
 * @param before - State before the change
 * @param after - State after the change
 * @returns Object with sanitized before, after, and list of changed fields
 */
export function computeAuditDiff(
  entityType: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): {
  before: Record<string, unknown>
  after: Record<string, unknown>
  changedFields: string[]
} {
  const sanitizedBefore = sanitizeForAudit(entityType, before)
  const sanitizedAfter = sanitizeForAudit(entityType, after)

  // Find fields that actually changed
  const allFields = new Set([...Object.keys(sanitizedBefore), ...Object.keys(sanitizedAfter)])
  const changedFields: string[] = []

  for (const field of allFields) {
    const beforeVal = sanitizedBefore[field]
    const afterVal = sanitizedAfter[field]

    // Simple comparison (works for primitives, dates as strings, etc.)
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changedFields.push(field)
    }
  }

  return {
    before: sanitizedBefore,
    after: sanitizedAfter,
    changedFields,
  }
}

/**
 * Get a human-readable description of an audit action
 *
 * @param action - The audit action
 * @param entityType - The entity type
 * @param displayName - Human-readable name of the entity
 * @returns Description string for the activity log
 */
export function buildAuditDescription(
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'moved_to_group' | 'removed_from_group',
  entityType: string,
  displayName: string
): string {
  const actionVerb: Record<string, string> = {
    created: 'Created',
    updated: 'Updated',
    deleted: 'Deleted',
    status_changed: 'Changed status of',
    moved_to_group: 'Moved to group',
    removed_from_group: 'Removed from group',
  }

  // Format entity type for display (e.g., 'activity_document' -> 'activity document')
  const formattedType = entityType.replace(/_/g, ' ')

  // Special formatting for group move actions — description reads better without entity type
  if (action === 'moved_to_group' || action === 'removed_from_group') {
    return `${actionVerb[action]} — ${displayName}`
  }

  return `${actionVerb[action] || 'Modified'} ${formattedType}: ${displayName}`
}
