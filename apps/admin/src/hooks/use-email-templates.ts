/**
 * Email Templates React Query Hooks
 *
 * Provides hooks for managing email templates:
 * - List templates with filtering
 * - Get template by slug
 * - Preview template with sample data
 * - Send test emails
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  EmailTemplateResponse,
  EmailCategory,
  EmailTemplatePreviewResponse,
  EmailResult,
} from '@tailfire/shared-types'

// ============================================================================
// Types
// ============================================================================

export interface EmailTemplateFilters {
  category?: EmailCategory
  search?: string
  isActive?: boolean
}

export interface SendTestEmailParams {
  slug: string
  recipientEmail?: string
}

// ============================================================================
// Query Keys
// ============================================================================

export const emailTemplateKeys = {
  all: ['email-templates'] as const,
  lists: () => [...emailTemplateKeys.all, 'list'] as const,
  list: (filters: EmailTemplateFilters) => [...emailTemplateKeys.lists(), filters] as const,
  details: () => [...emailTemplateKeys.all, 'detail'] as const,
  detail: (slug: string) => [...emailTemplateKeys.details(), slug] as const,
  preview: (slug: string) => [...emailTemplateKeys.detail(slug), 'preview'] as const,
  variables: () => [...emailTemplateKeys.all, 'variables'] as const,
}

// ============================================================================
// Queries
// ============================================================================

/**
 * List email templates with optional filtering.
 */
export function useEmailTemplates(
  filters: EmailTemplateFilters = {},
  options?: Omit<UseQueryOptions<EmailTemplateResponse[]>, 'queryKey' | 'queryFn'>
) {
  const searchParams = new URLSearchParams()
  if (filters.category) searchParams.set('category', filters.category)
  if (filters.search) searchParams.set('search', filters.search)
  if (filters.isActive !== undefined) searchParams.set('isActive', String(filters.isActive))

  const queryString = searchParams.toString()
  const endpoint = `/email-templates${queryString ? `?${queryString}` : ''}`

  return useQuery({
    queryKey: emailTemplateKeys.list(filters),
    queryFn: async () => {
      return api.get<EmailTemplateResponse[]>(endpoint)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Get a single email template by slug.
 */
export function useEmailTemplate(
  slug: string | null,
  options?: Omit<UseQueryOptions<EmailTemplateResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: emailTemplateKeys.detail(slug || ''),
    queryFn: async () => {
      return api.get<EmailTemplateResponse>(`/email-templates/${slug}`)
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Preview a template with sample data.
 * Returns rendered HTML/text with variable substitution using sample values.
 */
export function useEmailTemplatePreview(
  slug: string | null,
  options?: Omit<UseQueryOptions<EmailTemplatePreviewResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: emailTemplateKeys.preview(slug || ''),
    queryFn: async () => {
      return api.get<EmailTemplatePreviewResponse>(`/email-templates/${slug}/preview`)
    },
    enabled: !!slug,
    staleTime: 30 * 1000, // 30 seconds (preview data is relatively static)
    ...options,
  })
}

/**
 * Get available template variables.
 */
export function useEmailTemplateVariables(
  options?: Omit<
    UseQueryOptions<Array<{ key: string; description: string; category: string }>>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: emailTemplateKeys.variables(),
    queryFn: async () => {
      return api.get<Array<{ key: string; description: string; category: string }>>(
        '/email-templates/variables'
      )
    },
    staleTime: 60 * 60 * 1000, // 1 hour (variables rarely change)
    ...options,
  })
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Send a test email using a template with sample data.
 * Sends to the current user's email or a specified recipient.
 */
export function useSendTestEmail() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ slug, recipientEmail }: SendTestEmailParams) => {
      return api.post<EmailResult>(`/email-templates/${slug}/test`, {
        recipientEmail,
      })
    },
    onSuccess: () => {
      // Optionally invalidate any related queries
      queryClient.invalidateQueries({ queryKey: emailTemplateKeys.all })
    },
  })
}

/**
 * Toggle template active status.
 */
export function useToggleTemplateStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return api.put<EmailTemplateResponse>(`/email-templates/${id}`, { isActive })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailTemplateKeys.all })
    },
  })
}
