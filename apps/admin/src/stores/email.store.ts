import { create } from 'zustand'

interface EmailViewState {
  // View state (persists across route changes, resets on page refresh)
  activeFolder: string
  selectedEmailId: string | null
  search: string

  // Actions
  setActiveFolder: (folder: string) => void
  setSelectedEmailId: (emailId: string | null) => void
  setSearch: (search: string) => void
  reset: () => void
}

export const useEmailStore = create<EmailViewState>()((set) => ({
  activeFolder: 'INBOX',
  selectedEmailId: null,
  search: '',

  setActiveFolder: (folder) => set({ activeFolder: folder, selectedEmailId: null }),
  setSelectedEmailId: (emailId) => set({ selectedEmailId: emailId }),
  setSearch: (search) => set({ search }),
  reset: () => set({ activeFolder: 'INBOX', selectedEmailId: null, search: '' }),
}))
