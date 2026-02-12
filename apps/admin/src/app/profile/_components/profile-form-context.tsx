'use client'

import { createContext, useCallback, useContext, useRef, useState, useEffect, type ReactNode } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'

/**
 * Form handler registered by each tab
 */
interface FormHandler {
  /** The form submission function (async) */
  submit: () => Promise<void>
  /** Loading state from the mutation */
  isPending: boolean
}

/**
 * Profile form context for coordinating tab forms with page-level Save button
 */
interface ProfileFormContextType {
  /** Register a form handler for a tab (idempotent - overwrites by key) */
  registerForm: (tabId: string, handler: FormHandler) => void
  /** Unregister a form handler when tab unmounts */
  unregisterForm: (tabId: string) => void
  /** Currently active tab ID */
  activeTab: string
  /** Update the active tab */
  setActiveTab: (tab: string) => void
  /** Submit the active tab's form (safe no-op if none registered) */
  submitActiveForm: () => Promise<void>
  /** Loading state derived from active tab's mutation */
  isSubmitting: boolean
  /** Force a re-render to pick up isPending changes */
  notifyPendingChange: () => void
}

const ProfileFormContext = createContext<ProfileFormContextType | null>(null)

interface ProfileFormProviderProps {
  children: ReactNode
  defaultTab?: string
}

const VALID_TABS = ['public', 'agent', 'preferences', 'notifications', 'templates', 'tags', 'marketing', 'security']

export function ProfileFormProvider({ children, defaultTab = 'public' }: ProfileFormProviderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Get tab from URL or use default
  const tabFromUrl = searchParams.get('tab')
  const initialTab = tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : defaultTab

  // Use ref for handlers to avoid re-render cycles on registration
  const handlersRef = useRef<Map<string, FormHandler>>(new Map())
  const [activeTab, setActiveTabState] = useState(initialTab)
  // Counter to force re-render when isPending changes
  const [, setUpdateCounter] = useState(0)

  // Sync tab state when URL changes (e.g., from notification panel click)
  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTabState(tabFromUrl)
    }
  }, [tabFromUrl, activeTab])

  // Update URL when tab changes
  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, router, pathname])

  const registerForm = useCallback((tabId: string, handler: FormHandler) => {
    handlersRef.current.set(tabId, handler)
  }, [])

  const unregisterForm = useCallback((tabId: string) => {
    handlersRef.current.delete(tabId)
  }, [])

  // Allow tabs to notify when their pending state changes
  const notifyPendingChange = useCallback(() => {
    setUpdateCounter(c => c + 1)
  }, [])

  // Derive loading state from active tab's mutation
  const isSubmitting = handlersRef.current.get(activeTab)?.isPending ?? false

  const submitActiveForm = useCallback(async () => {
    const handler = handlersRef.current.get(activeTab)
    // Safe no-op if no handler registered (first render, tab unmounted, etc.)
    if (!handler) return
    await handler.submit()
  }, [activeTab])

  return (
    <ProfileFormContext.Provider
      value={{
        registerForm,
        unregisterForm,
        activeTab,
        setActiveTab,
        submitActiveForm,
        isSubmitting,
        notifyPendingChange,
      }}
    >
      {children}
    </ProfileFormContext.Provider>
  )
}

export function useProfileForm() {
  const context = useContext(ProfileFormContext)
  if (!context) {
    throw new Error('useProfileForm must be used within a ProfileFormProvider')
  }
  return context
}
