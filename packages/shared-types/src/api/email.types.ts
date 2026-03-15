/**
 * Email API Types
 *
 * TypeScript definitions for email sending and template management endpoints.
 * Shared between API (NestJS) and client (React/Next.js).
 */

// =============================================================================
// Enums / Constants
// =============================================================================

export type EmailStatus = 'pending' | 'sent' | 'failed' | 'filtered'

/**
 * Valid email category values - must match the database enum
 */
export const EMAIL_CATEGORY_VALUES = [
  'trip_order',
  'notification',
  'marketing',
  'system',
  'payment',
  'client_care',
] as const

export type EmailCategory = (typeof EMAIL_CATEGORY_VALUES)[number]

// =============================================================================
// Request DTOs
// =============================================================================

/**
 * Send Email Request DTO
 * Data required to send a single email
 */
export type SendEmailRequest = {
  to: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  // Context references for logging
  tripId?: string
  contactId?: string
  activityId?: string
}

/**
 * Send Templated Email Request DTO
 * Send an email using a template with variable substitution
 */
export type SendTemplatedEmailRequest = {
  templateSlug: string
  to: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
  // Context for variable resolution
  context: EmailContext
  // Optional variable overrides (takes precedence over context resolution)
  variables?: Record<string, string>
}

/**
 * Email Context for Variable Resolution
 * Provides IDs to resolve variables from database
 */
export type EmailContext = {
  tripId?: string
  contactId?: string
  activityId?: string
  agentId?: string
  // Direct variable overrides
  customVariables?: Record<string, string>
}

/**
 * Create Email Template Request DTO
 */
export type CreateEmailTemplateRequest = {
  slug: string
  name: string
  description?: string
  subject: string
  bodyHtml: string
  bodyText?: string
  variables?: EmailVariableDefinition[]
  category?: EmailCategory
  isActive?: boolean
}

/**
 * Update Email Template Request DTO
 */
export type UpdateEmailTemplateRequest = {
  name?: string
  description?: string
  subject?: string
  bodyHtml?: string
  bodyText?: string
  variables?: EmailVariableDefinition[]
  category?: EmailCategory
  isActive?: boolean
}

/**
 * Email Logs Filter DTO
 * Query parameters for listing email logs
 */
export type EmailLogsFilterDto = {
  // Filters
  status?: EmailStatus
  tripId?: string
  contactId?: string
  templateSlug?: string
  search?: string // Search in subject or recipients
  // Date range
  fromDate?: string // ISO date string
  toDate?: string // ISO date string
  // Pagination
  page?: number
  limit?: number
  // Sorting
  sortBy?: 'createdAt' | 'sentAt' | 'status'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Email Templates Filter DTO
 */
export type EmailTemplatesFilterDto = {
  category?: EmailCategory
  isActive?: boolean
  search?: string
  includeSystem?: boolean
}

// =============================================================================
// Response DTOs
// =============================================================================

/**
 * Email Send Result
 * Response from sending an email
 */
export type EmailResult = {
  success: boolean
  emailLogId?: string
  providerMessageId?: string
  error?: string
  filtered?: boolean
  filteredRecipients?: {
    to: string[]
    cc: string[]
    bcc: string[]
  }
}

/**
 * Email Log Response DTO
 */
export type EmailLogResponse = {
  id: string
  agencyId: string
  toEmail: string[]
  ccEmail: string[] | null
  bccEmail: string[] | null
  fromEmail: string
  replyTo: string | null
  subject: string
  bodyHtml: string | null
  bodyText: string | null
  templateSlug: string | null
  variables: Record<string, unknown> | null
  status: EmailStatus
  provider: string | null
  providerMessageId: string | null
  errorMessage: string | null
  tripId: string | null
  contactId: string | null
  activityId: string | null
  sentAt: string | null
  createdAt: string
  createdBy: string | null
  category: EmailCategory | null
}

/**
 * Email Template Response DTO
 */
export type EmailTemplateResponse = {
  id: string
  agencyId: string | null
  slug: string
  name: string
  description: string | null
  subject: string
  bodyHtml: string
  bodyText: string | null
  variables: EmailVariableDefinition[] | null
  category: EmailCategory | null
  isSystem: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

/**
 * Rendered Template Response
 * Result of rendering a template with variables
 */
export type RenderedTemplateResponse = {
  subject: string
  html: string
  text: string | null
  variables: Record<string, string>
}

/**
 * Email Template Preview Response
 * Result of previewing a template with sample data
 */
export type EmailTemplatePreviewResponse = {
  subject: string
  bodyHtml: string
  bodyText: string | null
  variables: Array<{
    key: string
    value: string
    description: string
  }>
}

/**
 * Rendered Template (internal service type)
 * Used by email templates service when rendering
 */
export type RenderedTemplate = {
  subject: string
  html: string
  text?: string
  templateId: string
  templateSlug: string
}

/**
 * Email Variable Definition
 * Describes a variable that can be used in templates
 */
export type EmailVariableDefinition = {
  key: string
  description: string
  defaultValue?: string
  category?: string
}

/**
 * Available Variables Response
 * List of all available variables for templates
 */
export type AvailableVariablesResponse = {
  categories: {
    name: string
    description: string
    variables: EmailVariableDefinition[]
  }[]
}

// =============================================================================
// Paginated Response
// =============================================================================

/**
 * Paginated Email Logs Response
 */
export type PaginatedEmailLogsResponse = {
  data: EmailLogResponse[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

/**
 * Email Templates List Response
 */
export type EmailTemplatesListResponse = {
  data: EmailTemplateResponse[]
  total: number
}
