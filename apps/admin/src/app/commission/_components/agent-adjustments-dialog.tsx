'use client'

/**
 * AgentAdjustmentsDialog — admin manages an agent's pending adjustments.
 *
 * Listed via GET /commission/adjustments?agentUserId=...&status=pending.
 * Supports Add / Edit / Delete. Reconciled adjustments are read-only
 * (server enforces) — they've already flowed into a paid check / IC
 * invoice and have to be unwound at the parent level.
 *
 * Negative amounts are valid (clawbacks). Server accepts any signed int.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pencil, Trash2, Plus } from 'lucide-react'
import {
  useAdjustments,
  useCreateAdjustment,
  useUpdateAdjustment,
  useDeleteAdjustment,
  type CommissionAdjustmentDto,
} from '@/hooks/use-commission-adjustments'
import { useToast } from '@/hooks/use-toast'
import { confirmDialog } from '@/components/ui/confirmation-dialog'

interface Props {
  /** Agent the adjustments belong to. */
  userId: string
  /** Display name (shown in title). */
  userName: string
  /** Currency to use for new adjustments — matches the Payable row. */
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function dollarsFromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function centsFromDollars(dollars: string): number | null {
  const n = Number.parseFloat(dollars)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}

export function AgentAdjustmentsDialog({ userId, userName, currency, open, onOpenChange }: Props) {
  const { data, isLoading } = useAdjustments({ agentUserId: userId })
  const create = useCreateAdjustment()
  const update = useUpdateAdjustment()
  const del = useDeleteAdjustment()
  const { toast } = useToast()

  // Local form state for add / edit. `editing` = the row being edited (null
  // when adding a brand-new one).
  const [editing, setEditing] = useState<CommissionAdjustmentDto | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [amountDollars, setAmountDollars] = useState('')

  const openAdd = () => {
    setEditing(null)
    setDescription('')
    setAmountDollars('')
    setShowForm(true)
  }
  const openEdit = (row: CommissionAdjustmentDto) => {
    setEditing(row)
    setDescription(row.description)
    setAmountDollars(dollarsFromCents(row.amountCents))
    setShowForm(true)
  }
  const closeForm = () => setShowForm(false)

  const handleSave = async () => {
    const cents = centsFromDollars(amountDollars)
    if (cents === null) {
      toast({ title: 'Invalid amount', description: 'Enter a numeric amount.', variant: 'destructive' })
      return
    }
    if (!description.trim()) {
      toast({ title: 'Description required', variant: 'destructive' })
      return
    }
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing.id,
          data: { description: description.trim(), amountCents: cents },
        })
        toast({ title: 'Adjustment updated' })
      } else {
        await create.mutateAsync({
          description: description.trim(),
          amountCents: cents,
          adjustmentType: 'agent',
          agentUserId: userId,
          currency,
        })
        toast({ title: 'Adjustment added' })
      }
      setShowForm(false)
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Save failed'
      toast({ title: 'Save failed', description: msg, variant: 'destructive' })
    }
  }

  const handleDelete = async (row: CommissionAdjustmentDto) => {
    const ok = await confirmDialog({
      title: 'Delete this adjustment?',
      description: `${row.description} (${row.amountCents < 0 ? '-' : ''}$${dollarsFromCents(Math.abs(row.amountCents))}) will be removed. Pending only — reconciled adjustments can't be deleted.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      await del.mutateAsync(row.id)
      toast({ title: 'Adjustment deleted' })
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Delete failed'
      toast({ title: 'Delete failed', description: msg, variant: 'destructive' })
    }
  }

  const rows = data?.data ?? []
  const pendingTotal = rows.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amountCents, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adjustments — {userName}</DialogTitle>
          <DialogDescription>
            Pending adjustments roll into the agent&apos;s next claim. Reconciled adjustments are read-only.
          </DialogDescription>
        </DialogHeader>

        {/* ── List ── */}
        <div className="border rounded-md">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
            <div className="text-sm">
              <span className="font-medium">Pending total:</span>{' '}
              <span className={`font-mono tabular-nums ${pendingTotal < 0 ? 'text-red-600' : ''}`}>
                {pendingTotal < 0 ? '-' : ''}${dollarsFromCents(Math.abs(pendingTotal))} {currency}
              </span>
            </div>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1 h-4 w-4" />
              Add adjustment
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No adjustments. Use Add to record a clawback, bonus, or correction.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{row.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.status === 'pending' ? 'Pending' : 'Reconciled'} · {row.adjustmentType}
                    </div>
                  </div>
                  <div className={`font-mono tabular-nums text-sm ${row.amountCents < 0 ? 'text-red-600' : ''}`}>
                    {row.amountCents < 0 ? '-' : ''}${dollarsFromCents(Math.abs(row.amountCents))} {row.currency}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(row)}
                      disabled={row.status === 'reconciled'}
                      aria-label="Edit adjustment"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => handleDelete(row)}
                      disabled={row.status === 'reconciled'}
                      aria-label="Delete adjustment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Add / Edit form (in-place, no nested dialog) ── */}
        {showForm && (
          <div className="border rounded-md p-3 space-y-3 bg-muted/30">
            <div className="text-sm font-medium">{editing ? 'Edit adjustment' : 'Add adjustment'}</div>
            <div>
              <Label htmlFor="adj-desc">Description</Label>
              <Input
                id="adj-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Clawback for cancelled booking"
              />
            </div>
            <div>
              <Label htmlFor="adj-amount">Amount ({currency})</Label>
              <Input
                id="adj-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                placeholder="Use negative for clawback (e.g. -120.00)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Negative reduces the agent&apos;s payable; positive adds to it.
              </p>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" size="sm" onClick={closeForm}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={create.isPending || update.isPending}>
                {editing ? 'Save changes' : 'Add'}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
