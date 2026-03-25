/**
 * Document Templates React Query Hooks
 *
 * Provides hooks for managing document templates:
 * - List templates with filtering by category and status
 * - Get template by ID or slug
 * - Create, update, fork, publish, and delete templates
 * - Render PDF and poll for status
 * - Get available template variables
 */

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ============================================================================
// Types
// ============================================================================

export type TemplateCategory = 'trip_order' | 'payment' | 'email' | 'proposal' | 'form' | 'notification' | 'system' | 'client_care'
export type TemplateStatus = 'draft' | 'published' | 'archived'

export type TemplateChannel = 'email' | 'pdf' | 'form' | 'sms'

export interface DocumentTemplate {
  id: string
  agencyId: string | null
  parentId: string | null
  parentVersion: number | null
  slug: string
  name: string
  description: string | null
  category: TemplateCategory
  blocksJson: { blocks: Array<{ id: string; type: string; permission: string; content: Record<string, unknown> }> }
  emailHtml: string | null
  emailCss: string | null
  pdfHtml: string | null
  pdfCss: string | null
  subjectTemplate: string | null
  textTemplate: string | null
  variables: Record<string, unknown> | null
  outputTypes: string[]
  status: TemplateStatus
  publishedAt: string | null
  version: number
  isActive: boolean
  userId: string | null
  channel: TemplateChannel | null
  isSystem: boolean
  formJson: Record<string, unknown> | null
  smsTemplate: string | null
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentTemplateFilters {
  category?: TemplateCategory
  status?: TemplateStatus
  channel?: TemplateChannel
}

export interface CreateDocumentTemplateData {
  slug: string
  name: string
  description?: string
  category: TemplateCategory
  blocksJson?: { blocks: Array<{ id: string; type: string; permission?: string; content: Record<string, unknown> }> }
  emailHtml?: string
  emailCss?: string
  pdfHtml?: string
  pdfCss?: string
  subjectTemplate?: string
  textTemplate?: string
  variables?: Record<string, unknown>
  outputTypes?: string[]
}

export interface UpdateDocumentTemplateData {
  slug?: string
  name?: string
  description?: string
  category?: TemplateCategory
  blocksJson?: { blocks: Array<{ id: string; type: string; permission?: string; content: Record<string, unknown> }> }
  emailHtml?: string
  emailCss?: string
  pdfHtml?: string
  pdfCss?: string
  subjectTemplate?: string
  textTemplate?: string
  variables?: Record<string, unknown>
  outputTypes?: string[]
  status?: TemplateStatus
  formJson?: Record<string, unknown> | null
}

export interface RenderPdfParams {
  templateSlug: string
  tripId?: string
  contactId?: string
  additionalVariables?: Record<string, unknown>
}

export interface RenderPdfResponse {
  jobId: string
  status: 'queued'
}

export interface RenderPdfStatusResponse {
  jobId: string
  status: 'queued' | 'active' | 'completed' | 'failed'
  result?: {
    url?: string
    error?: string
  }
}

export interface RenderedTemplateResponse {
  subject: string | null
  html: string | null
  pdfHtml: string | null
  text: string | null
  templateId: string
  templateSlug: string
  templateVersion: number
}

export interface TemplateVariablesResponse {
  variables: Record<string, string[]>
  helpers: Array<{ name: string; usage: string; description: string }>
  blockHelpers: Array<{ name: string; usage: string; description: string }>
}

// ============================================================================
// Query Keys
// ============================================================================

export const documentTemplateKeys = {
  all: ['document-templates'] as const,
  lists: () => [...documentTemplateKeys.all, 'list'] as const,
  list: (filters: DocumentTemplateFilters) => [...documentTemplateKeys.lists(), filters] as const,
  details: () => [...documentTemplateKeys.all, 'detail'] as const,
  detail: (idOrSlug: string) => [...documentTemplateKeys.details(), idOrSlug] as const,
  variables: () => [...documentTemplateKeys.all, 'variables'] as const,
  renderStatus: (jobId: string) => [...documentTemplateKeys.all, 'render-status', jobId] as const,
}

// ============================================================================
// Queries
// ============================================================================

/**
 * List document templates with optional filtering by category and status.
 */
export function useDocumentTemplates(
  filters: DocumentTemplateFilters = {},
  options?: Omit<UseQueryOptions<DocumentTemplate[]>, 'queryKey' | 'queryFn'>
) {
  const searchParams = new URLSearchParams()
  if (filters.category) searchParams.set('category', filters.category)
  if (filters.status) searchParams.set('status', filters.status)
  if (filters.channel) searchParams.set('channel', filters.channel)

  const queryString = searchParams.toString()
  const endpoint = `/document-templates${queryString ? `?${queryString}` : ''}`

  return useQuery({
    queryKey: documentTemplateKeys.list(filters),
    queryFn: async () => {
      return api.get<DocumentTemplate[]>(endpoint)
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Get a single document template by ID or slug.
 */
export function useDocumentTemplate(
  idOrSlug: string | null,
  options?: Omit<UseQueryOptions<DocumentTemplate>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: documentTemplateKeys.detail(idOrSlug || ''),
    queryFn: async () => {
      return api.get<DocumentTemplate>(`/document-templates/${idOrSlug}`)
    },
    enabled: !!idOrSlug,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  })
}

/**
 * Get available template variables and helpers.
 */
export function useTemplateVariables(
  options?: Omit<UseQueryOptions<TemplateVariablesResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: documentTemplateKeys.variables(),
    queryFn: async () => {
      return api.get<TemplateVariablesResponse>('/document-templates/variables')
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  })
}

/**
 * Preview a template rendered with sample/empty context.
 */
export function useTemplatePreview(
  slug: string | null,
  options?: Omit<UseQueryOptions<RenderedTemplateResponse>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...documentTemplateKeys.all, 'preview', slug] as const,
    queryFn: async () => {
      return api.get<RenderedTemplateResponse>(`/document-templates/${slug}/preview`)
    },
    enabled: !!slug,
    staleTime: 0, // Always fetch fresh preview
    ...options,
  })
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Create a new document template.
 */
