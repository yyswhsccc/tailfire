import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CalendarView, CalendarEventType } from '@tailfire/shared-types/api'

interface CalendarState {
  // View state
  currentView: CalendarView
  currentDate: string // ISO date

  // Filters
  selectedUserId: string | null // For admin filtering
  enabledEventTypes: CalendarEventType[]

  // Actions
  setView: (view: CalendarView) => void
  setDate: (date: string) => void
  setSelectedUser: (userId: string | null) => void
  toggleEventType: (type: CalendarEventType) => void
  setEventTypes: (types: CalendarEventType[]) => void
  resetFilters: () => void
}

const DEFAULT_EVENT_TYPES: CalendarEventType[] = [
  'task',
  'payment_deposit',
  'payment_final',
  'birthday',
  'trip',
  'activity',
  'event',
  'scheduled_email',
]

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      // Initial state
      currentView: 'month',
      currentDate: new Date().toISOString(),
      selectedUserId: null,
      enabledEventTypes: DEFAULT_EVENT_TYPES,

      // Actions
      setView: (view) => set({ currentView: view }),

      setDate: (date) => set({ currentDate: date }),

      setSelectedUser: (userId) => set({ selectedUserId: userId }),

      toggleEventType: (type) =>
        set((state) => ({
          enabledEventTypes: state.enabledEventTypes.includes(type)
            ? state.enabledEventTypes.filter((t) => t !== type)
            : [...state.enabledEventTypes, type],
        })),

      setEventTypes: (types) => set({ enabledEventTypes: types }),

      resetFilters: () =>
        set({
          selectedUserId: null,
          enabledEventTypes: DEFAULT_EVENT_TYPES,
        }),
    }),
    {
      name: 'calendar-preferences',
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<CalendarState>) }
        // Ensure newly added event types are included for users with persisted state
        const persistedTypes = (persisted as Partial<CalendarState>)?.enabledEventTypes
        if (persistedTypes) {
          const missingTypes = DEFAULT_EVENT_TYPES.filter(
            (t) => !persistedTypes.includes(t)
          )
          if (missingTypes.length > 0) {
            merged.enabledEventTypes = [...persistedTypes, ...missingTypes]
          }
        }
        return merged
      },
    }
  )
)
