'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portalApi, portalApiMultipart } from '@/lib/api'

export interface PortalDocument {
  id: string
  documentType: string | null
  fileName: string
  fileUrl: string
  fileSize: number | null
  uploadedAt: string | null
}

export function usePortalDocuments() {
  return useQuery({
    queryKey: ['portal', 'documents'],
    queryFn: () => portalApi<PortalDocument[]>('/portal/my-documents'),
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ file, documentType }: { file: File; documentType: string }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', documentType)
      return portalApiMultipart<PortalDocument>('/portal/my-documents', formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'documents'] })
    },
  })
}

export function useDeleteDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) =>
      portalApi<{ deleted: boolean }>(`/portal/my-documents/${documentId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'documents'] })
    },
  })
}
