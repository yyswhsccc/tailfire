import { BarChart3 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'

export default function ReportingPage() {
  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="rounded-full bg-ash-100 p-4 mb-4">
          <BarChart3 className="h-8 w-8 text-ash-400" />
        </div>
        <h1 className="text-2xl font-semibold text-ash-900 mb-2">Reporting</h1>
        <p className="text-ash-500 max-w-md">
          Business reports and analytics are in development. This section will include sales reports, booking trends, and performance metrics.
        </p>
      </div>
    </DashboardLayout>
  )
}
