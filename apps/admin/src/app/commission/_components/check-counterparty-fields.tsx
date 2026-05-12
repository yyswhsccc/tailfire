'use client'

/**
 * CheckCounterpartyFields — shared form section for the three fields that
 * appear identically on every commission-check form:
 *
 *   1. Supplier picker (FK to suppliers.id, searchable)
 *   2. Sender name (auto-fills from picked supplier; editable for d/b/a
 *      situations like "Air Canada Vacations c/o Travel Brands")
 *   3. Currency dropdown (CAD / USD / EUR / GBP / MXN)
 *
 * Used by both the "Receive Deposit" creation form and the "Received Check
 * Edit" dialog so the two stay aligned. Each parent owns its own create vs.
 * edit semantics; this subcomponent only owns these three correlated fields.
 *
 * Legacy data note: existing rows (TES import) have senderName text without
 * a supplier FK. Parents should pass `legacySenderName` to seed the name
 * input, while leaving supplierId null — the user is then required to pick
 * a supplier before saving (parent enforces the required rule on submit).
 */

import { useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { useSuppliers, useSupplier } from '@/hooks/use-suppliers'

/** Active currencies. ISO 4217 codes. Add to this list when business needs grow. */
export const SUPPORTED_CURRENCIES = [
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'MXN', label: 'MXN — Mexican Peso' },
] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]['code']

interface Props {
  supplierId: string | null
  onSupplierIdChange: (id: string | null) => void

  /** Sender name — auto-filled when a supplier is picked, editable. */
  senderName: string
  onSenderNameChange: (name: string) => void

  currency: SupportedCurrency
  onCurrencyChange: (currency: SupportedCurrency) => void

  disabled?: boolean
  /**
   * When true, mark Supplier as required in the label. The parent still
   * does the actual validation on submit — this just signals the UI.
   */
  required?: boolean
}

export function CheckCounterpartyFields({
  supplierId,
  onSupplierIdChange,
  senderName,
  onSenderNameChange,
  currency,
  onCurrencyChange,
  disabled,
  required = true,
}: Props) {
  // Load all suppliers (don't filter to active-only) so historical checks
  // with now-inactive suppliers still render the name. The API caps the
  // limit at 100 — anything beyond is handled by the singleton fetch
  // below for the currently-selected row.
  const { data, isLoading } = useSuppliers({ limit: 100 })
  const listSuppliers = data?.suppliers ?? []

  // When the selected supplierId isn't in the loaded list (paginated past
  // the limit, or fetched too narrowly), pull it directly by id so the
  // picker button can render the supplier's name instead of the raw UUID.
  const isInList = supplierId ? listSuppliers.some((s) => s.id === supplierId) : true
  const { data: detachedSupplier } = useSupplier(
    supplierId && !isLoading && !isInList ? supplierId : null,
  )

  // Merge the detached supplier (if any) so the Combobox has a label to
  // display for the currently-selected value. De-dupe by id.
  const suppliers = detachedSupplier
    ? [detachedSupplier, ...listSuppliers.filter((s) => s.id !== detachedSupplier.id)]
    : listSuppliers

  // When a supplier is picked, seed the senderName from supplier.name —
  // but only if the user hasn't already typed a value, so we don't clobber
  // an override. Picking a different supplier replaces the name (it tracks
  // the picker until the user edits).
  useEffect(() => {
    if (!supplierId) return
    const picked = suppliers.find((s) => s.id === supplierId)
    if (!picked) return
    if (senderName.trim() === '' || isAutoFilledFromAnySupplier(senderName, suppliers)) {
      onSenderNameChange(picked.name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, suppliers.length])

  const options = suppliers.map((s) => ({
    value: s.id,
    label: s.isActive === false ? `${s.name} (inactive)` : s.name,
  }))

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="supplier-picker">
          Supplier {required && <span className="text-destructive">*</span>}
        </Label>
        <Combobox
          options={options}
          value={supplierId}
          onValueChange={onSupplierIdChange}
          placeholder={isLoading ? 'Loading suppliers…' : 'Select a supplier'}
          searchPlaceholder="Search suppliers…"
          emptyText="No suppliers match — try a different search or add one in Suppliers."
          disabled={disabled || isLoading}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Links this check to the supplier record so reporting can roll up commissions per supplier.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sender-name">Sender name on check</Label>
        <Input
          id="sender-name"
          value={senderName}
          onChange={(e) => onSenderNameChange(e.target.value)}
          placeholder="As written on the check"
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="currency">Currency</Label>
        <Select
          value={currency}
          onValueChange={(v) => onCurrencyChange(v as SupportedCurrency)}
          disabled={disabled}
        >
          <SelectTrigger id="currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// Treat the senderName as "auto-filled" if it exactly matches the name of
// ANY supplier in the current list — so re-picking still updates it.
function isAutoFilledFromAnySupplier(name: string, suppliers: { name: string }[]): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  return suppliers.some((s) => s.name === trimmed)
}