export function useCreateDocumentTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateDocumentTemplateData) => {
      return api.post<DocumentTemplate>('/document-templates', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.lists() })
    },
  })
}

/**
 * Update an existing document template.
 */
export function useUpdateDocumentTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateDocumentTemplateData }) => {
      return api.patch<DocumentTemplate>(`/document-templates/${id}`, data)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.lists() })
    },
  })
}

/**
 * Fork a system template for the current agency.
 */
export function useForkDocumentTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      return api.post<DocumentTemplate>(`/document-templates/${id}/fork`, {})
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.lists() })
    },
  })
}

/**
 * Publish a document template.
 */
export function usePublishDocumentTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      return api.post<DocumentTemplate>(`/document-templates/${id}/publish`, {})
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.lists() })
    },
  })
}

/**
 * Soft delete a document template.
 */
export function useDeleteDocumentTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/document-templates/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.lists() })
    },
  })
}

/**
 * Fork a template for the current user (user-level customization).
 */
export function useForkTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (templateId: string) => {
      return api.post<DocumentTemplate>(`/document-templates/${templateId}/fork-user`, {})
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all })
    },
  })
}

/**
 * Delete a user fork, reverting to the parent template.
 */
export function useDeleteFork() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (templateId: string) => {
      return api.delete(`/document-templates/${templateId}/fork`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentTemplateKeys.all })
    },
  })
}

/**
 * Queue a PDF render job.
 */
export function useRenderPdf() {
  return useMutation({
    mutationFn: async (params: RenderPdfParams) => {
      return api.post<RenderPdfResponse>('/documents/render-pdf', params)
    },
  })
}

/**
 * Poll for PDF render job status.
 * Automatically refetches every 2 seconds until the job is completed or failed.
 */
export function useRenderPdfStatus(
  jobId: string | null,
  options?: Omit<UseQueryOptions<RenderPdfStatusResponse>, 'queryKey' | 'queryFn' | 'refetchInterval'>
) {
  return useQuery({
    queryKey: documentTemplateKeys.renderStatus(jobId || ''),
    queryFn: async () => {
      return api.get<RenderPdfStatusResponse>(`/documents/render-pdf/${jobId}`)
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'completed' || status === 'failed') {
        return false // Stop polling
      }
      return 2000 // Poll every 2 seconds
    },
    ...options,
  })
}
