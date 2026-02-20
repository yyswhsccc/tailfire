'use client'

/**
 * Payment Schedule Section Component
 *
 * Component-level payment schedule management UI.
 * Supports three schedule types: In Full, Deposit + Final Balance, Set Installments
 *
 * Existing schedules: Inline-editable rows (name, amount, due date) with add/delete.
 * New schedules: Auto-calculated rows with schedule type config, then bulk save.
 */

import { useState, useEffect } from 'react'
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
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon, DollarSign, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  usePaymentSchedule,
  useCreatePaymentSchedule,
  useUpdatePaymentSchedule,
  useUpdateExpectedPaymentItem,
  useAddExpectedPaymentItem,
  useDeleteExpectedPaymentItem,
} from '@/hooks/use-payment-schedules'
import {
  calculateDeposit,
  generateDepositSchedule,
  generateInstallmentSchedule,
  dollarsToCents,
  centsToDollars,
} from '@/lib/payment-calculations'
import { formatCurrency } from '@/lib/pricing/currency-helpers'
import { RecordPaymentModal } from '@/components/packages/record-payment-modal'
import type {
  ScheduleType,
  DepositType,
  CreateExpectedPaymentItemDto,
  ExpectedPaymentItemDto,
} from '@tailfire/shared-types/api'

const NUMERIC_INPUT_CLASS = 'text-right'

interface PaymentScheduleSectionProps {
  /** Activity pricing ID (canonical name). Maps to component_pricing_id in DB. */
  activityPricingId: string | null
  totalPriceCents: number
  currency: string
  /** Trip ID for contact picker in Record Payment modal */
  tripId?: string
}

/**
 * Inline-editable row for an existing expected payment item.
 * Saves individual field changes on blur via PATCH endpoint.
 */
function EditablePaymentRow({
  item,
  index,
  currency,
  activityPricingId,
  onRecordPayment,
  onDelete,
  isDeleting,
}: {
  item: ExpectedPaymentItemDto
  index: number
  currency: string
  activityPricingId: string
  onRecordPayment: (item: ExpectedPaymentItemDto) => void
  onDelete: (itemId: string) => void
  isDeleting: boolean
}) {
  const updateItem = useUpdateExpectedPaymentItem(activityPricingId)

  // Local state for inline editing
  const [editName, setEditName] = useState(item.paymentName)
  const [editAmountDollars, setEditAmountDollars] = useState(centsToDollars(item.expectedAmountCents))
  const [isEditingAmount, setIsEditingAmount] = useState(false)

  // Sync local state when item changes from server
  useEffect(() => {
    setEditName(item.paymentName)
    setEditAmountDollars(centsToDollars(item.expectedAmountCents))
  }, [item.paymentName, item.expectedAmountCents])

  const handleNameBlur = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== item.paymentName) {
      updateItem.mutate({ itemId: item.id, data: { paymentName: trimmed } })
    } else {
      setEditName(item.paymentName)
    }
  }

  const handleAmountBlur = () => {
    setIsEditingAmount(false)
    const newCents = dollarsToCents(parseFloat(editAmountDollars) || 0)
    if (newCents !== item.expectedAmountCents && newCents >= 0) {
      if (newCents < item.paidAmountCents) {
        // Reset to current value — backend would reject this anyway
        setEditAmountDollars(centsToDollars(item.expectedAmountCents))
        return
      }
      updateItem.mutate({ itemId: item.id, data: { expectedAmountCents: newCents } })
    } else {
      setEditAmountDollars(centsToDollars(item.expectedAmountCents))
    }
  }

  const handleDateChange = (date: Date | undefined) => {
    const newDate = date ? format(date, 'yyyy-MM-dd') : null
    if (newDate === item.dueDate) return // no-op guard
    updateItem.mutate({ itemId: item.id, data: { dueDate: newDate } })
  }

  const paidAmountCents = item.paidAmountCents || 0
  const remainingCents = item.expectedAmountCents - paidAmountCents
  const isMutating = updateItem.isPending

  return (
    <TableRow className={cn(isMutating && 'opacity-60 pointer-events-none')}>
      <TableCell className="text-sm text-ash-500">{index + 1}</TableCell>
      <TableCell>
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="h-8"
        />
      </TableCell>
      <TableCell>
        {isEditingAmount ? (
          <Input
            type="number"
            min={0}
            step="0.01"
            value={editAmountDollars}
            onChange={(e) => setEditAmountDollars(e.target.value)}
            onBlur={handleAmountBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className={`h-8 w-28 ${NUMERIC_INPUT_CLASS}`}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className={`font-medium ${NUMERIC_INPUT_CLASS} cursor-pointer hover:text-blue-600 transition-colors`}
            onClick={() => setIsEditingAmount(true)}
          >
            {formatCurrency(item.expectedAmountCents, currency)}
          </button>
        )}
      </TableCell>
      <TableCell>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'h-8 justify-start text-left font-normal',
                !item.dueDate && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {item.dueDate ? format(new Date(item.dueDate + 'T00:00:00'), 'PPP') : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={item.dueDate ? new Date(item.dueDate + 'T00:00:00') : undefined}
              onSelect={handleDateChange}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell>{getStatusBadge(item, currency)}</TableCell>
      <TableCell className={`${NUMERIC_INPUT_CLASS} text-sm`}>
        {paidAmountCents > 0 ? formatCurrency(paidAmountCents, currency) : '–'}
      </TableCell>
      <TableCell className={`${NUMERIC_INPUT_CLASS} text-sm`}>
        {remainingCents > 0 ? (
          <span className="text-amber-600 font-medium">{formatCurrency(remainingCents, currency)}</span>
        ) : remainingCents === 0 && paidAmountCents > 0 ? (
          <span className="text-green-600">–</span>
        ) : (
          '–'
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRecordPayment(item)}
            disabled={item.status === 'paid'}
          >
            <DollarSign className="h-3 w-3 mr-1" />
            Record
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.id)}
            disabled={paidAmountCents > 0 || isDeleting}
            className="text-ash-400 hover:text-red-600"
            title={paidAmountCents > 0 ? 'Cannot delete item with payments' : 'Delete payment item'}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

/**
 * Get payment status badge element
 */
function getStatusBadge(item: ExpectedPaymentItemDto | CreateExpectedPaymentItemDto, currency: string) {
  const paidAmountCents = 'paidAmountCents' in item ? (item.paidAmountCents || 0) : 0
  const expectedAmountCents = item.expectedAmountCents
  const status = 'status' in item ? item.status : 'pending'

  if (status === 'paid' || paidAmountCents >= expectedAmountCents) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Paid
      </span>
    )
  }
  if (status === 'partial' || (paidAmountCents > 0 && paidAmountCents < expectedAmountCents)) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        Partial ({formatCurrency(paidAmountCents, currency)})
      </span>
    )
  }
  if (status === 'overdue') {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        Overdue
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
      Pending
    </span>
  )
}

