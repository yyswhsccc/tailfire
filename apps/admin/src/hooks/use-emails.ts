/**
 * Synced Emails React Query Hooks
 *
 * Hooks for reading synced emails, folders, and triggering sync.
 */

import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  SyncedEmailResponseDto,
  SyncedEmailDetailDto,
  EmailFolderDto,
  SyncResultDto,
  EmailLogResponse,
  PaginatedEmailLogsResponse,
} from '@tailfire/shared-types/api'
import { useToast } from './use-toast'
import { useEmailAccounts } from './use-email-accounts'

// ============================================================================
// Query Keys
// ============================================================================

export const emailLogKeys = {
  all: ['email-logs'] as const,
  list: (contactId: string, search?: string) =>
    [...emailLogKeys.all, contactId, search] as const,
  detail: (logId: string) => [...emailLogKeys.all, 'detail', logId] as const,
}

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

export function useEmailLogs(contactId: string | null, filters?: { search?: string }) {
  return useQuery({
    queryKey: emailLogKeys.list(contactId || '', filters?.search),
    queryFn: () => {
      const params = new URLSearchParams()
      if (contactId) params.set('contactId', contactId)
      if (filters?.search) params.set('search', filters.search)
      params.set('limit', '100')
      return api.get<PaginatedEmailLogsResponse>(`/emails/logs?${params.toString()}`)
    },
    enabled: !!contactId,
  })
}

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

export function useEmailLogDetail(logId: string | null) {
  return useQuery({
    queryKey: emailLogKeys.detail(logId || ''),
    queryFn: () => api.get<EmailLogResponse>(`/emails/logs/${logId}`),
    enabled: !!logId,
  })
}

/**
 * Lightweight hook for top nav unread badge.
 * Fetches accounts + INBOX folder unseen count with 60s stale time.
 */
export function useUnreadEmailCount() {
  const { data: accounts } = useEmailAccounts()
  const accountId = accounts?.[0]?.id ?? null

  const { data: folders } = useQuery({
    queryKey: emailKeys.folders(accountId || ''),
    queryFn: () => api.get<EmailFolderDto[]>(`/email-accounts/${accountId}/folders`),
    enabled: !!accountId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  return useMemo(() => {
    if (!folders) return 0
    const inbox = folders.find(
      (f) => f.specialUse === '\\Inbox' || f.path === 'INBOX',
    )
    return inbox?.unseenMessages ?? 0
  }, [folders])
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
    onMutate: async (emailId) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.all })

      const cache = queryClient.getQueriesData<{ emails: SyncedEmailResponseDto[]; total: number }>({
        queryKey: [...emailKeys.all, accountId || ''],
      })

      for (const [key, data] of cache) {
        if (!data?.emails) continue
        const filtered = data.emails.filter((e) => e.id !== emailId)
        if (filtered.length !== data.emails.length) {
          queryClient.setQueryData(key, { emails: filtered, total: Math.max(0, data.total - 1) })
        }
      }

      return { cache }
    },
    onError: (_error, _vars, context) => {
      if (context?.cache) {
        for (const [key, data] of context.cache) {
          queryClient.setQueryData(key, data)
        }
      }
      toast({
        title: 'Failed to delete email',
        description: _error.message,
        variant: 'destructive',
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
      toast({ title: 'Email deleted' })
    },
  })
}

export function useCreateFolder(accountId: string | null) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (path: string) => {
      if (!accountId) throw new Error('No account selected')
      return api.post(`/email-accounts/${accountId}/folders`, { path })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.folders(accountId || '') })
      toast({ title: 'Folder created' })
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create folder', description: error.message, variant: 'destructive' })
    },
  })
}

export function useRenameFolder(accountId: string | null) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (params: { path: string; newPath: string }) => {
      if (!accountId) throw new Error('No account selected')
      return api.patch(`/email-accounts/${accountId}/folders/rename`, params)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
      toast({ title: 'Folder renamed' })
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to rename folder', description: error.message, variant: 'destructive' })
    },
  })
}

export function useDeleteFolder(accountId: string | null) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (path: string) => {
      if (!accountId) throw new Error('No account selected')
      return api.delete(`/email-accounts/${accountId}/folders?path=${encodeURIComponent(path)}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
      toast({ title: 'Folder deleted' })
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete folder', description: error.message, variant: 'destructive' })
    },
  })
}

export function useMoveEmail(accountId: string | null) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (params: { emailId: string; folder: string }) => {
      if (!accountId) throw new Error('No account selected')
      return api.post(`/email-accounts/${accountId}/emails/${params.emailId}/move`, {
        folder: params.folder,
      })
    },
    onMutate: async ({ emailId }) => {
      // Cancel in-flight queries so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: emailKeys.all })

      // Snapshot all email list caches that contain this email
      const cache = queryClient.getQueriesData<{ emails: SyncedEmailResponseDto[]; total: number }>({
        queryKey: [...emailKeys.all, accountId || ''],
      })

      // Optimistically remove the email from every cached list
      for (const [key, data] of cache) {
        if (!data?.emails) continue
        const filtered = data.emails.filter((e) => e.id !== emailId)
        if (filtered.length !== data.emails.length) {
          queryClient.setQueryData(key, { emails: filtered, total: Math.max(0, data.total - 1) })
        }
      }

      return { cache }
    },
    onError: (_error, _vars, context) => {
      // Rollback: restore all cached lists
      if (context?.cache) {
        for (const [key, data] of context.cache) {
          queryClient.setQueryData(key, data)
        }
      }
      toast({ title: 'Failed to move email', description: _error.message, variant: 'destructive' })
    },
    onSettled: () => {
      // Refetch to reconcile with server state
      queryClient.invalidateQueries({ queryKey: emailKeys.all })
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
    onError: (error: any) => {
      const isAuthFailed = error?.code === 'IMAP_AUTH_FAILED'
      toast({
        title: isAuthFailed ? 'Email authentication failed' : 'Sync failed',
        description: isAuthFailed
          ? 'Your email password may have changed. Update it in Profile > Email.'
          : error.message || 'Could not sync emails.',
        variant: 'destructive',
      })
    },
  })
}
