'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/hooks/use-user'
import { useReport, useReportCatalog } from '@/hooks/use-reporting'
import { DateRangePicker } from './date-range-picker'
import { ReportTable, type ReportColumnDef } from './report-table'
import { ReportExportButtons } from './report-export-buttons'
import { ReportFilters } from './report-filters'
import type { DatePreset, ReportQueryParams } from '@tailfire/shared-types/api'

interface ReportViewProps {
  slug: string
}

/** Derive column definitions from first data row */
function deriveColumns(data: Record<string, unknown>[]): ReportColumnDef[] {
  if (data.length === 0) return []
  const sample = data[0]
  return Object.keys(sample).map((key) => {
    const isCents = /[Cc]ents$/.test(key) || /[Pp]rice$/.test(key)
    const isCount = /[Cc]ount$/.test(key) || /[Rr]ate$/.test(key) || /[Ss]core$/.test(key)
    return {
      key,
      label: key
        // camelCase to Title Case
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim(),
      align: (isCents || isCount ? 'right' : 'left') as 'left' | 'right',
      mono: isCents,
    }
  })
}

function computeInitialDates(): { startDate: string; endDate: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  return {
    startDate: new Date(year, month, 1).toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  }
}

export function ReportView({ slug }: ReportViewProps) {
  const { isAdmin } = useUser()
  const { data: catalog } = useReportCatalog()

  const reportDef = useMemo(
    () => catalog?.find((r) => r.slug === slug),
    [catalog, slug],
  )

  // State
  const initial = useMemo(() => computeInitialDates(), [])
  const [startDate, setStartDate] = useState(initial.startDate)
  const [endDate, setEndDate] = useState(initial.endDate)
  const [preset, setPreset] = useState<DatePreset>('mtd')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [sortBy, setSortBy] = useState<string | undefined>()
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [viewScope, setViewScope] = useState<'my' | 'agency'>('agency')
  const [filters, setFilters] = useState<Record<string, string>>({})

  // Build query params
  const queryParams = useMemo<ReportQueryParams>(
    () => ({
      startDate,
      endDate,
      viewScope,
      page,
      pageSize,
      sortBy,
      sortOrder,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    }),
    [startDate, endDate, viewScope, page, pageSize, sortBy, sortOrder, filters],
  )

  const { data: reportData, isLoading, isError, isFetching } = useReport(slug, queryParams)

  // Derive columns from data
  const columns = useMemo<ReportColumnDef[]>(() => {
    const rows = (reportData?.data ?? []) as Record<string, unknown>[]
    return deriveColumns(rows)
  }, [reportData?.data])

  const totalPages = useMemo(() => {
    if (!reportData) return 1
    return Math.max(1, Math.ceil(reportData.totalRows / reportData.pageSize))
  }, [reportData])

  const handleDateChange = useCallback(
    (newStart: string, newEnd: string, newPreset: DatePreset) => {
      setStartDate(newStart)
      setEndDate(newEnd)
      setPreset(newPreset)
      setPage(1) // Reset to page 1 on date change
    },
    [],
  )

  const handleSort = useCallback(
    (columnKey: string) => {
      if (sortBy === columnKey) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortBy(columnKey)
        setSortOrder('asc')
      }
      setPage(1)
    },
    [sortBy],
  )

  const handleFiltersChange = useCallback(
    (newFilters: Record<string, string>) => {
      setFilters(newFilters)
      setPage(1)
    },
    [],
  )

  // Loading catalog
  if (!catalog) {
    return (
      <div className="px-6 py-8 max-w-7xl mx-auto w-full space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/reporting">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-ash-900 truncate">
              {reportDef?.name ?? slug}
            </h1>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {reportDef?.description && (
            <p className="text-sm text-ash-500 mt-0.5">{reportDef.description}</p>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            preset={preset}
            onChange={handleDateChange}
          />
          <div className="flex flex-wrap items-center gap-3">
            {/* My / Agency toggle — admin only, and only when report supports it */}
            {isAdmin && reportDef?.supportsMyToggle && (
              <div className="flex rounded-md border">
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-l-md transition-colors ${
                    viewScope === 'my' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                  onClick={() => { setViewScope('my'); setPage(1) }}
                >
                  My
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-r-md transition-colors ${
                    viewScope === 'agency' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                  onClick={() => { setViewScope('agency'); setPage(1) }}
                >
                  Agency
                </button>
              </div>
            )}
            <ReportFilters
              slug={slug}
              filters={filters}
              onChange={handleFiltersChange}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-4">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">Failed to load report data. Please try again.</p>
        </div>
      )}

      {/* Summary metrics */}
      {reportData?.summary && Object.keys(reportData.summary).length > 0 && (
        <div className="flex flex-wrap gap-4">
          {Object.entries(reportData.summary).map(([key, value]) => {
            const isCents = /[Cc]ents$/.test(key) || /[Pp]rice$/.test(key)
            const displayValue = isCents
              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                  Number(value) / 100,
                )
              : String(value)
            const displayLabel = key
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (s) => s.toUpperCase())
              .trim()

            return (
              <div key={key} className="rounded-md border bg-muted/30 px-4 py-2">
                <p className="text-xs text-muted-foreground">{displayLabel}</p>
                <p className="text-lg font-semibold font-mono tabular-nums">{displayValue}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Table */}
      <ReportTable
        columns={columns}
        data={(reportData?.data ?? []) as Record<string, unknown>[]}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        isLoading={isLoading}
      />

      {/* Footer: Pagination + Export */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* Row count */}
          {reportData && (
            <p className="text-xs text-muted-foreground">
              {reportData.totalRows.toLocaleString()} row{reportData.totalRows !== 1 ? 's' : ''}
            </p>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        <ReportExportButtons
          slug={slug}
          params={queryParams}
          disabled={isLoading || !reportData}
        />
      </div>
    </div>
  )
}
