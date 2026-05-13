'use client'

/**
 * Reusable Pricing Section Component
 *
 * Handles invoice type, pricing type, total price, taxes & fees, and currency.
 * Commission is handled separately by CommissionSection at the bottom of the booking tab.
 * Uses usePriceInput to prevent auto-tab bug and shared validation.
 * Reusable across all activity forms (flight, lodging, transportation, etc.)
 *
 * Pricing type behaviors:
 * - flat_rate: Total Price + Taxes & Fees + Currency (default)
 * - per_person: Per-person breakdown table + Taxes & Fees + Currency (total auto-computed)
 * - per_room: Same as flat_rate for now (deferred to future PR)
 *
 * When an activity is linked to a package, the pricing fields are hidden and
 * an info banner directs the user to manage pricing at the package level.
 */

import { useState, useCallback, useMemo } from 'react'
import { usePriceInput } from '@/hooks/use-price-input'
import {
  type PricingData,
  type ValidationErrors,
  type PricingBreakdownItem,
  dollarsToCents,
  centsToDollars,
} from '@/lib/pricing'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { InfoIcon, AlertCircle, Plus, Trash2, SplitSquareHorizontal } from 'lucide-react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import Link from 'next/link'

const NUMERIC_INPUT_CLASS = 'text-right'

type PricingType = 'per_person' | 'per_room' | 'flat_rate' | 'per_night' | 'total'

/** Minimal package info for dropdown selection */
export interface PackageOption {
  id: string
  name: string
}

/** Traveler info for per-person breakdown */
export interface PricingTraveler {
  id: string
  name: string
}

interface PricingSectionProps {
  pricingData: PricingData
  onUpdate: (updates: Partial<PricingData>) => void
  errors?: ValidationErrors
  /** Optional array of allowed pricing types for this activity (e.g., lodging only allows 'per_room') */
  allowedPricingTypes?: PricingType[]
  /** Current package ID if this activity is linked to a package */
  packageId?: string | null
  /** Available packages for dropdown selection */
  packages?: PackageOption[]
  /** Trip ID for navigation links */
  tripId?: string
  /** Callback when package selection changes */
  onPackageChange?: (packageId: string | null) => void
  /** Whether this activity is a child of a package (linked via parentActivityId) */
  isChildOfPackage?: boolean
  /** Name of the parent package (for display in warning) */
  parentPackageName?: string | null
  /** Travelers linked to this activity (for per-person breakdown) */
  travelers?: PricingTraveler[]
}

const DEFAULT_PRICING_TYPES: { value: PricingType; label: string }[] = [
  { value: 'flat_rate', label: 'Flat Rate' },
  { value: 'per_person', label: 'Per Person' },
  { value: 'per_room', label: 'Per Room' },
]

/**
 * Normalize pricing type for UI display.
 * Legacy values 'total' and 'per_night' are treated as 'flat_rate'.
 */
function normalizeForDisplay(pricingType: string): PricingType {
  if (pricingType === 'total' || pricingType === 'per_night') return 'flat_rate'
  return pricingType as PricingType
}

