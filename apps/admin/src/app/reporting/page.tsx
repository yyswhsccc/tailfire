'use client'

import { BarChart3, Loader2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'
import { useReportCatalog } from '@/hooks/use-reporting'
import { ReportCatalog } from './_components/report-catalog'

export default function ReportingPage() {
  const { data: reports, isLoading, isError } = useReportCatalog()

  return (
    <DashboardLayout>
      <div className="px-6 py-8 max-w-6xl mx-auto w-full">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <BarChart3 className="h-6 w-6 text-ash-700" />
            <h1 className="text-2xl font-semibold text-ash-900">Reporting</h1>
          </div>
          <p className="text-ash-500 text-sm">
            Business reports and analytics for your agency.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center min-h-[40vh]">
            <Loader2 className="h-6 w-6 animate-spin text-ash-400" />
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center min-h-[40vh]">
            <p className="text-ash-500 text-sm">Failed to load reports. Please try again.</p>
          </div>
        )}

        {reports && <ReportCatalog reports={reports} />}
      </div>
    </DashboardLayout>
  )
}
