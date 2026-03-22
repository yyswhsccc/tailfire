'use client'

/**
 * Trip Order Generator Modal
 *
 * Modal for generating, previewing, finalizing, and sending Trip Order invoices.
 *
 * Workflow:
 * 1. Generate - Creates a new versioned snapshot of the trip order data
 * 2. Preview - View the generated invoice data
 * 3. Finalize - Lock the invoice (draft -> finalized)
 * 4. Send - Email the finalized invoice to recipients
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FileText,
  Plus,
  Send,
  Download,
  Eye,
  Lock,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import { useUser } from '@/hooks/use-user'
import {
  useTripOrders,
  useTripOrderCompliance,
  useGenerateTripOrderSnapshot,
  useFinalizeTripOrder,
  usePreviewStoredTripOrder,
  useDownloadStoredTripOrder,
  useSendStoredTripOrderEmail,
  type TripOrderSnapshot,
} from '@/hooks/use-trip-orders'
import { formatCurrency } from '@/lib/pricing/currency-helpers'

interface TripOrderGeneratorProps {
  tripId: string
  currency?: string
  /** Optional callback when invoice is sent */
  onSent?: () => void
}

interface TripOrderGeneratorModalProps extends TripOrderGeneratorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Button that opens the Trip Order Generator modal
 */
export function TripOrderGeneratorButton({ tripId, currency, onSent }: TripOrderGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        <FileText className="h-4 w-4 mr-2" />
        Generate Invoice
      </Button>
      <TripOrderGeneratorModal
        tripId={tripId}
        currency={currency}
        open={isOpen}
        onOpenChange={setIsOpen}
        onSent={onSent}
      />
    </>
  )
}

/**
 * Trip Order Generator Modal
 */
