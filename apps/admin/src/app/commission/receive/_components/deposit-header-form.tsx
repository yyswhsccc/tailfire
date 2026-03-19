'use client'

import { useState } from 'react'
import { useCreateDeposit } from '@/hooks/use-commission'
import { useSuppliers } from '@/hooks/use-suppliers'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DepositHeaderFormProps {
  onCreated: (depositId: string, totalAmountCents: number, depositNumber: string) => void
  isSubmitting?: boolean
}

export function DepositHeaderForm({ onCreated, isSubmitting }: DepositHeaderFormProps) {
  const { toast } = useToast()
  const createDeposit = useCreateDeposit()
  const { data: suppliersData } = useSuppliers({ limit: 100 })

  const [depositNumber, setDepositNumber] = useState('')
  const [depositDate, setDepositDate] = useState('')
  const [totalAmountDollars, setTotalAmountDollars] = useState('')
  const [supplierId, setSupplierId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [fileUrl, setFileUrl] = useState('')

  const suppliers = suppliersData?.suppliers ?? []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!depositNumber.trim()) {
      toast({ title: 'Validation error', description: 'Deposit number is required.', variant: 'destructive' })
      return
    }
    if (!depositDate) {
      toast({ title: 'Validation error', description: 'Deposit date is required.', variant: 'destructive' })
      return
    }
    const dollars = parseFloat(totalAmountDollars)
    if (isNaN(dollars) || dollars <= 0) {
      toast({ title: 'Validation error', description: 'Total amount must be a positive number.', variant: 'destructive' })
      return
    }

    const totalAmountCents = Math.round(dollars * 100)

    try {
      const result = await createDeposit.mutateAsync({
        depositNumber: depositNumber.trim(),
        depositDate,
        totalAmountCents,
        supplierId: supplierId && supplierId !== '__none__' ? supplierId : undefined,
        notes: notes.trim() || undefined,
        fileUrl: fileUrl.trim() || undefined,
        fileName: fileUrl.trim() ? fileUrl.trim().split('/').pop() : undefined,
      })
      toast({ title: 'Deposit created', description: `Deposit ${depositNumber} created successfully.` })
      onCreated(result.id, totalAmountCents, depositNumber.trim())
    } catch (error: any) {
      toast({
        title: 'Failed to create deposit',
        description: error?.message || 'An error occurred.',
        variant: 'destructive',
      })
    }
  }

  const busy = isSubmitting || createDeposit.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Deposit</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="depositNumber">Deposit Number *</Label>
              <Input
                id="depositNumber"
                value={depositNumber}
                onChange={(e) => setDepositNumber(e.target.value)}
                placeholder="e.g. DEP-2026-001"
                required
                disabled={busy}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="depositDate">Deposit Date *</Label>
              <Input
                id="depositDate"
                type="date"
                value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)}
                required
                disabled={busy}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalAmount">Total Amount (CAD) *</Label>
              <Input
                id="totalAmount"
                type="number"
                step="0.01"
                min="0.01"
                value={totalAmountDollars}
                onChange={(e) => setTotalAmountDollars(e.target.value)}
                placeholder="0.00"
                required
                disabled={busy}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId} disabled={busy}>
                <SelectTrigger id="supplier">
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

            <div className="space-y-2">
              <Label htmlFor="fileUrl">File URL (optional)</Label>
              <Input
                id="fileUrl"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="https://..."
                disabled={busy}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this deposit..."
              rows={2}
              disabled={busy}
            />
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? 'Creating...' : 'Create Deposit'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
