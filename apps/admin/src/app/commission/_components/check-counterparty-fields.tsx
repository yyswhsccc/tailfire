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
import type { SupplierDto } from '@tailfire/shared-types'

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
  // Resolve the currently-selected supplier by id so the combobox button
  // can show the name (the combobox is value-by-name internally).
  // Server-side search inside the combobox removes the previous 100-item
  // cap that made suppliers past "Crystal Inn" unreachable.
  const { data: selectedSupplier } = useSupplier(supplierId || null)
  const selectedSupplierName = selectedSupplier?.name ?? null

  const handleSupplierSelect = (supplier: SupplierDto | null) => {
    onSupplierIdChange(supplier?.id ?? null)
    // Seed senderName from the picked supplier when blank or when the
    // current value still matches a supplier name (i.e., not user-typed
    // override). Use the picked supplier's name directly — no need to
    // search a local list.
    if (supplier && (senderName.trim() === '' || senderName.trim() === selectedSupplierName)) {
      onSenderNameChange(supplier.name)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="supplier-picker">
          Supplier {required && <span className="text-destructive">*</span>}
        </Label>
        <SupplierCombobox
          value={selectedSupplierName}
          onValueChange={(name) => {
            // Combobox passes name == current → clear path. Drop supplier id too.
            if (!name) onSupplierIdChange(null)
          }}
          onSupplierSelect={handleSupplierSelect}
          placeholder="Select a supplier"
          disabled={disabled}
          showOnlyActive={false}
          allowCreate={false}
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

