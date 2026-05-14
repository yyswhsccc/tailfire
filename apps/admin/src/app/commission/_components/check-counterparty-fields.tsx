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

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SupplierCombobox } from '@/components/suppliers/supplier-combobox'
import { useSupplier } from '@/hooks/use-suppliers'

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
  // Pull the selected supplier by id so the combobox button can render its
  // name (the SupplierCombobox tracks value-by-name, so it needs the name
  // string for the current selection). Skips the fetch when nothing is
  // selected.
  const { data: selectedSupplier } = useSupplier(supplierId ?? null)
  const selectedName = selectedSupplier?.name ?? null

  // Remember names of every supplier we've seen via the picker so the
  // senderName auto-fill heuristic can recognize a value as
  // "matches-some-known-supplier" and replace it when the user re-picks.
  const [seenNames, setSeenNames] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (selectedSupplier?.name) {
      setSeenNames((prev) => (prev.has(selectedSupplier.name) ? prev : new Set(prev).add(selectedSupplier.name)))
    }
  }, [selectedSupplier?.name])

  // When the selected supplier resolves, seed senderName from supplier.name —
  // but only if the user hasn't typed an override, so we don't clobber d/b/a
  // names. Picking a different supplier replaces the name (tracks the picker
  // until the user edits).
  useEffect(() => {
    if (!selectedSupplier) return
    if (senderName.trim() === '' || isAutoFilledFromAnySupplier(senderName, seenNames)) {
      onSenderNameChange(selectedSupplier.name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSupplier?.id])

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="supplier-picker">
          Supplier {required && <span className="text-destructive">*</span>}
        </Label>
        <SupplierCombobox
          value={selectedName}
          onValueChange={(name) => {
            // Clearing the supplier from the picker also clears the id —
            // the new-supplier-creation path below handles the inverse via
            // onSupplierSelect.
            if (!name) onSupplierIdChange(null)
          }}
          onSupplierSelect={(supplier) => onSupplierIdChange(supplier?.id ?? null)}
          placeholder="Select a supplier…"
          disabled={disabled}
          showOnlyActive={false}
          allowCreate
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
// any supplier we've seen via the picker — so re-picking still updates it.
function isAutoFilledFromAnySupplier(name: string, seenNames: Set<string>): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  return seenNames.has(trimmed)
}
