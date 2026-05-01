'use client'

import { useQuery } from '@tanstack/react-query'
import { portalApi } from '@/lib/api'

export interface BoardComponent {
  id: string
  type: 'flight' | 'hotel' | 'cruise' | 'tour'
  data: Record<string, unknown>
  display?: {
    heroImage?: string
    title?: string
    subtitle?: string
    price?: string
  }
}

export interface BoardInspirationCard {
  id: string
  imageUrl: string
  title: string
  subtitle?: string
}

export interface PortalBoard {
  id: string
  title: string | null
  status: string
  components: BoardComponent[]
  inspiration: BoardInspirationCard[]
  boardOrder: Array<{ id: string; type: 'component' | 'inspiration' }>
  createdAt: string
  updatedAt: string
}

export function usePortalBoards() {
  return useQuery({
    queryKey: ['portal', 'boards'],
    queryFn: () => portalApi<PortalBoard[]>('/client-portal/my-boards'),
  })
}