/** Small info icon with hover tooltip */
function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <InfoIcon className="h-3.5 w-3.5 text-gray-400 cursor-help inline-block ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function PricingSection({
  pricingData,
  onUpdate,
  errors = {},
  allowedPricingTypes,
  packageId,
  packages = [],
  tripId,
  onPackageChange,
  isChildOfPackage = false,
  parentPackageName,
  travelers = [],
}: PricingSectionProps) {
  const effectivePricingType = normalizeForDisplay(pricingData.pricingType)
  const isPerPerson = effectivePricingType === 'per_person'

  // Compute total from breakdown for per_person mode
  const breakdownTotal = useMemo(() => {
    if (!isPerPerson || !pricingData.pricingBreakdown?.length) return 0
    return pricingData.pricingBreakdown.reduce((sum, item) => sum + (item.priceCents || 0), 0)
  }, [isPerPerson, pricingData.pricingBreakdown])

  // For flat_rate/per_room, use regular price input
  const totalPrice = usePriceInput(isPerPerson ? breakdownTotal : (pricingData.totalPriceCents || 0))
  const taxesAndFees = usePriceInput(pricingData.taxesAndFeesCents || 0)

  // Filter pricing types if allowedPricingTypes is provided
  const availablePricingTypes = allowedPricingTypes
    ? DEFAULT_PRICING_TYPES.filter(type => allowedPricingTypes.includes(type.value))
    : DEFAULT_PRICING_TYPES

  const invoiceType = pricingData.invoiceType || 'individual_item'

  // Determine if pricing is managed by package
  // Either explicitly selected (part_of_package + packageId) OR structurally linked (isChildOfPackage)
  const isLinkedToPackage = isChildOfPackage || (invoiceType === 'part_of_package' && !!packageId)

  const currencySymbol = pricingData.currency === 'EUR' ? '\u20AC' : pricingData.currency === 'GBP' ? '\u00A3' : '$'

  // Handle invoice type change
  const handleInvoiceTypeChange = (value: 'individual_item' | 'part_of_package') => {
    onUpdate({ invoiceType: value })
    // If switching to individual, clear package association
    if (value === 'individual_item' && onPackageChange) {
      onPackageChange(null)
    }
  }

  // Handle package selection
  const handlePackageSelect = (selectedPackageId: string) => {
    if (onPackageChange) {
      onPackageChange(selectedPackageId)
    }
  }

  // Handle pricing type change
  const handlePricingTypeChange = (value: string) => {
    const newType = value as PricingType
    onUpdate({ pricingType: newType })

    // When switching to per_person, initialize breakdown from travelers if empty
    if (newType === 'per_person' && (!pricingData.pricingBreakdown || pricingData.pricingBreakdown.length === 0)) {
      if (travelers.length > 0) {
        const breakdown: PricingBreakdownItem[] = travelers.map(t => ({
          label: t.name,
          priceCents: 0,
          travelerId: t.id,
        }))
        onUpdate({ pricingBreakdown: breakdown })
      }
    }

    // When switching away from per_person, clear breakdown and keep current total
    if (newType !== 'per_person' && pricingData.pricingBreakdown?.length) {
      onUpdate({ pricingBreakdown: null })
    }
  }

  // Per-person breakdown handlers
  const handleBreakdownRowChange = useCallback((index: number, priceCents: number) => {
    const breakdown = [...(pricingData.pricingBreakdown || [])]
    const existing = breakdown[index]
    if (!existing) return
    breakdown[index] = { ...existing, priceCents }
    const newTotal = breakdown.reduce((sum, item) => sum + (item.priceCents || 0), 0)
    onUpdate({ pricingBreakdown: breakdown, totalPriceCents: newTotal })
  }, [pricingData.pricingBreakdown, onUpdate])

  const handleBreakdownLabelChange = useCallback((index: number, label: string) => {
    const breakdown = [...(pricingData.pricingBreakdown || [])]
    const existing = breakdown[index]
    if (!existing) return
    breakdown[index] = { ...existing, label }
    onUpdate({ pricingBreakdown: breakdown })
  }, [pricingData.pricingBreakdown, onUpdate])

  const handleAddRow = useCallback(() => {
    const breakdown = [...(pricingData.pricingBreakdown || [])]
    breakdown.push({ label: '', priceCents: 0 })
    onUpdate({ pricingBreakdown: breakdown })
  }, [pricingData.pricingBreakdown, onUpdate])

  const handleRemoveRow = useCallback((index: number) => {
    const breakdown = [...(pricingData.pricingBreakdown || [])]
    breakdown.splice(index, 1)
    const newTotal = breakdown.reduce((sum, item) => sum + (item.priceCents || 0), 0)
    onUpdate({ pricingBreakdown: breakdown, totalPriceCents: newTotal })
  }, [pricingData.pricingBreakdown, onUpdate])

  // Line items breakdown handlers (DON'T auto-update total — total is independent)
  const handleLineItemRowChange = useCallback((index: number, priceCents: number) => {
    const breakdown = [...(pricingData.pricingBreakdown || [])]
    const existing = breakdown[index]
    if (!existing) return
    breakdown[index] = { ...existing, priceCents }
    onUpdate({ pricingBreakdown: breakdown })
  }, [pricingData.pricingBreakdown, onUpdate])

  const handleLineItemRemove = useCallback((index: number) => {
    const breakdown = [...(pricingData.pricingBreakdown || [])]
    breakdown.splice(index, 1)
    onUpdate({ pricingBreakdown: breakdown })
  }, [pricingData.pricingBreakdown, onUpdate])

  const handleSplitEvenly = useCallback(() => {
    const breakdown = pricingData.pricingBreakdown || []
    if (breakdown.length === 0) return
    const currentTotal = pricingData.totalPriceCents || 0
    const perPerson = Math.floor(currentTotal / breakdown.length)
    const remainder = currentTotal - (perPerson * breakdown.length)
    const newBreakdown = breakdown.map((item, i) => ({
      ...item,
      priceCents: perPerson + (i === 0 ? remainder : 0), // give remainder to first person
    }))
    onUpdate({ pricingBreakdown: newBreakdown })
  }, [pricingData.pricingBreakdown, pricingData.totalPriceCents, onUpdate])

  // Find current package name for display
  const currentPackageName = packages.find(p => p.id === packageId)?.name

  return (
    <Card className="p-6 space-y-6">
      <h3 className="text-lg font-semibold">Pricing</h3>

      {/* Child of Package Warning - pricing is locked */}
      {isChildOfPackage && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm text-amber-800">
            <strong>Pricing is controlled by the parent package</strong>
            {parentPackageName && <> &quot;{parentPackageName}&quot;</>}.
            <br />
            To edit pricing for this activity, unlink it from the package first.
          </AlertDescription>
        </Alert>
      )}

      {/* Invoice Type Toggle - hidden when child of package */}
      {!isChildOfPackage && (
        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-700">
            How will this activity be invoiced?
            <InfoTooltip text="Individual Item: this activity has its own price and appears as a separate line item. Part of Trip Package: the cost rolls up into a trip package total and is not invoiced separately." />
          </Label>
          <RadioGroup
            value={invoiceType}
            onValueChange={handleInvoiceTypeChange}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="individual_item" id="individual_item" />
              <Label htmlFor="individual_item" className="font-normal cursor-pointer">
                Individual Item
              </Label>
            </div>
            {/* "Part of Trip Package" is only shown when the activity is
                already linked to a package, so it can be unlinked here.
                Linking an unlinked activity happens from the package's
                Add Activities sheet, not from this form. */}
            {invoiceType === 'part_of_package' && !!packageId && (
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="part_of_package" id="part_of_package" />
                <Label htmlFor="part_of_package" className="font-normal cursor-pointer">
                  Part of Trip Package
                </Label>
              </div>
            )}
          </RadioGroup>

          {errors.invoiceType && (
            <p className="text-sm text-red-500">{errors.invoiceType}</p>
          )}
        </div>
      )}

      {/* Package Selection - Show when "Part of Trip Package" is selected (but not when child of package) */}
      {!isChildOfPackage && invoiceType === 'part_of_package' && (
        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-700">Trip Package</Label>
          <Select
            value={packageId || ''}
            onValueChange={handlePackageSelect}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a package">
                {currentPackageName || 'Select a package'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {packages.length === 0 ? (
                <SelectItem value="_empty" disabled>
                  No packages available
                </SelectItem>
              ) : (
                packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Info Banner - Show when linked to package (but not when child of package - separate warning shown) */}
      {!isChildOfPackage && isLinkedToPackage && tripId && (
        <Alert className="border-blue-200 bg-blue-50">
          <InfoIcon className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-800">
            <strong>Looking to Edit this Trip Package Pricing?</strong>
            <br />
            Please visit the{' '}
            <Link
              href={`/trips/${tripId}?tab=bookings`}
              className="font-medium text-blue-600 hover:underline"
            >
              Bookings
            </Link>{' '}
            tab to manage trip package pricing and booking details.
          </AlertDescription>
        </Alert>
      )}

      {/* Pricing fields - hidden when linked to a package */}
      {!isLinkedToPackage && (
        <>
          {/* Pricing Type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              How is this activity priced?
              <InfoTooltip text="Flat Rate: a single total price for the activity. Per Person: individual prices for each traveler that sum to the total. Per Room: priced by room (e.g., hotel stays)." />
            </Label>
            <Select
              value={effectivePricingType}
              onValueChange={handlePricingTypeChange}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availablePricingTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.pricingType && (
              <p className="text-sm text-red-500">{errors.pricingType}</p>
            )}
          </div>

          {/* Per-Person Breakdown Table */}
          {isPerPerson && (
            <PerPersonBreakdown
              breakdown={pricingData.pricingBreakdown || []}
              currencySymbol={currencySymbol}
              onRowPriceChange={handleBreakdownRowChange}
              onRowLabelChange={handleBreakdownLabelChange}
              onAddRow={handleAddRow}
              onRemoveRow={handleRemoveRow}
              onSplitEvenly={handleSplitEvenly}
              totalCents={breakdownTotal}
            />
          )}

          {/* Price Details */}
          <div className={`grid ${isPerPerson ? 'grid-cols-3' : 'grid-cols-3'} gap-4 pt-4 border-t`} data-field="paymentSchedule">
            {/* Total Price */}
            <div className="space-y-2" data-field="totalPrice">
              <Label className="text-sm font-medium text-gray-700">
                Total Price (including taxes & fees)
                <InfoTooltip text="The full price the client pays, including all taxes and fees. This is the amount used for payment schedules and commission calculations." />
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {currencySymbol}
                </span>
                {isPerPerson ? (
                  <Input
                    type="text"
                    className={`pl-7 ${NUMERIC_INPUT_CLASS} bg-gray-50`}
                    value={centsToDollars(breakdownTotal)}
                    readOnly
                    tabIndex={-1}
                  />
                ) : (
                  <Input
                    type="number"
                    step="0.01"
                    className={`pl-7 ${NUMERIC_INPUT_CLASS}`}
                    placeholder="0.00"
                    value={totalPrice.displayValue}
                    onChange={(e) => {
                      totalPrice.onChange(e)
                      const cents = dollarsToCents(e.target.value)
                      onUpdate({ totalPriceCents: cents })
                    }}
                    onBlur={totalPrice.onBlur}
                  />
                )}
              </div>
              {errors.totalPriceCents && (
                <p className="text-sm text-red-500">{errors.totalPriceCents}</p>
              )}
            </div>

            {/* Taxes & Fees */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">
                Taxes & Fees
                <InfoTooltip text="The tax and fee portion already included in the total price. This is for record-keeping only and does not add to the total." />
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {currencySymbol}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  className={`pl-7 ${NUMERIC_INPUT_CLASS}`}
                  placeholder="0.00"
                  value={taxesAndFees.displayValue}
                  onChange={(e) => {
                    taxesAndFees.onChange(e)
                    const cents = dollarsToCents(e.target.value)
                    onUpdate({ taxesAndFeesCents: cents })
                  }}
                  onBlur={taxesAndFees.onBlur}
                />
              </div>
              {errors.taxesAndFeesCents && (
                <p className="text-sm text-red-500">{errors.taxesAndFeesCents}</p>
              )}
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Currency</Label>
              <Select
                value={pricingData.currency}
                onValueChange={(value) => onUpdate({ currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
              {errors.currency && (
                <p className="text-sm text-red-500">{errors.currency}</p>
              )}
            </div>
          </div>

          {/* Line Items Breakdown - shown for flat_rate, per_room, per_night modes */}
          {!isPerPerson && (
            <LineItemsBreakdown
              breakdown={pricingData.pricingBreakdown || []}
              currencySymbol={currencySymbol}
              onRowPriceChange={handleLineItemRowChange}
              onRowLabelChange={handleBreakdownLabelChange}
              onAddRow={handleAddRow}
              onRemoveRow={handleLineItemRemove}
            />
          )}
        </>
      )}
    </Card>
  )
}

// =============================================================================
// Line Items Breakdown Sub-Component (flat_rate, per_room, per_night)
// =============================================================================

interface LineItemsBreakdownProps {
  breakdown: PricingBreakdownItem[]
  currencySymbol: string
  onRowPriceChange: (index: number, priceCents: number) => void
  onRowLabelChange: (index: number, label: string) => void
  onAddRow: () => void
  onRemoveRow: (index: number) => void
}

function LineItemsBreakdown({
  breakdown,
  currencySymbol,
  onRowPriceChange,
  onRowLabelChange,
  onAddRow,
  onRemoveRow,
}: LineItemsBreakdownProps) {
  if (breakdown.length === 0) {
    return (
      <div className="pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onAddRow}
          className="text-xs text-ash-500 hover:text-ash-900"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Price Breakdown
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-gray-700">
          Price Breakdown
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddRow}
          className="text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Item
        </Button>
      </div>

      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-[1fr_140px_36px] gap-2 px-1">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Item</span>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Amount</span>
          <span />
        </div>

        {/* Rows */}
        {breakdown.map((item, index) => (
          <BreakdownRow
            key={`line-${index}`}
            item={item}
            index={index}
            currencySymbol={currencySymbol}
            onPriceChange={onRowPriceChange}
            onLabelChange={onRowLabelChange}
            onRemove={onRemoveRow}
            hasLinkedTraveler={false}
          />
        ))}
      </div>

      <p className="text-xs text-gray-400">
        Line items are for record-keeping. The total price above is the authoritative amount.
      </p>
    </div>
  )
}

// =============================================================================
// Per-Person Breakdown Sub-Component
// =============================================================================

interface PerPersonBreakdownProps {
  breakdown: PricingBreakdownItem[]
  currencySymbol: string
  onRowPriceChange: (index: number, priceCents: number) => void
  onRowLabelChange: (index: number, label: string) => void
  onAddRow: () => void
  onRemoveRow: (index: number) => void
  onSplitEvenly: () => void
  totalCents: number
}

function PerPersonBreakdown({
  breakdown,
  currencySymbol,
  onRowPriceChange,
  onRowLabelChange,
  onAddRow,
  onRemoveRow,
  onSplitEvenly,
  totalCents,
}: PerPersonBreakdownProps) {
  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-gray-700">
          Per-Person Breakdown
          <InfoTooltip text="Individual prices for each traveler. The total is automatically calculated from these amounts. Use Split Evenly to divide the current total equally." />
        </Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSplitEvenly}
            disabled={breakdown.length === 0}
            className="text-xs"
          >
            <SplitSquareHorizontal className="h-3 w-3 mr-1" />
            Split Evenly
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddRow}
            className="text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Row
          </Button>
        </div>
      </div>

      {breakdown.length === 0 ? (
        <p className="text-sm text-gray-500 italic py-2">
          No travelers linked. Add rows manually or link travelers to this activity.
        </p>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-[1fr_140px_36px] gap-2 px-1">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Traveler</span>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">Price</span>
            <span />
          </div>

          {/* Rows */}
          {breakdown.map((item, index) => (
            <BreakdownRow
              key={item.travelerId || `row-${index}`}
              item={item}
              index={index}
              currencySymbol={currencySymbol}
              onPriceChange={onRowPriceChange}
              onLabelChange={onRowLabelChange}
              onRemove={onRemoveRow}
              hasLinkedTraveler={!!item.travelerId}
            />
          ))}

          {/* Total footer */}
          <div className="grid grid-cols-[1fr_140px_36px] gap-2 px-1 pt-2 border-t border-gray-200">
            <span className="text-sm font-semibold text-gray-900">Total</span>
            <span className="text-sm font-semibold text-gray-900 text-right">
              {currencySymbol}{centsToDollars(totalCents)}
            </span>
            <span />
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Single Breakdown Row
// =============================================================================

interface BreakdownRowProps {
  item: PricingBreakdownItem
  index: number
  currencySymbol: string
  onPriceChange: (index: number, priceCents: number) => void
  onLabelChange: (index: number, label: string) => void
  onRemove: (index: number) => void
  hasLinkedTraveler: boolean
}

function BreakdownRow({
  item,
  index,
  currencySymbol,
  onPriceChange,
  onLabelChange,
  onRemove,
  hasLinkedTraveler,
}: BreakdownRowProps) {
  // Local state for price input to prevent cursor jumping
  const [localPrice, setLocalPrice] = useState(centsToDollars(item.priceCents || 0))

  // Sync when item price changes externally (e.g., split evenly)
  const itemPriceCents = item.priceCents || 0
  const [lastSyncedCents, setLastSyncedCents] = useState(itemPriceCents)
  if (itemPriceCents !== lastSyncedCents) {
    setLocalPrice(centsToDollars(itemPriceCents))
    setLastSyncedCents(itemPriceCents)
  }

  return (
    <div className="grid grid-cols-[1fr_140px_36px] gap-2 items-center">
      {hasLinkedTraveler ? (
        <span className="text-sm text-gray-700 truncate px-1">{item.label}</span>
      ) : (
        <Input
          type="text"
          className="text-sm h-8"
          placeholder="Name"
          value={item.label}
          onChange={(e) => onLabelChange(index, e.target.value)}
        />
      )}
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
          {currencySymbol}
        </span>
        <Input
          type="number"
          step="0.01"
          className={`pl-6 h-8 text-sm ${NUMERIC_INPUT_CLASS}`}
          placeholder="0.00"
          value={localPrice}
          onChange={(e) => {
            setLocalPrice(e.target.value)
            const cents = dollarsToCents(e.target.value)
            setLastSyncedCents(cents)
            onPriceChange(index, cents)
          }}
          onBlur={() => {
            const cents = dollarsToCents(localPrice)
            setLocalPrice(centsToDollars(cents))
          }}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
        onClick={() => onRemove(index)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
