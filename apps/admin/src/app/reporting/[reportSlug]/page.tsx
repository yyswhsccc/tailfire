'use client'

import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout'
import { ReportView } from '../_components/report-view'

export default function ReportPage() {
  const params = useParams()
  const reportSlug = params.reportSlug as string

  return (
    <DashboardLayout>
      <ReportView slug={reportSlug} />
    </DashboardLayout>
  )
}
