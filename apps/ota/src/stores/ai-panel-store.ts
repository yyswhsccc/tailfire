import { create } from 'zustand'

interface PageContext {
  type: string          // 'destination', 'sailing', 'ship', 'tour', 'cruise_line', 'region'
  slug: string
  name: string
  parentContext?: { type: string; slug: string; name: string }
  metadata?: Record<string, unknown>
}

interface JourneyItem {
  id: string
  type: string
  slug: string
  name: string
  thumbnailUrl?: string
  hearted: boolean
  addedAt: string
}

interface AiPanelState {
  // Panel state
  isOpen: boolean
  sessionId?: string
  prefill?: string

  // Page context (what entity the user is currently viewing)
  pageContext?: PageContext

  // Journey tracker (saved/hearted items)
  journeyItems: JourneyItem[]

  // Actions
  open: (opts?: { prefill?: string }) => void
  close: () => void
  toggle: () => void
  setPageContext: (ctx: PageContext) => void
  clearPageContext: () => void
  setSessionId: (id: string) => void

  // Journey item actions
  addJourneyItem: (item: Omit<JourneyItem, 'id' | 'addedAt' | 'hearted'>) => void
  toggleHeart: (itemId: string) => void
  removeJourneyItem: (itemId: string) => void
  clearJourney: () => void
}

export const useAiPanelStore = create<AiPanelState>((set) => ({
  isOpen: false,
  journeyItems: [],

  open: (opts) => set({ isOpen: true, prefill: opts?.prefill }),
  close: () => set({ isOpen: false, prefill: undefined }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  setPageContext: (ctx) => set({ pageContext: ctx }),
  clearPageContext: () => set({ pageContext: undefined }),
  setSessionId: (id) => set({ sessionId: id }),

  addJourneyItem: (item) =>
    set((s) => {
      const exists = s.journeyItems.some(
        (i) => i.type === item.type && i.slug === item.slug,
      )
      if (exists) return s
      return {
        journeyItems: [
          ...s.journeyItems,
          {
            ...item,
            id: crypto.randomUUID(),
            hearted: false,
            addedAt: new Date().toISOString(),
          },
        ],
      }
    }),

  toggleHeart: (itemId) =>
    set((s) => ({
      journeyItems: s.journeyItems.map((i) =>
        i.id === itemId ? { ...i, hearted: !i.hearted } : i,
      ),
    })),

  removeJourneyItem: (itemId) =>
    set((s) => ({
      journeyItems: s.journeyItems.filter((i) => i.id !== itemId),
    })),

  clearJourney: () => set({ journeyItems: [] }),
}))
