import { create } from 'zustand'

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

export interface ComposeState {
  mode: ComposeMode
  replyToEmailId?: string
  prefillTo?: { address: string; name?: string }[]
  prefillCc?: { address: string; name?: string }[]
  prefillSubject?: string
  prefillBody?: string
}

interface EmailViewState {
  // View state (persists across route changes, resets on page refresh)
  activeFolder: string
  selectedEmailId: string | null
  search: string

  // Compose state
  compose: ComposeState | null

  // Actions
  setActiveFolder: (folder: string) => void
  setSelectedEmailId: (emailId: string | null) => void
  setSearch: (search: string) => void
  openCompose: (state: ComposeState) => void
  closeCompose: () => void
  reset: () => void
}

export const useEmailStore = create<EmailViewState>()((set) => ({
  activeFolder: 'INBOX',
  selectedEmailId: null,
  search: '',
  compose: null,

  setActiveFolder: (folder) => set({ activeFolder: folder, selectedEmailId: null }),
  setSelectedEmailId: (emailId) => set({ selectedEmailId: emailId }),
  setSearch: (search) => set({ search }),
  openCompose: (compose) => set({ compose }),
  closeCompose: () => set({ compose: null }),
  reset: () => set({ activeFolder: 'INBOX', selectedEmailId: null, search: '', compose: null }),
}))
