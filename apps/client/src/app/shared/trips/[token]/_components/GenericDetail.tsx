import { MoreHorizontal } from 'lucide-react'

export function GenericDetail() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <MoreHorizontal className="h-4 w-4 shrink-0" />
      <span>Details pending</span>
    </div>
  )
}
