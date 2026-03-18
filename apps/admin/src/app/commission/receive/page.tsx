'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { DashboardLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useUser } from '@/hooks/use-user'
import { useFinalizeDeposit } from '@/hooks/use-commission'
import { DepositHeaderForm } from './_components/deposit-header-form'
import { PendingReceivablesTable } from './_components/pending-receivables-table'
import { DepositBuilder, type MatchedItem } from './_components/deposit-builder'
import { MatchItemDialog } from './_components/match-item-dialog'
import type { PendingReceivableDto } from '@tailfire/shared-types/api'

export default function ReceiveDepositPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { isAdmin } = useUser()

  // Redirect non-admin users
  useEffect(() => {
    if (isAdmin === false) {
      router.replace('/commission')
    }
  }, [isAdmin, router])
  const finalizeDeposit = useFinalizeDeposit()

  // Deposit header state
  const [depositId, setDepositId] = useState<string | null>(null)
  const [depositNumber, setDepositNumber] = useState('')
  const [totalAmountCents, setTotalAmountCents] = useState(0)

  // Matching state
  const [matchedItems, setMatchedItems] = useState<MatchedItem[]>([])
  const [unreconciledItems, setUnreconciledItems] = useState<{ description: string; amountCents: number }[]>([])
  const [selectedItem, setSelectedItem] = useState<PendingReceivableDto | null>(null)

  const matchedIds = useMemo(
    () => new Set(matchedItems.map((m) => m.activityPricingId)),
    [matchedItems],
  )

  // --- Event Handlers ---

  function handleDepositCreated(id: string, totalCents: number, number: string) {
    setDepositId(id)
    setTotalAmountCents(totalCents)
    setDepositNumber(number)
  }

  function handleMatchConfirmed(activityPricingId: string, receivedCents: number, taxCents: number) {
    const item = selectedItem!
    setMatchedItems((prev) => [
      ...prev,
      {
        activityPricingId,
        confirmationNumber: item.confirmationNumber,
        passengerNames: item.passengerNames,
        tripName: item.tripName,
        expectedCents: item.expectedCommissionCents,
        receivedCents,
        taxCents,
      },
    ])
    setSelectedItem(null)
  }

  function handleAutoMatch(items: PendingReceivableDto[]) {
    const newMatched: MatchedItem[] = items.map((item) => ({
      activityPricingId: item.activityPricingId,
      confirmationNumber: item.confirmationNumber,
      passengerNames: item.passengerNames,
      tripName: item.tripName,
      expectedCents: item.expectedCommissionCents,
      receivedCents: item.expectedCommissionCents,
      taxCents: 0,
    }))
    setMatchedItems((prev) => [...prev, ...newMatched])
  }

  function handleRemoveItem(activityPricingId: string) {
    setMatchedItems((prev) => prev.filter((m) => m.activityPricingId !== activityPricingId))
  }

  function handleAddUnreconciled(description: string, amountCents: number) {
    setUnreconciledItems((prev) => [...prev, { description, amountCents }])
  }

  function handleRemoveUnreconciled(index: number) {
    setUnreconciledItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleFinalize() {
    if (!depositId) return

    try {
      await finalizeDeposit.mutateAsync({
        id: depositId,
        data: {
          items: matchedItems.map((m) => ({
            activityPricingId: m.activityPricingId,
            receivedCents: m.receivedCents,
            taxCents: m.taxCents,
          })),
          unreconciled: unreconciledItems.length > 0 ? unreconciledItems : undefined,
        },
      })
      toast({
        title: 'Deposit finalized',
        description: 'Commission items have been marked as received.',
      })
      router.push('/commission')
    } catch (error: any) {
      toast({
        title: 'Finalization failed',
        description: error?.message || 'An error occurred.',
        variant: 'destructive',
      })
    }
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full space-y-4">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/commission">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to Commission
              </Link>
            </Button>
          </div>
          <h1 className="text-xl font-semibold">Receive Commission Deposit</h1>
        </div>

        {/* Deposit header form — visible before creation, collapsed after */}
        {!depositId && (
          <DepositHeaderForm onCreated={handleDepositCreated} />
        )}

        {depositId && (
          <details className="rounded-lg border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
              Deposit #{depositNumber} created — click to expand details
            </summary>
            <div className="px-4 pb-4">
              <DepositHeaderForm onCreated={handleDepositCreated} isSubmitting />
            </div>
          </details>
        )}

        {/* Split-screen panels — only after deposit is created */}
        {depositId && (
          <div className="flex-1 min-h-0">
            <PanelGroup direction="horizontal" className="h-full rounded-lg border">
              {/* Left panel: Pending receivables */}
              <Panel defaultSize={55} minSize={30}>
                <div className="h-full overflow-auto p-4">
                  <h2 className="mb-3 text-lg font-semibold">Pending Receivables</h2>
                  <PendingReceivablesTable
                    depositTotalCents={totalAmountCents}
                    matchedIds={matchedIds}
                    onSelectItem={setSelectedItem}
                    onAutoMatch={handleAutoMatch}
                  />
                </div>
              </Panel>

              {/* Resize handle */}
              <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/20 transition-colors" />

              {/* Right panel: Deposit builder */}
              <Panel defaultSize={45} minSize={25}>
                <div className="h-full overflow-auto p-4">
                  <DepositBuilder
                    depositNumber={depositNumber}
                    totalAmountCents={totalAmountCents}
                    matchedItems={matchedItems}
                    onRemoveItem={handleRemoveItem}
                    onAddUnreconciled={handleAddUnreconciled}
                    unreconciledItems={unreconciledItems}
                    onRemoveUnreconciled={handleRemoveUnreconciled}
                    onFinalize={handleFinalize}
                    isFinalizing={finalizeDeposit.isPending}
                  />
                </div>
              </Panel>
            </PanelGroup>
          </div>
        )}

        {/* Match item dialog */}
        <MatchItemDialog
          open={!!selectedItem}
          onOpenChange={(open) => {
            if (!open) setSelectedItem(null)
          }}
          item={selectedItem}
          onConfirm={handleMatchConfirmed}
        />
      </div>
    </DashboardLayout>
  )
}
