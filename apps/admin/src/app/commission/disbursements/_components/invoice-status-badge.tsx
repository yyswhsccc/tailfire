import { Badge } from '@/components/ui/badge'

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft:     { label: 'Draft',     variant: 'outline' },
  submitted: { label: 'Submitted', variant: 'default' },
  approved:  { label: 'Approved',  variant: 'secondary' },
  rejected:  { label: 'Rejected',  variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const config = STATUS_LABELS[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
