import { Percent } from 'lucide-react'

export default function CommissionPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="rounded-full bg-ash-100 p-4 mb-4">
        <Percent className="h-8 w-8 text-ash-400" />
      </div>
      <h1 className="text-2xl font-semibold text-ash-900 mb-2">Commission</h1>
      <p className="text-ash-500 max-w-md">
        Commission tracking is in development. This section will let you view and manage supplier commissions, payment schedules, and settlement reports.
      </p>
    </div>
  )
}
