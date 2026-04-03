import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { contactKeys } from './use-contacts'
import type {
  ContactImportRow,
  ContactImportConfirmRow,
  ContactImportPreviewResult,
  ContactImportConfirmResult,
} from '@tailfire/shared-types/api'

export function useContactImportPreview() {
  return useMutation({
    mutationFn: (data: { rows: ContactImportRow[] }) =>
      api.post<ContactImportPreviewResult>('/contacts/import/preview', data),
  })
}

export function useContactImportConfirm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { rows: ContactImportConfirmRow[]; tags: string[] }) =>
      api.post<ContactImportConfirmResult>('/contacts/import/confirm', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() })
      queryClient.invalidateQueries({ queryKey: contactKeys.all })
    },
  })
}