export function PaymentScheduleSection({
  activityPricingId,
  totalPriceCents,
  currency,
  tripId,
}: PaymentScheduleSectionProps) {
  const { data: existingSchedule, isLoading } = usePaymentSchedule(activityPricingId)
  const createSchedule = useCreatePaymentSchedule()
  const updateSchedule = useUpdatePaymentSchedule(activityPricingId || '')
  const addItem = useAddExpectedPaymentItem(activityPricingId || '')
  const deleteItem = useDeleteExpectedPaymentItem(activityPricingId || '')

  // Form state (only used for new schedules)
  const [scheduleType, setScheduleType] = useState<ScheduleType>('full')
  const [depositType, setDepositType] = useState<DepositType>('percentage')
  const [depositPercentage, setDepositPercentage] = useState<number>(50)
  const [depositAmountDollars, setDepositAmountDollars] = useState<number>(0)
  const [numberOfInstallments, setNumberOfInstallments] = useState<number>(3)
  const [expectedPayments, setExpectedPayments] = useState<CreateExpectedPaymentItemDto[]>([])

  // Payment modal state
  const [recordPaymentModalOpen, setRecordPaymentModalOpen] = useState(false)
  const [selectedPaymentItem, setSelectedPaymentItem] = useState<ExpectedPaymentItemDto | null>(null)

  // Load existing schedule data (sync schedule type for display)
  useEffect(() => {
    if (existingSchedule) {
      setScheduleType(existingSchedule.scheduleType)
      if (existingSchedule.depositType) {
        setDepositType(existingSchedule.depositType)
      }
      if (existingSchedule.depositPercentage) {
        setDepositPercentage(parseFloat(existingSchedule.depositPercentage))
      }
      if (existingSchedule.depositAmountCents) {
        setDepositAmountDollars(parseFloat(centsToDollars(existingSchedule.depositAmountCents)))
      }
    }
  }, [existingSchedule])

  // Auto-calculate expected payments when schedule type changes — ONLY for new schedules
  useEffect(() => {
    if (existingSchedule) return // Don't auto-recalculate for existing schedules

    if (scheduleType === 'full') {
      setExpectedPayments([
        {
          paymentName: 'Full Payment',
          expectedAmountCents: totalPriceCents,
          dueDate: null,
          sequenceOrder: 0,
        },
      ])
    } else if (scheduleType === 'deposit') {
      const depositValue = depositType === 'percentage' ? depositPercentage : dollarsToCents(depositAmountDollars)
      const items = generateDepositSchedule(totalPriceCents, depositType, depositValue)
      setExpectedPayments(items)
    } else if (scheduleType === 'installments') {
      const items = generateInstallmentSchedule(totalPriceCents, numberOfInstallments)
      setExpectedPayments(items)
    }
  }, [scheduleType, depositType, depositPercentage, depositAmountDollars, numberOfInstallments, totalPriceCents, existingSchedule])

  // Handle save (new schedule only)
  const handleSave = () => {
    if (!activityPricingId) return

    const data = {
      activityPricingId,
      scheduleType,
      allowPartialPayments: false,
      depositType: scheduleType === 'deposit' ? depositType : null,
      depositPercentage: scheduleType === 'deposit' && depositType === 'percentage' ? depositPercentage : null,
      depositAmountCents: scheduleType === 'deposit' && depositType === 'fixed_amount' ? dollarsToCents(depositAmountDollars) : null,
      expectedPaymentItems: expectedPayments,
    }

    if (existingSchedule) {
      updateSchedule.mutate(data)
    } else {
      createSchedule.mutate(data)
    }
  }

  // Handle add expected payment item
  const handleAddItem = () => {
    if (!existingSchedule || !activityPricingId) return

    const items = existingSchedule.expectedPaymentItems || []
    const totalExpected = items.reduce((sum, i) => sum + i.expectedAmountCents, 0)
    const outstandingCents = Math.max(0, totalPriceCents - totalExpected)
    const nextSeq = items.reduce((max, i) => Math.max(max, i.sequenceOrder), -1) + 1

    addItem.mutate({
      configId: existingSchedule.id,
      data: {
        paymentName: `Payment ${items.length + 1}`,
        expectedAmountCents: outstandingCents,
        dueDate: null,
        sequenceOrder: nextSeq,
      },
    })
  }

  // Handle delete expected payment item
  const handleDeleteItem = (itemId: string) => {
    deleteItem.mutate(itemId)
  }

  // Calculate deposit display (new schedule only)
  const depositCalculation = !existingSchedule && scheduleType === 'deposit'
    ? calculateDeposit(
        totalPriceCents,
        depositType,
        depositType === 'percentage' ? depositPercentage : dollarsToCents(depositAmountDollars)
      )
    : null

  // Helper to open record payment modal
  const handleRecordPayment = (item: ExpectedPaymentItemDto) => {
    setSelectedPaymentItem(item)
    setRecordPaymentModalOpen(true)
  }

  // Outstanding summary calculations for existing schedules
  const savedItems = existingSchedule?.expectedPaymentItems || []
  const totalExpectedCents = savedItems.reduce((sum, i) => sum + i.expectedAmountCents, 0)
  const totalPaidCents = savedItems.reduce((sum, i) => sum + (i.paidAmountCents || 0), 0)
  const totalOutstandingCents = totalPriceCents - totalPaidCents
  const expectedMismatch = existingSchedule && totalExpectedCents !== totalPriceCents

  if (isLoading) {
    return <div className="text-sm text-ash-500">Loading payment schedule...</div>
  }

  if (!activityPricingId) {
    return (
      <div className="p-4 border border-ash-200 rounded-lg bg-ash-50 text-center text-sm text-ash-500">
        Please save the activity with a total price first to configure payment schedules.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Schedule Type Selection — hidden for existing schedules */}
      {!existingSchedule && (
        <>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-ash-700">Schedule Type</Label>
            <Select value={scheduleType} onValueChange={(value) => setScheduleType(value as ScheduleType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">In Full</SelectItem>
                <SelectItem value="deposit">Deposit + Final Balance</SelectItem>
                <SelectItem value="installments">Set Installments</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Deposit Configuration */}
          {scheduleType === 'deposit' && (
            <div className="space-y-4 p-4 border border-ash-200 rounded-lg bg-ash-50">
              <h4 className="text-sm font-medium text-ash-900">Deposit Calculator</h4>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-ash-700">Deposit Type</Label>
                <Select value={depositType} onValueChange={(value) => setDepositType(value as DepositType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {depositType === 'percentage' ? (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-ash-700">Deposit Percentage</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={depositPercentage}
                      onChange={(e) => setDepositPercentage(parseFloat(e.target.value) || 0)}
                      className={`w-24 ${NUMERIC_INPUT_CLASS}`}
                    />
                    <span className="text-sm text-ash-600">%</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-ash-700">Deposit Amount</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ash-600">{currency}</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={depositAmountDollars}
                      onChange={(e) => setDepositAmountDollars(parseFloat(e.target.value) || 0)}
                      className={`w-32 ${NUMERIC_INPUT_CLASS}`}
                    />
                  </div>
                </div>
              )}

              {depositCalculation && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ash-600">Deposit:</span>
                    <span className="font-medium">{formatCurrency(depositCalculation.depositAmountCents, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ash-600">Remaining:</span>
                    <span className="font-medium">{formatCurrency(depositCalculation.remainingAmountCents, currency)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-ash-200">
                    <span className="text-ash-900 font-medium">Total:</span>
                    <span className="font-semibold">{formatCurrency(depositCalculation.totalAmountCents, currency)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Installments Configuration */}
          {scheduleType === 'installments' && (
            <div className="space-y-4 p-4 border border-ash-200 rounded-lg bg-ash-50">
              <h4 className="text-sm font-medium text-ash-900">Installment Configuration</h4>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-ash-700">Number of Installments</Label>
                <Input
                  type="number"
                  min={2}
                  max={12}
                  value={numberOfInstallments}
                  onChange={(e) => setNumberOfInstallments(parseInt(e.target.value) || 2)}
                  className={`w-24 ${NUMERIC_INPUT_CLASS}`}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Expected Payments Table */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-ash-700">Expected Payments</Label>
        <div className="border border-ash-200 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Payment Name</TableHead>
                <TableHead className={NUMERIC_INPUT_CLASS}>Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                {existingSchedule && <TableHead className={NUMERIC_INPUT_CLASS}>Paid</TableHead>}
                {existingSchedule && <TableHead className={NUMERIC_INPUT_CLASS}>Remaining</TableHead>}
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Existing schedule: editable rows */}
              {existingSchedule?.expectedPaymentItems?.map((savedItem, index) => (
                <EditablePaymentRow
                  key={savedItem.id}
                  item={savedItem}
                  index={index}
                  currency={currency}
                  activityPricingId={activityPricingId}
                  onRecordPayment={handleRecordPayment}
                  onDelete={handleDeleteItem}
                  isDeleting={deleteItem.isPending}
                />
              ))}
              {/* New schedule: editable local items */}
              {!existingSchedule && expectedPayments.map((payment, index) => (
                <TableRow key={index}>
                  <TableCell className="text-sm text-ash-500">{index + 1}</TableCell>
                  <TableCell>
                    <Input
                      value={payment.paymentName}
                      onChange={(e) => {
                        const updated = [...expectedPayments]
                        if (updated[index]) {
                          updated[index].paymentName = e.target.value
                          setExpectedPayments(updated)
                        }
                      }}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className={`font-medium ${NUMERIC_INPUT_CLASS}`}>
                    {formatCurrency(payment.expectedAmountCents, currency)}
                  </TableCell>
                  <TableCell>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'h-8 justify-start text-left font-normal',
                            !payment.dueDate && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {payment.dueDate ? format(new Date(payment.dueDate + 'T00:00:00'), 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={payment.dueDate ? new Date(payment.dueDate + 'T00:00:00') : undefined}
                          onSelect={(date) => {
                            const updated = [...expectedPayments]
                            if (updated[index]) {
                              updated[index].dueDate = date ? format(date, 'yyyy-MM-dd') : null
                              setExpectedPayments(updated)
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>{getStatusBadge(payment, currency)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-ash-400">Save to record</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Row button for existing schedules */}
      {existingSchedule && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddItem}
          disabled={addItem.isPending}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Expected Payment
        </Button>
      )}

      {/* Outstanding Summary for existing schedules */}
      {existingSchedule && savedItems.length > 0 && (
        <div className="p-4 border border-ash-200 rounded-lg bg-ash-50 space-y-2">
          <h4 className="text-sm font-medium text-ash-900">Payment Summary</h4>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ash-600">Total Price:</span>
              <span className="font-medium">{formatCurrency(totalPriceCents, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ash-600">Total Expected:</span>
              <span className="font-medium">{formatCurrency(totalExpectedCents, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ash-600">Total Paid:</span>
              <span className="font-medium text-green-700">{formatCurrency(totalPaidCents, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ash-600">Outstanding:</span>
              <span className={cn('font-semibold', totalOutstandingCents > 0 ? 'text-amber-600' : 'text-green-700')}>
                {formatCurrency(totalOutstandingCents, currency)}
              </span>
            </div>
          </div>
          {expectedMismatch && (
            <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Expected payments ({formatCurrency(totalExpectedCents, currency)}) don&apos;t match total price ({formatCurrency(totalPriceCents, currency)}).
                Difference: {formatCurrency(Math.abs(totalPriceCents - totalExpectedCents), currency)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Save Button (new schedule only) */}
      {!existingSchedule && (
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={createSchedule.isPending || updateSchedule.isPending}
          >
            Create Schedule
          </Button>
        </div>
      )}

      {/* Record Payment Modal */}
      {selectedPaymentItem && activityPricingId && tripId && (
        <RecordPaymentModal
          open={recordPaymentModalOpen}
          onOpenChange={setRecordPaymentModalOpen}
          expectedPaymentItem={selectedPaymentItem}
          activityPricingId={activityPricingId}
          tripId={tripId}
          currency={currency}
        />
      )}
    </div>
  )
}
