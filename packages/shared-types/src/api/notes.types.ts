/**
 * Notes API Types
 *
 * Types for the central note system used on contacts and trips.
 */

import type { BaseFilterDto } from './common.types.js'

// ============================================================================
// CREATE/UPDATE DTOs
// ============================================================================

export interface CreateNoteDto {
  content: string
  tripId?: string
  contactId?: string
  isPinned?: boolean
}

export interface UpdateNoteDto {
  content?: string
  isPinned?: boolean
}

// ============================================================================
// FILTER DTOs
// ============================================================================

export interface NoteFilterDto extends BaseFilterDto {
  tripId?: string
  contactId?: string
}

// ============================================================================
// RESPONSE DTOs
// ============================================================================

export interface NoteUserDto {
  id: string
  firstName?: string
  lastName?: string
  avatarUrl?: string
}

export interface NoteResponseDto {
  id: string
  agencyId: string
  content: string
  tripId?: string
  contactId?: string
  isPinned: boolean
  createdBy: string
  createdByUser: NoteUserDto
  updatedBy?: string
  updatedByUser?: NoteUserDto
  createdAt: string
  updatedAt: string
}

export interface PaginatedNotesResponseDto {
  data: NoteResponseDto[]
  count: number
  page: number
  limit: number
  totalPages: number
}
