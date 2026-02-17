'use client'

/**
 * Payment Schedule Section Component
 *
 * Component-level payment schedule management UI.
 * Supports three schedule types: In Full, Deposit + Final Balance, Set Installments
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
import { CalendarIcon, DollarSign } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  usePaymentSchedule,
  useCreatePaymentSchedule,
  useUpdatePaymentSchedule,
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
}

export function PaymentScheduleSection({
  activityPricingId,
  totalPriceCents,
  currency,
}: PaymentScheduleSectionProps) {
  const { data: existingSchedule, isLoading } = usePaymentSchedule(activityPricingId)
  const createSchedule = useCreatePaymentSchedule()
  const updateSchedule = useUpdatePaymentSchedule(activityPricingId || '')

  // Form state
  const [scheduleType, setScheduleType] = useState<ScheduleType>('full')
  const [depositType, setDepositType] = useState<DepositType>('percentage')
  const [depositPercentage, setDepositPercentage] = useState<number>(50)
  const [depositAmountDollars, setDepositAmountDollars] = useState<number>(0)
  const [numberOfInstallments, setNumberOfInstallments] = useState<number>(3)
  const [expectedPayments, setExpectedPayments] = useState<CreateExpectedPaymentItemDto[]>([])

  // Payment modal state
  const [recordPaymentModalOpen, setRecordPaymentModalOpen] = useState(false)
  const [selectedPaymentItem, setSelectedPaymentItem] = useState<ExpectedPaymentItemDto | null>(null)

  // Load existing schedule data
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
      if (existingSchedule.expectedPaymentItems) {
        setExpectedPayments(
          existingSchedule.expectedPaymentItems.map((item) => ({
            paymentName: item.paymentName,
            expectedAmountCents: item.expectedAmountCents,
            dueDate: item.dueDate,
            sequenceOrder: item.sequenceOrder,
          }))
        )
      }
    }
  }, [existingSchedule])

  // Auto-calculate expected payments when schedule type changes
  useEffect(() => {
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
  }, [scheduleType, depositType, depositPercentage, depositAmountDollars, numberOfInstallments, totalPriceCents])

  // Handle save
  const handleSave = () => {
    if (!activityPricingId) {
      return
    }

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

  // Calculate deposit display
  const depositCalculation = scheduleType === 'deposit'
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

  // Helper to get payment status badge
  const getStatusBadge = (item: ExpectedPaymentItemDto | CreateExpectedPaymentItemDto) => {
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

  if (isLoading) {
    return <div className="text-sm text-ash-500">Loading payment schedule...</div>
  }

  // Show message if no pricing ID (activity not saved yet)
  if (!activityPricingId) {
    return (
      <div className="p-4 border border-ash-200 rounded-lg bg-ash-50 text-center text-sm text-ash-500">
        Please save the activity with a total price first to configure payment schedules.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Schedule Type Selection */}
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

          {/* Deposit Type */}
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

          {/* Deposit Value Input */}
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

          {/* Deposit Calculation Display */}
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
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Show saved items from database if they exist */}
              {existingSchedule?.expectedPaymentItems?.map((savedItem, index) => (
                <TableRow key={savedItem.id}>
                  <TableCell className="text-sm text-ash-500">{index + 1}</TableCell>
                  <TableCell className="font-medium">{savedItem.paymentName}</TableCell>
                  <TableCell className={`font-medium ${NUMERIC_INPUT_CLASS}`}>
                    {formatCurrency(savedItem.expectedAmountCents, currency)}
                  </TableCell>
                  <TableCell>
                    {savedItem.dueDate ? format(new Date(savedItem.dueDate), 'PPP') : '–'}
                  </TableCell>
                  <TableCell>{getStatusBadge(savedItem)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRecordPayment(savedItem)}
                      disabled={savedItem.status === 'paid'}
                    >
                      <DollarSign className="h-3 w-3 mr-1" />
                      Record
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {/* Show editable local items when no saved schedule exists */}
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
                          {payment.dueDate ? format(new Date(payment.dueDate), 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={payment.dueDate ? new Date(payment.dueDate) : undefined}
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
                  <TableCell>{getStatusBadge(payment)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-ash-400">Save to record</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={createSchedule.isPending || updateSchedule.isPending}
        >
          {existingSchedule ? 'Update Schedule' : 'Create Schedule'}
        </Button>
      </div>

      {/* Record Payment Modal */}
      {selectedPaymentItem && activityPricingId && (
        <RecordPaymentModal
          open={recordPaymentModalOpen}
          onOpenChange={setRecordPaymentModalOpen}
          expectedPaymentItem={selectedPaymentItem}
          activityPricingId={activityPricingId}
          currency={currency}
        />
      )}
    </div>
  )
}
