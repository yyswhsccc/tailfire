'use client'

/**
 * Service Fees Panel Component
 *
 * Displays a list of service fees for a trip with management actions:
 * - Create new service fee
 * - Send/mark paid/refund/cancel
 * - Stripe invoice integration
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  MoreHorizontal,
  Send,
  CreditCard,
  RefreshCw,
  XCircle,
  ExternalLink,
  FileText,
} from 'lucide-react'
import { format } from 'date-fns'
import {
  useServiceFees,
  useCreateServiceFee,
  useSendServiceFee,
  useMarkServiceFeePaid,
  useRefundServiceFee,
  useCancelServiceFee,
  useCreateStripeInvoice,
} from '@/hooks/use-service-fees'
import type { ServiceFeeResponseDto, ServiceFeeStatus } from '@tailfire/shared-types/api'

// Format cents to display currency
function formatCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

// Status badge colors
const statusColors: Record<ServiceFeeStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  partially_refunded: 'bg-yellow-100 text-yellow-800',
  refunded: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-800',
}

interface ServiceFeesPanelProps {
  tripId: string
  agencyId?: string
  currency?: string
}

export function ServiceFeesPanel({
  tripId,
  agencyId,
  currency = 'CAD',
}: ServiceFeesPanelProps) {
  const { data: serviceFees, isLoading } = useServiceFees(tripId)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-ash-500">
        Loading service fees...
      </div>
    )
  }

  const fees = serviceFees ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ash-900">Service Fees</h3>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Fee
            </Button>
          </DialogTrigger>
          <CreateServiceFeeDialog
            tripId={tripId}
            currency={currency}
            onClose={() => setIsCreateDialogOpen(false)}
          />
        </Dialog>
      </div>

      {/* Fees Table */}
      {fees.length === 0 ? (
        <div className="p-8 border border-dashed border-ash-200 rounded-lg text-center">
          <FileText className="mx-auto h-12 w-12 text-ash-400" />
          <h4 className="mt-4 text-sm font-medium text-ash-900">No service fees</h4>
          <p className="mt-1 text-sm text-ash-500">
            Get started by adding a service fee to this trip.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Service Fee
          </Button>
        </div>
      ) : (
        <div className="border border-ash-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fees.map((fee) => (
                <ServiceFeeRow
                  key={fee.id}
                  fee={fee}
                  tripId={tripId}
                  agencyId={agencyId}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Summary */}
      {fees.length > 0 && (
        <ServiceFeesSummary fees={fees} currency={currency} />
      )}
    </div>
  )
}

// Individual fee row with actions
function ServiceFeeRow({
  fee,
  tripId,
  agencyId,
}: {
  fee: ServiceFeeResponseDto
  tripId: string
  agencyId?: string
}) {
  const sendFee = useSendServiceFee(tripId)
  const markPaid = useMarkServiceFeePaid(tripId)
  const refundFee = useRefundServiceFee(tripId)
  const cancelFee = useCancelServiceFee(tripId)
  const createInvoice = useCreateStripeInvoice(tripId)

  const canSend = fee.status === 'draft'
  const canMarkPaid = fee.status === 'sent'
  const canRefund = fee.status === 'paid' || fee.status === 'partially_refunded'
  const canCancel = fee.status === 'draft' || fee.status === 'sent'
  const canCreateInvoice = fee.status === 'draft' && agencyId

  const handleSend = () => {
    sendFee.mutate(fee.id)
  }

  const handleMarkPaid = () => {
    markPaid.mutate({ serviceFeeId: fee.id })
  }

  const handleCancel = () => {
    cancelFee.mutate(fee.id)
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{fee.title}</TableCell>
      <TableCell className="text-right font-mono">
        {formatCents(fee.amountCents, fee.currency)}
      </TableCell>
      <TableCell>
        {fee.dueDate ? format(new Date(fee.dueDate), 'MMM d, yyyy') : '-'}
      </TableCell>
      <TableCell>
        <Badge className={statusColors[fee.status as ServiceFeeStatus]}>
          {fee.status.replace('_', ' ')}
        </Badge>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canSend && (
              <DropdownMenuItem onClick={handleSend}>
                <Send className="mr-2 h-4 w-4" />
                Mark as Sent
              </DropdownMenuItem>
            )}
            {canCreateInvoice && (
              <DropdownMenuItem
                onClick={() => {
                  // This would open a dialog to collect recipient info
                  // For simplicity, showing a placeholder
                  createInvoice.mutate({
                    serviceFeeId: fee.id,
                    agencyId: agencyId!,
                    recipientEmail: 'client@example.com',
                    recipientName: 'Client Name',
                  })
                }}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Create Stripe Invoice
              </DropdownMenuItem>
            )}
            {canMarkPaid && (
              <DropdownMenuItem onClick={handleMarkPaid}>
                <CreditCard className="mr-2 h-4 w-4" />
                Mark as Paid
              </DropdownMenuItem>
            )}
            {canRefund && (
              <DropdownMenuItem
                onClick={() =>
                  refundFee.mutate({
                    serviceFeeId: fee.id,
                    data: { reason: 'Customer request' },
                  })
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Process Refund
              </DropdownMenuItem>
            )}
            {fee.stripeHostedInvoiceUrl && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a
                    href={fee.stripeHostedInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Invoice
                  </a>
                </DropdownMenuItem>
              </>
            )}
            {canCancel && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleCancel}
                  className="text-red-600"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel Fee
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

// Create service fee dialog
function CreateServiceFeeDialog({
  tripId,
  currency,
  onClose,
}: {
  tripId: string
  currency: string
  onClose: () => void
}) {
  const createFee = useCreateServiceFee(tripId)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = () => {
    const amountCents = Math.round(parseFloat(amount) * 100)
    createFee.mutate(
      {
        title,
        amountCents,
        currency,
        description: description || undefined,
      },
      {
        onSuccess: () => {
          onClose()
          setTitle('')
          setAmount('')
          setDescription('')
        },
      }
    )
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add Service Fee</DialogTitle>
        <DialogDescription>
          Create a new service fee for this trip.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Planning Fee"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount">Amount ({currency})</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional details about this fee..."
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!title || !amount || createFee.isPending}
        >
          {createFee.isPending ? 'Creating...' : 'Create Fee'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// Summary section
function ServiceFeesSummary({
  fees,
  currency,
}: {
  fees: ServiceFeeResponseDto[]
  currency: string
}) {
  const totalAmount = fees.reduce((sum, fee) => sum + fee.amountCents, 0)
  const totalCollected = fees
    .filter((f) => f.status === 'paid' || f.status === 'partially_refunded')
    .reduce((sum, fee) => sum + fee.amountCents - (fee.refundedAmountCents ?? 0), 0)
  const totalPending = fees
    .filter((f) => f.status === 'draft' || f.status === 'sent')
    .reduce((sum, fee) => sum + fee.amountCents, 0)

  return (
    <div className="grid grid-cols-3 gap-4 p-4 bg-ash-50 rounded-lg">
      <div>
        <p className="text-sm text-ash-500">Total Fees</p>
        <p className="text-lg font-semibold text-ash-900">
          {formatCents(totalAmount, currency)}
        </p>
      </div>
      <div>
        <p className="text-sm text-ash-500">Collected</p>
        <p className="text-lg font-semibold text-green-600">
          {formatCents(totalCollected, currency)}
        </p>
      </div>
      <div>
        <p className="text-sm text-ash-500">Pending</p>
        <p className="text-lg font-semibold text-blue-600">
          {formatCents(totalPending, currency)}
        </p>
      </div>
    </div>
  )
}