export function TripOrderGeneratorModal({
  tripId,
  currency = 'CAD',
  open,
  onOpenChange,
  onSent,
}: TripOrderGeneratorModalProps) {
  const { agencyId, userId } = useUser()

  // State
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [showSendForm, setShowSendForm] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendCc, setSendCc] = useState('')
  const [customMessage, setCustomMessage] = useState('')

  // Queries
  const { data: tripOrders, isLoading: isLoadingOrders } = useTripOrders(
    tripId,
    agencyId ?? '',
    { enabled: open && !!agencyId }
  )

  // Mutations
  const generateSnapshot = useGenerateTripOrderSnapshot(tripId)
  const finalizeTripOrder = useFinalizeTripOrder()
  const previewTripOrder = usePreviewStoredTripOrder()
  const downloadTripOrder = useDownloadStoredTripOrder()
  const sendTripOrderEmail = useSendStoredTripOrderEmail()

  // Get selected order (or latest if none selected)
  const selectedOrder = tripOrders?.find((o) => o.id === selectedOrderId) ?? tripOrders?.[0]

  // TICO compliance check for draft orders
  const { data: compliance } = useTripOrderCompliance(
    selectedOrder?.status === 'draft' ? selectedOrder.id : null,
  )

  // Reset state when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedOrderId(null)
      setShowSendForm(false)
      setSendTo('')
      setSendCc('')
      setCustomMessage('')
    }
    onOpenChange(newOpen)
  }

  // Generate new snapshot
  const handleGenerate = () => {
    if (!agencyId) return

    generateSnapshot.mutate(undefined, {
      onSuccess: (data) => {
        setSelectedOrderId(data.id)
      },
    })
  }

  // Finalize draft
  const handleFinalize = () => {
    if (!selectedOrder || !agencyId || !userId) return

    finalizeTripOrder.mutate({ id: selectedOrder.id })
  }

  // Preview PDF in new tab
  const handlePreview = () => {
    if (!selectedOrder || !agencyId) return

    previewTripOrder.mutate({ id: selectedOrder.id })
  }

  // Download PDF
  const handleDownload = () => {
    if (!selectedOrder || !agencyId) return

    downloadTripOrder.mutate({ id: selectedOrder.id })
  }

  // Send email
  const handleSend = () => {
    if (!selectedOrder || !agencyId || !userId) return

    const toEmails = sendTo.split(',').map((e) => e.trim()).filter(Boolean)
    const ccEmails = sendCc ? sendCc.split(',').map((e) => e.trim()).filter(Boolean) : []

    if (toEmails.length === 0) return

    sendTripOrderEmail.mutate(
      {
        id: selectedOrder.id,
        params: {
          to: toEmails,
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          customMessage: customMessage || undefined,
        },
      },
      {
        onSuccess: () => {
          setShowSendForm(false)
          setSendTo('')
          setSendCc('')
          setCustomMessage('')
          onSent?.()
        },
      }
    )
  }

  // Get status badge
  const getStatusBadge = (status: TripOrderSnapshot['status']) => {
    switch (status) {
      case 'draft':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Draft
          </Badge>
        )
      case 'finalized':
        return (
          <Badge variant="outline" className="gap-1 border-blue-500 text-blue-700">
            <Lock className="h-3 w-3" />
            Finalized
          </Badge>
        )
      case 'sent':
        return (
          <Badge variant="outline" className="gap-1 border-green-500 text-green-700">
            <CheckCircle2 className="h-3 w-3" />
            Sent
          </Badge>
        )
    }
  }

  // Extract summary from order data
  // Note: Backend stores dollars, formatCurrency expects cents - must convert
  const getSummary = (order: TripOrderSnapshot | undefined) => {
    if (!order) return null

    // Payment summary uses snake_case from backend (values are in dollars)
    const paymentSummary = order.paymentSummary as Record<string, unknown> | null

    // Grand total comes from orderData.cost_breakdown.final_total (dollars)
    const orderData = order.orderData as { cost_breakdown?: { final_total?: number } } | null
    const grandTotalDollars = orderData?.cost_breakdown?.final_total ?? 0

    // Payments from paymentSummary (snake_case, in dollars)
    const totalPaidDollars = (paymentSummary?.processed_payments as number) ?? 0
    const balanceDueDollars = (paymentSummary?.balance_due as number) ?? grandTotalDollars

    // Convert to cents for formatCurrency compatibility
    return {
      grandTotal: Math.round(grandTotalDollars * 100),
      totalPaid: Math.round(totalPaidDollars * 100),
      balanceDue: Math.round(balanceDueDollars * 100),
    }
  }

  const summary = getSummary(selectedOrder)
  const isLoading =
    generateSnapshot.isPending ||
    finalizeTripOrder.isPending ||
    previewTripOrder.isPending ||
    downloadTripOrder.isPending ||
    sendTripOrderEmail.isPending

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Invoice Generator</DialogTitle>
          <DialogDescription>
            Generate and send trip invoices to your clients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Version Selector and Generate Button */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-sm text-muted-foreground">Invoice Version</Label>
              {isLoadingOrders ? (
                <Skeleton className="h-10 w-full mt-1" />
              ) : tripOrders && tripOrders.length > 0 ? (
                <Select
                  value={selectedOrderId ?? tripOrders[0]?.id}
                  onValueChange={setSelectedOrderId}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tripOrders.map((order) => (
                      <SelectItem key={order.id} value={order.id}>
                        Version {order.versionNumber} -{' '}
                        {format(new Date(order.createdAt), 'MMM d, yyyy h:mm a')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  No invoices generated yet.
                </p>
              )}
            </div>
            <div className="pt-5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={isLoading || !agencyId}
              >
                {generateSnapshot.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span className="ml-1">New</span>
              </Button>
            </div>
          </div>

          {/* Selected Order Preview */}
          {selectedOrder && (
            <>
              <Separator />

              <div className="space-y-3">
                {/* Status and Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Version {selectedOrder.versionNumber}</span>
                    {getStatusBadge(selectedOrder.status)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePreview}
                      disabled={isLoading}
                    >
                      {previewTripOrder.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      <span className="ml-1">Preview</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownload}
                      disabled={isLoading}
                    >
                      {downloadTripOrder.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      <span className="ml-1">Download</span>
                    </Button>
                  </div>
                </div>

                {/* Summary Card */}
                {summary && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <h4 className="font-medium text-sm">Payment Summary</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Grand Total</p>
                        <p className="font-medium">{formatCurrency(summary.grandTotal, currency)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Paid</p>
                        <p className="font-medium text-green-600">
                          {formatCurrency(summary.totalPaid, currency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Balance Due</p>
                        <p className="font-medium text-orange-600">
                          {formatCurrency(summary.balanceDue, currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Created: {format(new Date(selectedOrder.createdAt), 'PPpp')}</p>
                  {selectedOrder.finalizedAt && (
                    <p>Finalized: {format(new Date(selectedOrder.finalizedAt), 'PPpp')}</p>
                  )}
                  {selectedOrder.sentAt && (
                    <p>Sent: {format(new Date(selectedOrder.sentAt), 'PPpp')}</p>
                  )}
                </div>

                {/* Draft Warning + Compliance Check */}
                {selectedOrder.status === 'draft' && (
                  <div className="space-y-2">
                    {compliance && !compliance.compliant ? (
                      <div className="text-sm text-red-700 bg-red-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <p className="font-medium">
                            TICO compliance issues must be resolved before finalizing:
                          </p>
                        </div>
                        <ul className="list-disc list-inside pl-6 space-y-1">
                          {compliance.violations.map((v, i) => (
                            <li key={i}>{v}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <p>
                          This invoice is a draft. Finalize it to lock the data before sending.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Send Form */}
                {showSendForm && (selectedOrder.status === 'finalized' || selectedOrder.status === 'sent') && (
                  <div className="space-y-3 pt-2">
                    <Separator />
                    <div className="space-y-2">
                      <Label htmlFor="sendTo">Send To (comma-separated)</Label>
                      <Input
                        id="sendTo"
                        value={sendTo}
                        onChange={(e) => setSendTo(e.target.value)}
                        placeholder="client@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sendCc">CC (optional)</Label>
                      <Input
                        id="sendCc"
                        value={sendCc}
                        onChange={(e) => setSendCc(e.target.value)}
                        placeholder="agent@agency.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customMessage">Custom Message (optional)</Label>
                      <Textarea
                        id="customMessage"
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        placeholder="Add a personal message..."
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Close
          </Button>

          {/* Finalize Button - only for drafts, blocked by compliance */}
          {selectedOrder?.status === 'draft' && (
            <Button
              variant="secondary"
              onClick={handleFinalize}
              disabled={isLoading || !userId || (compliance != null && !compliance.compliant)}
            >
              {finalizeTripOrder.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Finalize
            </Button>
          )}

          {/* Send Button - only for finalized or sent */}
          {(selectedOrder?.status === 'finalized' || selectedOrder?.status === 'sent') && (
            <>
              {showSendForm ? (
                <Button
                  onClick={handleSend}
                  disabled={isLoading || !sendTo.trim()}
                >
                  {sendTripOrderEmail.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send Invoice
                </Button>
              ) : (
                <Button onClick={() => setShowSendForm(true)}>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
