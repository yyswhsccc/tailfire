'use client'

import { useState, useMemo } from 'react'
import { usePendingReceivables } from '@/hooks/use-commission'
import { useSuppliers } from '@/hooks/use-suppliers'
import { useDebounce } from '@/hooks/use-debounce'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PendingReceivableDto, PendingReceivablesFilterDto } from '@tailfire/shared-types/api'

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  return new Date(dateStr).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface PendingReceivablesTableProps {
  depositTotalCents: number
  matchedIds: Set<string>
  onSelectItem: (item: PendingReceivableDto) => void
  onAutoMatch: (items: PendingReceivableDto[]) => void
}

export function PendingReceivablesTable({
  depositTotalCents,
  matchedIds,
  onSelectItem,
  onAutoMatch,
}: PendingReceivablesTableProps) {
  const { data: suppliersData } = useSuppliers({ limit: 100 })
  const suppliers = suppliersData?.suppliers ?? []

  // Filter state
  const [supplierId, setSupplierId] = useState('')
  const [search, setSearch] = useState('')
  const [departureDateFrom, setDepartureDateFrom] = useState('')
  const [departureDateTo, setDepartureDateTo] = useState('')
  const [showAll, setShowAll] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  const filter: PendingReceivablesFilterDto = useMemo(() => ({
    supplierId: supplierId && supplierId !== '__none__' ? supplierId : undefined,
    search: debouncedSearch || undefined,
    departureDateFrom: departureDateFrom || undefined,
    departureDateTo: departureDateTo || undefined,
    status: showAll ? 'all' : 'pending',
    limit: 100,
  }), [supplierId, debouncedSearch, departureDateFrom, departureDateTo, showAll])

  const { data, isLoading } = usePendingReceivables(filter)

  // Filter out already-matched items
  const visibleItems = useMemo(() => {
    if (!data?.data) return []
    return data.data.filter((item) => !matchedIds.has(item.activityPricingId))
  }, [data?.data, matchedIds])

  const filteredTotalCents = data?.filteredTotalCents ?? 0

  // Compute visible total (excluding already-matched) for auto-match logic
  const visibleTotalCents = useMemo(
    () => visibleItems.reduce((sum, item) => sum + item.expectedCommissionCents, 0),
    [visibleItems]
  )

  const canAutoMatch =
    depositTotalCents > 0 &&
    visibleItems.length > 0 &&
    visibleTotalCents === depositTotalCents

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Supplier</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <Input
            className="h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Booking ref, passenger, trip..."
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Departure from</Label>
          <Input
            className="h-9"
            type="date"
            value={departureDateFrom}
            onChange={(e) => setDepartureDateFrom(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Departure to</Label>
          <Input
            className="h-9"
            type="date"
            value={departureDateTo}
            onChange={(e) => setDepartureDateTo(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant={showAll ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show All' : 'Pending Only'}
        </Button>

        {canAutoMatch && (
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => onAutoMatch(visibleItems)}
          >
            Auto-Match All ({visibleItems.length} items = {formatCurrency(visibleTotalCents)})
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading receivables...</p>
      ) : visibleItems.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No pending receivables found.</p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Booking Ref</TableHead>
                <TableHead>Passenger</TableHead>
                <TableHead>Trip</TableHead>
                <TableHead>Departure</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map((item) => (
                <TableRow key={item.activityPricingId}>
                  <TableCell className="font-mono text-sm">
                    {item.confirmationNumber || '\u2014'}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {item.passengerNames.length > 0 ? item.passengerNames.join(', ') : '\u2014'}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    <a
                      href={`/trips/${item.tripId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {item.tripName}
                    </a>
                  </TableCell>
                  <TableCell>{formatDate(item.tripStartDate)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.expectedCommissionCents)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        item.commissionStatus === 'received'
                          ? 'bg-green-50 text-green-700'
                          : item.commissionStatus === 'cancelled'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-yellow-50 text-yellow-700'
                      }
                    >
                      {item.commissionStatus ?? 'pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => onSelectItem(item)}>
                      Match
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Summary footer */}
      {data && (
        <p className="text-xs text-muted-foreground">
          Showing {visibleItems.length} of {data.pagination.total} receivables
          {filteredTotalCents > 0 && (
            <> &middot; Filtered total: {formatCurrency(filteredTotalCents)}</>
          )}
        </p>
      )}
    </div>
  )
}
