/**
 * Email Accounts React Query Hooks
 *
 * Hooks for agent personal email account CRUD and connection testing.
 * Part of EmailAccountsModule — separate from existing email hooks.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  EmailAccountResponseDto,
  CreateEmailAccountDto,
  UpdateEmailAccountDto,
  TestConnectionDto,
  TestConnectionResultDto,
} from '@tailfire/shared-types/api'
import { useToast } from './use-toast'

// ============================================================================
// Query Keys
// ============================================================================

export const emailAccountKeys = {
  all: ['email-accounts'] as const,
  list: () => [...emailAccountKeys.all, 'list'] as const,
  detail: (id: string) => [...emailAccountKeys.all, id] as const,
}

// ============================================================================
// Queries
// ============================================================================

export function useEmailAccounts() {
  return useQuery({
    queryKey: emailAccountKeys.list(),
    queryFn: () => api.get<EmailAccountResponseDto[]>('/email-accounts'),
  })
}

export function useEmailAccount(id: string | null) {
  return useQuery({
    queryKey: emailAccountKeys.detail(id || ''),
    queryFn: () => api.get<EmailAccountResponseDto>(`/email-accounts/${id}`),
    enabled: !!id,
  })
}

// ============================================================================
// Mutations
// ============================================================================

export function useCreateEmailAccount() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (data: CreateEmailAccountDto) =>
      api.post<EmailAccountResponseDto>('/email-accounts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailAccountKeys.all })
      toast({
        title: 'Email account added',
        description: 'Your email account has been configured successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to add email account',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

export function useUpdateEmailAccount(id: string) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (data: UpdateEmailAccountDto) =>
      api.put<EmailAccountResponseDto>(`/email-accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailAccountKeys.all })
      toast({
        title: 'Email account updated',
        description: 'Your email account settings have been updated.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update email account',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

export function useDeleteEmailAccount() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (id: string) => api.delete(`/email-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailAccountKeys.all })
      toast({
        title: 'Email account removed',
        description: 'Your email account has been deactivated.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to remove email account',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}

export function useTestEmailConnection() {
  const { toast } = useToast()

  return useMutation({
    mutationFn: (data: TestConnectionDto) =>
      api.post<TestConnectionResultDto>('/email-accounts/test-connection', data),
    onSuccess: (result) => {
      if (result.success) {
        toast({
          title: 'Connection successful',
          description: 'IMAP connection test passed.',
        })
      } else {
        toast({
          title: 'Connection failed',
          description: result.error || 'Could not connect to the mail server.',
          variant: 'destructive',
        })
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Connection test failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    },
  })
}
