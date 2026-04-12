'use client'

import { useMemo } from 'react'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-user-profile'

interface EmailPaneLayout {
  leftWidth: number
  centerWidth: number
  leftCollapsed: boolean
  centerCollapsed: boolean
}

const DEFAULT_LAYOUT: EmailPaneLayout = {
  leftWidth: 200,
  centerWidth: 350,
  leftCollapsed: false,
  centerCollapsed: false,
}

export function useEmailLayout() {
  const { data: profile } = useMyProfile()
  const updateProfile = useUpdateMyProfile()

  const layout = useMemo<EmailPaneLayout>(() => {
    const saved = (profile?.platformPreferences as any)?.emailPaneWidths
    if (!saved) return DEFAULT_LAYOUT
    return {
      leftWidth: saved.folders ?? DEFAULT_LAYOUT.leftWidth,
      centerWidth: saved.emailList ?? DEFAULT_LAYOUT.centerWidth,
      leftCollapsed: saved.foldersCollapsed ?? DEFAULT_LAYOUT.leftCollapsed,
      centerCollapsed: saved.emailListCollapsed ?? DEFAULT_LAYOUT.centerCollapsed,
    }
  }, [profile?.platformPreferences])

  const saveLayout = useDebouncedCallback((newLayout: EmailPaneLayout) => {
    updateProfile.mutate({
      platformPreferences: {
        ...(profile?.platformPreferences as object),
        emailPaneWidths: {
          folders: newLayout.leftWidth,
          emailList: newLayout.centerWidth,
          foldersCollapsed: newLayout.leftCollapsed,
          emailListCollapsed: newLayout.centerCollapsed,
        },
      },
    })
  }, 500)

  return { layout, saveLayout }
}
