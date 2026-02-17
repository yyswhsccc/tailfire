import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  ImportPreviewRequest,
  ImportPreviewResponse,
  ImportConfirmRequest,
  ImportConfirmResponse,
} from '@/types/import-booking.types'

export function useImportPreview() {
  return useMutation({
    mutationFn: (data: ImportPreviewRequest) =>
      api.post<ImportPreviewResponse>('/cruise-booking/import/preview', data),
  })
}

export function useImportConfirm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ImportConfirmRequest) =>
      api.post<ImportConfirmResponse>('/cruise-booking/import/confirm', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['itineraries'] })
    },
  })
}
