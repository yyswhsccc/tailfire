/**
 * Synced Emails React Query Hooks
 *
 * Hooks for reading synced emails, folders, and triggering sync.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  SyncedEmailResponseDto,
  SyncedEmailDetailDto,
  EmailFolderDto,
  SyncResultDto,
} from '@tailfire/shared-types/api'
import { useToast } from './use-toast'

// ============================================================================
// Query Keys
// ============================================================================

export const emailKeys = {
  all: ['emails'] as const,
  folders: (accountId: string) => [...emailKeys.all, accountId, 'folders'] as const,
  list: (accountId: string, folder: string, search?: string, contactId?: string, page?: number) =>
    [...emailKeys.all, accountId, 'list', folder, search, contactId, page] as const,
  detail: (accountId: string, emailId: string) =>
    [...emailKeys.all, accountId, emailId] as const,
}

// ============================================================================
// Queries
// ============================================================================

export function useEmailFolders(accountId: string | null) {
  return useQuery({
    queryKey: emailKeys.folders(accountId || ''),
    queryFn: () => api.get<EmailFolderDto[]>(`/email-accounts/${accountId}/folders`),
    enabled: !!accountId,
  })
}

export function useEmails(
  accountId: string | null,
  filters: { folder?: string; search?: string; contactId?: string; page?: number; limit?: number },
) {
  const folder = filters.folder || 'INBOX'
  return useQuery({
    queryKey: emailKeys.list(accountId || '', folder, filters.search, filters.contactId, filters.page),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.folder) params.set('folder', filters.folder)
      if (filters.search) params.set('search', filters.search)
      if (filters.contactId) params.set('contactId', filters.contactId)
      if (filters.page) params.set('page', filters.page.toString())
      if (filters.limit) params.set('limit', filters.limit.toString())
      const query = params.toString()
      return api.get<{ emails: SyncedEmailResponseDto[]; total: number }>(
        `/email-accounts/${accountId}/emails${query ? `?${query}` : ''}`,
      )
    },
    enabled: !!accountId,
  })
}

export function useEmailDetail(accountId: string | null, emailId: string | null) {
  return useQuery({
    queryKey: emailKeys.detail(accountId || '', emailId || ''),
    queryFn: () =>
      api.get<SyncedEmailDetailDto>(`/email-accounts/${accountId}/emails/${emailId}`),
    enabled: !!accountId && !!emailId,
  })
}

// ============================================================================
// Mutations
// ============================================================================

export function useSendEmail(accountId: string | null) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (dto: {
      to: { address: string; name?: string }[]
      cc?: { address: string; name?: string }[]
      bcc?: { address: string; name?: string }[]
      subject: string
      bodyHtml: string
      inReplyToEmailId?: string
    }) => {
      if (!accountId) throw new Error('No account selected')
      return api.post<SyncedEmailResponseDto>(`/email-accounts/${accountId}/send`, dto)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
      toast({ title: 'Email sent' })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send email',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateEmailFlags(accountId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { emailId: string; isSeen?: boolean; isFlagged?: boolean }) => {
      if (!accountId) throw new Error('No account selected')
      const { emailId, ...flags } = params
      return api.patch<SyncedEmailResponseDto>(
        `/email-accounts/${accountId}/emails/${emailId}/flags`,
        flags,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
    },
  })
}

export function useDeleteEmail(accountId: string | null) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (emailId: string) => {
      if (!accountId) throw new Error('No account selected')
      return api.delete(`/email-accounts/${accountId}/emails/${emailId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
      toast({ title: 'Email deleted' })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to delete email',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
}

export function useSyncEmails(accountId: string | null) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: () => {
      if (!accountId) throw new Error('No account selected')
      return api.post<SyncResultDto>(`/email-accounts/${accountId}/sync`, {})
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
      toast({
        title: 'Sync complete',
        description: `${result.newMessages} new message(s) synced.`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Sync failed',
        description: error.message || 'Could not sync emails.',
        variant: 'destructive',
      })
    },
  })
}
