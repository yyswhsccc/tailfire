import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  OcrPreviewResponse,
  OcrConfirmRequest,
  OcrConfirmResponse,
  OcrJobStatusResponse,
} from '@tailfire/shared-types'

export function useOcrPreview() {
  return useMutation({
    mutationFn: (formData: FormData) =>
      api.postFormData<OcrPreviewResponse | OcrJobStatusResponse>('/ocr-import/preview', formData),
  })
}

export function useOcrConfirm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: OcrConfirmRequest) =>
      api.post<OcrConfirmResponse>('/ocr-import/confirm', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['itineraries'] })
    },
  })
}

export function useUpdateSupplierPolicies() {
  return useMutation({
    mutationFn: ({ supplierId, data }: {
      supplierId: string
      data: Partial<{ defaultTermsAndConditions: string; defaultCancellationPolicy: string }>
    }) => api.patch(`/suppliers/${supplierId}`, data),
  })
}

export function useOcrJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['ocr-import', 'status', jobId],
    queryFn: () => api.get<OcrJobStatusResponse>(`/ocr-import/status/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && (data.status === 'preview_ready' || data.status === 'failed' || data.status === 'confirmed')) {
        return false
      }
      return 3000
    },
  })
}
