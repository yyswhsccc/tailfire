/**
 * Tags API Types
 *
 * TypeScript definitions for tag management endpoints.
 * Shared between API (NestJS) and client (React/Next.js).
 */

// =============================================================================
// Response DTOs
// =============================================================================

/**
 * Tag Response DTO
 * Represents a single tag entity
 */
export type TagResponseDto = {
  id: string
  name: string
  category: string | null
  color: string | null
  type: 'system' | 'agent'
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Tag with Usage Count
 * Used in tag listing to show how many entities use each tag
 */
export type TagWithUsageDto = TagResponseDto & {
  usageCount: number  // Total across all entity types
  tripCount: number
  contactCount: number
  taskCount: number
  eventCount: number
}

// =============================================================================
// Request DTOs
// =============================================================================

/**
 * Create Tag DTO
 * Data required to create a new tag
 */
export type CreateTagDto = {
  name: string
  category?: string | null
  color?: string | null
  type?: 'system' | 'agent'
}

/**
 * Update Tag DTO
 * All fields optional for PATCH operation
 */
export type UpdateTagDto = {
  name?: string
  category?: string | null
  color?: string | null
}

/**
 * Tag Filter DTO
 * Query parameters for listing tags
 */
export type TagFilterDto = {
  search?: string  // Search by name (case-insensitive partial match)
  category?: string  // Filter by category
  type?: 'system' | 'agent'  // Filter by tag type
  sortBy?: 'name' | 'usageCount' | 'createdAt'  // Sort field
  sortOrder?: 'asc' | 'desc'  // Sort direction
  limit?: number  // Max results (default: 100)
  offset?: number  // Pagination offset
}

/**
 * Update Entity Tags DTO
 * Used to replace all tags on an entity (trip or contact)
 */
export type UpdateEntityTagsDto = {
  tagIds: string[]  // Array of tag IDs to assign
}

/**
 * Create and Assign Tag DTO
 * Atomically create a new tag and assign to entity
 */
export type CreateAndAssignTagDto = {
  name: string
  category?: string | null
  color?: string | null
  type?: 'system' | 'agent'
}
