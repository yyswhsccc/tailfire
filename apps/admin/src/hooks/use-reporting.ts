/**
 * Reporting Hooks
 *
 * Fetches report catalog and individual report data.
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import type { ReportDefinition, ReportResponse, ReportQueryParams } from '@tailfire/shared-types/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1'

// -- Query Keys --

export const reportingKeys = {
  all: ['reporting'] as const,
  catalog: () => [...reportingKeys.all, 'catalog'] as const,
  report: (slug: string, params: ReportQueryParams) =>
    [...reportingKeys.all, 'report', slug, params] as const,
}

// -- Hooks --

export function useReportCatalog() {
  return useQuery({
    queryKey: reportingKeys.catalog(),
    queryFn: () => api.get<ReportDefinition[]>('/reporting/catalog'),
    staleTime: 5 * 60_000,
  })
}

export function useReport<T>(slug: string, params: ReportQueryParams) {
  const { startDate, endDate, ...rest } = params

  return useQuery({
    queryKey: reportingKeys.report(slug, params),
    queryFn: () => {
      const searchParams = new URLSearchParams({ startDate, endDate })
      if (rest.viewScope) searchParams.set('viewScope', rest.viewScope)
      if (rest.page !== undefined) searchParams.set('page', String(rest.page))
      if (rest.pageSize !== undefined) searchParams.set('pageSize', String(rest.pageSize))
      if (rest.sortBy) searchParams.set('sortBy', rest.sortBy)
      if (rest.sortOrder) searchParams.set('sortOrder', rest.sortOrder)
      if (rest.filters) {
        for (const [key, value] of Object.entries(rest.filters)) {
          searchParams.set(key, value)
        }
      }
      return api.get<ReportResponse<T>>(`/reporting/${slug}?${searchParams}`)
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    enabled: !!(startDate && endDate),
  })
}

// -- Export Helper --

export async function downloadReportExport(
  slug: string,
  params: ReportQueryParams,
  format: 'csv' | 'pdf',
): Promise<void> {
  const { startDate, endDate, ...rest } = params
  const searchParams = new URLSearchParams({ startDate, endDate, format })
  if (rest.viewScope) searchParams.set('viewScope', rest.viewScope)
  if (rest.page !== undefined) searchParams.set('page', String(rest.page))
  if (rest.pageSize !== undefined) searchParams.set('pageSize', String(rest.pageSize))
  if (rest.sortBy) searchParams.set('sortBy', rest.sortBy)
  if (rest.sortOrder) searchParams.set('sortOrder', rest.sortOrder)
  if (rest.filters) {
    for (const [key, value] of Object.entries(rest.filters)) {
      searchParams.set(key, value)
    }
  }

  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {}
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  const impersonateUserId =
    typeof window !== 'undefined' ? localStorage.getItem('impersonate-user-id') : null
  if (impersonateUserId) {
    headers['X-Impersonate-User-Id'] = impersonateUserId
  }

  const response = await fetch(
    `${API_URL}/reporting/${slug}/export?${searchParams}`,
    { method: 'GET', headers },
  )

  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}-${startDate}-${endDate}.${format}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
