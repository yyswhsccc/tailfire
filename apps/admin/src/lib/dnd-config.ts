import {
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from '@dnd-kit/core'

/**
 * Centralized DnD configuration
 * Reusable across all drag-and-drop implementations
 */

/**
 * Standard pointer sensor configuration
 * Requires 8px of movement before drag starts to avoid accidental drags
 */
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )
}

/**
 * Standard collision detection for scrollable columns
 * Uses pointerWithin for better UX with scrolling
 */
export const dndCollisionDetection: CollisionDetection = pointerWithin

/**
 * Alternative collision detection (closestCenter)
 * Can be used for simpler layouts without scrolling
 */
export const dndCollisionDetectionCenter: CollisionDetection = closestCenter

/**
 * Drag data types for type safety
 */
export interface DragData {
  type: string
  [key: string]: unknown
}

export interface ComponentDragData extends DragData {
  type: 'component'
  componentType: string
  label: string
}

export interface ActivityDragData extends DragData {
  type: 'activity'
  activityId: string
  dayId: string
}

export interface DayColumnDropData extends DragData {
  type: 'day-column'
  dayId: string
}

export interface TripSummaryDropData extends DragData {
  type: 'trip-summary'
}

export interface EmailDragData extends DragData {
  type: 'email'
  email: import('@tailfire/shared-types/api').SyncedEmailResponseDto
}

export interface FolderDropData extends DragData {
  type: 'folder'
  folderPath: string
}
