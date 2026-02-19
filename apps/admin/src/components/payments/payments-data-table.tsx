'use client'

/**
 * Payments Data Table
 *
 * Displays expected payment items and historical transactions for a trip.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ActivityIconBadge } from '@/components/ui/activity-icon-badge'
import { RecordPaymentModal } from '@/components/packages/record-payment-modal'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DollarSign, Trash2, User } from 'lucide-react'
import { useTripExpectedPayments, useTripPaymentTransactions, useDeletePaymentTransactionFromTrip, useUpdateTransactionContact } from '@/hooks/use-payment-schedules'
import { useTripTravelers } from '@/hooks/use-trip-travelers'
import { useBookingStatus } from '@/hooks/use-booking-status'
import { formatCurrency } from '@/lib/pricing/currency-helpers'

import type { ActivityResponseDto } from '@tailfire/shared-types'
import type { TripExpectedPaymentDto, TripPaymentTransactionDto } from '@tailfire/shared-types/api'

function formatDate(date: string | null): string {
  if (!date) return '–'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusBadgeVariant(status: TripExpectedPaymentDto['status']): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'paid':
      return 'secondary'
    case 'partial':
    case 'overdue':
      return 'default'
    case 'pending':
    default:
      return 'outline'
  }
}

interface PaymentsDataTableProps {
  activities: ActivityResponseDto[]
  currency: string
  tripId: string
}

export function PaymentsDataTable({ activities, tripId }: PaymentsDataTableProps) {
  const router = useRouter()
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const [selectedPayment, setSelectedPayment] = React.useState<TripExpectedPaymentDto | null>(null)
  const [recordPaymentOpen, setRecordPaymentOpen] = React.useState(false)
  const [selectedTransaction, setSelectedTransaction] = React.useState<TripPaymentTransactionDto | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = React.useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)
  const deleteTransaction = useDeletePaymentTransactionFromTrip(tripId)
  const updateTransactionContact = useUpdateTransactionContact(tripId)

  const { data: expectedPayments = [] } = useTripExpectedPayments(tripId)
  const { data: paymentTransactions = [] } = useTripPaymentTransactions(tripId)
  const { data: bookingStatus } = useBookingStatus(tripId)
  const { data: travelers = [] } = useTripTravelers(tripId)

  // Build deduplicated contact options for "Paid By" dropdown on transactions
  const contactOptions = React.useMemo(() => {
    const seen = new Set<string>()
    const options: { id: string; name: string; isPrimary: boolean }[] = []

    for (const traveler of travelers) {
      if (!traveler.contactId || seen.has(traveler.contactId)) continue
      seen.add(traveler.contactId)
      const name = traveler.contact
        ? `${traveler.contact.firstName || ''} ${traveler.contact.lastName || ''}`.trim()
        : `Traveler ${traveler.sequenceOrder}`
      if (name) {
        options.push({
          id: traveler.contactId,
          name,
          isPrimary: traveler.isPrimaryTraveler ?? false,
        })
      }
    }

    return options
  }, [travelers])

  const sortedTransactions = React.useMemo(() => {
    return [...paymentTransactions].sort((a, b) => {
      return new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
    })
  }, [paymentTransactions])

  const parentActivities = React.useMemo(
    () => activities.filter((activity) => !activity.parentActivityId),
    [activities]
  )

  const missingScheduleActivities = React.useMemo(() => {
    if (!bookingStatus?.activities) return []
    return parentActivities.filter((activity) => {
      const status = bookingStatus.activities[activity.id]
      if (!status) return false
      return Boolean(activity.pricing) && !status.hasPaymentSchedule
    })
  }, [parentActivities, bookingStatus])

  const handleRowClick = (activityId: string, event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('button') || target.closest('a')) {
      return
    }

    if (!activityId || !tripId) {
      console.warn('Missing activityId or tripId for navigation', { activityId, tripId })
      return
    }

    router.push(`/trips/${tripId}/activities/${activityId}/edit?tab=booking`)
  }

  const handleRecordPayment = (payment: TripExpectedPaymentDto) => {
    setSelectedPayment(payment)
    setRecordPaymentOpen(true)
  }

  const expectedPaymentsColumns: ColumnDef<TripExpectedPaymentDto>[] = [
    {
      accessorKey: 'activityName',
      header: 'Item',
      cell: ({ row }) => {
        const payment = row.original
        return (
          <div className="flex items-center gap-2">
            <ActivityIconBadge type={payment.activityType} size="md" />
            <div>
              <div className="font-medium">{payment.activityName}</div>
              <div className="text-xs text-gray-500">{payment.paymentName}</div>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'paymentName',
      header: 'Payment',
      cell: ({ row }) => <span className="text-gray-600">{row.original.paymentName}</span>,
    },
    {
      accessorKey: 'dueDate',
      header: 'Due',
      cell: ({ row }) => <span className="text-gray-500">{formatDate(row.original.dueDate)}</span>,
    },
    {
      accessorKey: 'expectedAmountCents',
      header: 'Expected',
      cell: ({ row }) => (
        <span className="font-medium">
          {formatCurrency(row.original.expectedAmountCents, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'remainingCents',
      header: 'Remaining',
      cell: ({ row }) => (
        <span className="text-amber-600">
          {formatCurrency(row.original.remainingCents, row.original.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={statusBadgeVariant(row.original.status)}>{row.original.status}</Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const payment = row.original
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRecordPayment(payment)}
            disabled={payment.isLocked}
          >
            Record Payment
          </Button>
        )
      },
    },
  ]

  const table = useReactTable({
    data: expectedPayments,
    columns: expectedPaymentsColumns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  })

  return (
    <div className="space-y-6">
      {missingScheduleActivities.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Missing Payment Schedules</h2>
            <p className="text-sm text-gray-500">
              These activities have pricing but no payment schedule configured.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {missingScheduleActivities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2">
                  <ActivityIconBadge type={activity.activityType} size="md" />
                  <div>
                    <div className="font-medium">{activity.name}</div>
                    <div className="text-xs text-gray-500">Schedule not configured</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/trips/${tripId}/activities/${activity.id}/edit?tab=booking`)}
                >
                  Configure Schedule
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expected Payments Section */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Expected Payments</h2>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    onClick={(e) => handleRowClick(row.original.activityId, e)}
                    className="cursor-pointer hover:bg-gray-50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={expectedPaymentsColumns.length} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center py-12">
                      <DollarSign className="h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-sm text-gray-500">No expected payments yet</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Payments will appear here once you set up payment schedules
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Past Payments Section */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Past Payments and Authorizations</h2>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid By</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTransactions.length ? (
                sortedTransactions.map((transaction) => (
                  <TableRow
                    key={transaction.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => {
                      setSelectedTransaction(transaction)
                      setDetailDialogOpen(true)
                    }}
                  >
                    <TableCell>{formatDate(transaction.transactionDate)}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{transaction.activityName}</div>
                      <div className="text-xs text-gray-500">{transaction.paymentName}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{transaction.transactionType}</Badge>
                    </TableCell>
                    <TableCell>
                      {formatCurrency(transaction.amountCents, transaction.currency)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={transaction.contactId ?? 'unknown'}
                        onValueChange={(value) => {
                          const newContactId = value === 'unknown' ? null : value
                          if (newContactId === transaction.contactId) return
                          updateTransactionContact.mutate({
                            transactionId: transaction.id,
                            contactId: newContactId,
                          })
                        }}
                        disabled={updateTransactionContact.isPending}
                      >
                        <SelectTrigger
                          className="h-8 w-[160px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SelectValue>
                            {transaction.contactName ? (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {transaction.contactName}
                              </span>
                            ) : (
                              <span className="text-gray-400">Unknown</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent onClick={(e) => e.stopPropagation()}>
                          <SelectItem value="unknown">Unknown</SelectItem>
                          {contactOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}{option.isPrimary ? ' (primary)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{transaction.paymentMethod || '—'}</TableCell>
                    <TableCell>{transaction.referenceNumber || '—'}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center py-12">
                      <DollarSign className="h-12 w-12 text-gray-400 mb-4" />
                      <p className="text-sm text-gray-500">No past payments recorded yet</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Payment history will appear here once payments are recorded
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedPayment && (
        <RecordPaymentModal
          open={recordPaymentOpen}
          onOpenChange={(open) => {
            setRecordPaymentOpen(open)
            if (!open) {
              setSelectedPayment(null)
            }
          }}
          expectedPaymentItem={selectedPayment}
          activityPricingId={selectedPayment.activityPricingId}
          tripId={tripId}
          currency={selectedPayment.currency}
        />
      )}

      {/* Transaction Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => {
        setDetailDialogOpen(open)
        if (!open) {
          setSelectedTransaction(null)
          setDeleteConfirmOpen(false)
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Activity</p>
                  <p className="font-medium">{selectedTransaction.activityName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Payment</p>
                  <p className="font-medium">{selectedTransaction.paymentName}</p>
                </div>
                <div>
                  <p className="text-gray-500">Type</p>
                  <Badge variant="outline">{selectedTransaction.transactionType}</Badge>
                </div>
                <div>
                  <p className="text-gray-500">Amount</p>
                  <p className="font-medium">
                    {formatCurrency(selectedTransaction.amountCents, selectedTransaction.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Paid By</p>
                  <p className="font-medium">{selectedTransaction.contactName || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Payment Method</p>
                  <p className="font-medium">{selectedTransaction.paymentMethod || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Reference</p>
                  <p className="font-medium">{selectedTransaction.referenceNumber || 'None'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Transaction Date</p>
                  <p className="font-medium">{formatDate(selectedTransaction.transactionDate)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Created</p>
                  <p className="font-medium">{formatDate(selectedTransaction.createdAt)}</p>
                </div>
              </div>
              {selectedTransaction.notes && (
                <div className="text-sm">
                  <p className="text-gray-500">Notes</p>
                  <p className="font-medium">{selectedTransaction.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex justify-between sm:justify-between">
            {!deleteConfirmOpen ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                  Close
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-destructive self-center">Are you sure? This cannot be undone.</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (selectedTransaction) {
                        deleteTransaction.mutate(selectedTransaction.id, {
                          onSuccess: () => {
                            setDetailDialogOpen(false)
                            setSelectedTransaction(null)
                            setDeleteConfirmOpen(false)
                          },
                        })
                      }
                    }}
                    disabled={deleteTransaction.isPending}
                  >
                    {deleteTransaction.isPending ? 'Deleting...' : 'Confirm Delete'}
                  </Button>
                </div>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
