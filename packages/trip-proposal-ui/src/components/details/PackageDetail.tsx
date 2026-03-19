import { Package } from 'lucide-react'
import type { SharedPackageDetailDto } from '@tailfire/shared-types/api'
import { ActivityCard } from '../ActivityCard'

export function PackageDetail({
  detail,
  currency,
}: {
  detail: SharedPackageDetailDto
  currency: string
}) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-primary shrink-0" />
        {detail.supplierName && (
          <span className="text-muted-foreground">{detail.supplierName}</span>
        )}
      </div>
      {detail.childActivities.length > 0 && (
        <div className="pl-4 border-l border-border space-y-2">
          {detail.childActivities.map((child) => (
            <ActivityCard key={child.id} activity={child} currency={currency} nested />
          ))}
        </div>
      )}
    </div>
  )
}
