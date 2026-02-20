'use client'

import { formatDistanceToNow } from 'date-fns'
import { History } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { useItineraryVersions } from '@/hooks/use-itinerary-versions'

interface ItineraryVersionHistoryProps {
  tripId: string
  itineraryId: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ItineraryVersionHistory({
  tripId,
  itineraryId,
  open,
  onOpenChange,
}: ItineraryVersionHistoryProps) {
  const { data: versions, isLoading } = useItineraryVersions(tripId, itineraryId)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Version History
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-md bg-ash-100 animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && (!versions || versions.length === 0) && (
            <p className="text-sm text-ash-500 py-4 text-center">
              No versions published yet.
            </p>
          )}

          {versions?.map((version) => (
            <div
              key={version.id}
              className="border border-ash-200 rounded-md p-3 space-y-1"
            >
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs">
                  v{version.versionNumber}
                </Badge>
                <span className="text-xs text-ash-500">
                  {formatDistanceToNow(new Date(version.publishedAt), { addSuffix: true })}
                </span>
              </div>
              {version.changeSummary && (
                <p className="text-sm text-ash-700">{version.changeSummary}</p>
              )}
              {version.publishedByName && (
                <p className="text-xs text-ash-500">
                  Published by {version.publishedByName}
                </p>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
