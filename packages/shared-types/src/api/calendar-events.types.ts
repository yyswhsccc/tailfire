/**
 * Calendar Events API Types
 *
 * Types for standalone calendar events (meetings, calls, follow-ups).
 */

import type { BaseFilterDto } from './common.types.js'

// ============================================================================
// SUB-TYPES
// ============================================================================

export type CalendarEventSubType = 'meeting' | 'call' | 'follow_up' | 'appointment' | 'other'

// ============================================================================
// CREATE/UPDATE DTOs
// ============================================================================

export interface CreateCalendarEventDto {
  title: string
  description?: string
  startAt: string // ISO datetime
  endAt?: string // ISO datetime
  allDay?: boolean
  eventType?: CalendarEventSubType
  contactId?: string
  tripId?: string
}

export interface UpdateCalendarEventDto {
  title?: string
  description?: string
  startAt?: string
  endAt?: string
  allDay?: boolean
  eventType?: CalendarEventSubType
}

// ============================================================================
// FILTER DTOs
// ============================================================================

export interface CalendarEventFilterDto extends BaseFilterDto {
  contactId?: string
  tripId?: string
  upcoming?: boolean
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export interface CalendarEventUserDto {
  id: string
  firstName?: string
  lastName?: string
  avatarUrl?: string
}

export interface CalendarEventResponseDto {
  id: string
  agencyId: string
  title: string
  description?: string
  startAt: string
  endAt?: string
  allDay: boolean
  eventType: CalendarEventSubType
  contactId?: string
  tripId?: string
  createdBy: string
  createdByUser: CalendarEventUserDto
  createdAt: string
  updatedAt: string
}

export interface PaginatedCalendarEventsResponseDto {
  data: CalendarEventResponseDto[]
  count: number
  page: number
  limit: number
  totalPages: number
}
