import { ReportResponse, ReportDateRange, SummaryItem } from '@tailfire/shared-types'

export function buildReportResponse<T>(params: {
  slug: string
  name: string
  dateRange: ReportDateRange
  viewScope: 'my' | 'agency'
  data: T[]
  totalRows: number
  page: number
  pageSize: number
  summary?: Record<string, number | string>
  summaryItems?: SummaryItem[]
  totals?: Record<string, number | null>
}): ReportResponse<T> {
  return {
    reportSlug: params.slug,
    reportName: params.name,
    generatedAt: new Date().toISOString(),
    dateRange: params.dateRange,
    viewScope: params.viewScope,
    totalRows: params.totalRows,
    page: params.page,
    pageSize: params.pageSize,
    data: params.data,
    summary: params.summary,
    summaryItems: params.summaryItems,
    totals: params.totals,
  }
}
