'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100)
}

export interface MatchedItem {
  activityPricingId: string
  confirmationNumber: string | null
  passengerNames: string[]
  tripName: string
  expectedCents: number
  receivedCents: number
  taxCents: number
}

interface DepositBuilderProps {
  depositNumber: string
  totalAmountCents: number
  matchedItems: MatchedItem[]
  onRemoveItem: (activityPricingId: string) => void
  onAddUnreconciled: (description: string, amountCents: number) => void
  unreconciledItems: { description: string; amountCents: number }[]
  onRemoveUnreconciled: (index: number) => void
  onFinalize: () => void
  isFinalizing?: boolean
}

export function DepositBuilder({
  depositNumber,
  totalAmountCents,
  matchedItems,
  onRemoveItem,
  onAddUnreconciled,
  unreconciledItems,
  onRemoveUnreconciled,
  onFinalize,
  isFinalizing = false,
}: DepositBuilderProps) {
  const [unreconciledDescription, setUnreconciledDescription] = useState('')
  const [unreconciledAmount, setUnreconciledAmount] = useState('')

  const matchedTotalCents =
    matchedItems.reduce((sum, item) => sum + item.receivedCents, 0) +
    unreconciledItems.reduce((sum, item) => sum + item.amountCents, 0)

  const remainingCents = totalAmountCents - matchedTotalCents

  const balanceColorClass =
    remainingCents === 0
      ? 'bg-green-100 text-green-800'
      : remainingCents < 0
        ? 'bg-red-100 text-red-800'
        : 'bg-yellow-100 text-yellow-800'

  function handleAddUnreconciled() {
    const description = unreconciledDescription.trim()
    const dollars = parseFloat(unreconciledAmount)
    if (!description || isNaN(dollars) || dollars <= 0) return

    const amountCents = Math.round(dollars * 100)
    onAddUnreconciled(description, amountCents)
    setUnreconciledDescription('')
    setUnreconciledAmount('')
  }

  const canFinalize = matchedItems.length > 0

  return (
    <Card className="flex flex-col h-full">
      {/* Header */}
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle>Deposit Builder</CardTitle>
          {depositNumber && (
            <Badge variant="outline" className="font-mono text-sm">
              #{depositNumber}
            </Badge>
          )}
        </div>
        {totalAmountCents > 0 && (
          <p className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{formatCurrency(totalAmountCents)}</span>
          </p>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-6 flex-1">
        {/* Running Balance Bar */}
        <div className={`rounded-md px-4 py-3 text-sm font-medium ${balanceColorClass}`}>
          Matched: {formatCurrency(matchedTotalCents)} / Total: {formatCurrency(totalAmountCents)}
          {' — '}
          Remaining: {formatCurrency(remainingCents)}
        </div>

        {/* Matched Items Table */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Matched Items
          </h3>
          {matchedItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No items matched yet. Select items from the left panel.
            </p>
          ) : (
            <div className="overflow-auto max-h-72 rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Ref</TableHead>
                    <TableHead className="text-xs">Passenger</TableHead>
                    <TableHead className="text-right text-xs">Expected</TableHead>
                    <TableHead className="text-right text-xs">Received</TableHead>
                    <TableHead className="text-right text-xs">Tax</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchedItems.map((item) => (
                    <TableRow key={item.activityPricingId}>
                      <TableCell className="font-mono text-xs">
                        {item.confirmationNumber ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs">
                        {item.passengerNames.length > 0
                          ? item.passengerNames.join(', ')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatCurrency(item.expectedCents)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {formatCurrency(item.receivedCents)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {formatCurrency(item.taxCents)}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          aria-label="Remove item"
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          onClick={() => onRemoveItem(item.activityPricingId)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Unreconciled Section */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Unreconciled Items
          </h3>

          {/* Inline add form */}
          <div className="flex gap-2 mb-3">
            <Input
              className="h-8 flex-1 text-sm"
              placeholder="Description"
              value={unreconciledDescription}
              onChange={(e) => setUnreconciledDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddUnreconciled()
              }}
            />
            <Input
              className="h-8 w-28 text-sm"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount ($)"
              value={unreconciledAmount}
              onChange={(e) => setUnreconciledAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddUnreconciled()
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={handleAddUnreconciled}
              disabled={
                !unreconciledDescription.trim() ||
                !unreconciledAmount ||
                parseFloat(unreconciledAmount) <= 0
              }
            >
              Add
            </Button>
          </div>

          {/* List of unreconciled items */}
          {unreconciledItems.length > 0 && (
            <ul className="space-y-1">
              {unreconciledItems.map((item, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
                >
                  <span className="truncate text-foreground">{item.description}</span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="font-medium">{formatCurrency(item.amountCents)}</span>
                    <button
                      type="button"
                      aria-label="Remove unreconciled item"
                      className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      onClick={() => onRemoveUnreconciled(index)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {unreconciledItems.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add unreconciled amounts to account for any remaining balance.
            </p>
          )}
        </div>

        {/* Finalize Button */}
        <div className="mt-auto pt-2 border-t">
          <Button
            className="w-full"
            onClick={onFinalize}
            disabled={!canFinalize || isFinalizing}
          >
            {isFinalizing ? 'Finalizing...' : 'Finalize Deposit'}
          </Button>
          {!canFinalize && (
            <p className="mt-1.5 text-center text-xs text-muted-foreground">
              Match at least one item to finalize.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
