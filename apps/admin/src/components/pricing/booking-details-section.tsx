'use client'

/**
 * Reusable Booking Details Section Component
 *
 * Handles supplier, terms & conditions, cancellation policy, and confirmation details.
 * Reusable across all activity forms.
 *
 * When a supplier is selected, auto-fills T&C and cancellation policy from supplier defaults
 * (only if fields are empty) and notifies parent of supplier defaults via callback.
 */

import { type PricingData } from '@/lib/pricing'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { SupplierCombobox } from '@/components/suppliers/supplier-combobox'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import type { SupplierDto } from '@tailfire/shared-types'

/**
 * Supplier defaults passed to parent form for commission calculation
 */
export interface SupplierDefaults {
  /** Commission rate parsed from "10.00" string to number (e.g., 10.00) */
  commissionRate: number | null
  /** Default terms and conditions text */
  termsAndConditions: string | null
  /** Default cancellation policy text */
  cancellationPolicy: string | null
}

interface BookingDetailsSectionProps {
  pricingData: PricingData
  onUpdate: (updates: Partial<PricingData>) => void
  /** Callback when supplier defaults are applied (for commission rate) */
  onSupplierDefaultsApplied?: (defaults: SupplierDefaults) => void
  /** Navigate to a tab in the parent form (e.g., 'documents') */
  onNavigateToTab?: (tab: string) => void
  /** Booking date (ISO string YYYY-MM-DD) — lives on the activity, not pricing */
  bookingDate?: string | null
  /** Callback when booking date changes */
  onBookingDateChange?: (date: string | null) => void
}

export function BookingDetailsSection({
  pricingData,
  onUpdate,
  onSupplierDefaultsApplied,
  onNavigateToTab,
  bookingDate,
  onBookingDateChange,
}: BookingDetailsSectionProps) {
  /**
   * Handle supplier selection with defaults application
   * - Updates supplier name
   * - Auto-fills T&C and cancellation policy if empty
   * - Notifies parent of supplier defaults for commission calculation
   */
  const handleSupplierSelect = (supplier: SupplierDto | null) => {
    if (!supplier) {
      // Clearing selection - notify parent with null defaults
      onSupplierDefaultsApplied?.({
        commissionRate: null,
        termsAndConditions: null,
        cancellationPolicy: null,
      })
      return
    }

    // Build updates object - only apply defaults if fields are empty
    const updates: Partial<PricingData> = {}

    // Auto-fill Terms & Conditions if empty
    if (!pricingData.termsAndConditions?.trim() && supplier.defaultTermsAndConditions) {
      updates.termsAndConditions = supplier.defaultTermsAndConditions
    }

    // Auto-fill Cancellation Policy if empty
    if (!pricingData.cancellationPolicy?.trim() && supplier.defaultCancellationPolicy) {
      updates.cancellationPolicy = supplier.defaultCancellationPolicy
    }

    // Apply updates if any defaults were filled
    if (Object.keys(updates).length > 0) {
      onUpdate(updates)
    }

    // Parse commission rate from string "10.00" to number 10.00
    const commissionRate = supplier.defaultCommissionRate
      ? parseFloat(supplier.defaultCommissionRate)
      : null

    // Notify parent of supplier defaults
    onSupplierDefaultsApplied?.({
      commissionRate: commissionRate && !isNaN(commissionRate) ? commissionRate : null,
      termsAndConditions: supplier.defaultTermsAndConditions,
      cancellationPolicy: supplier.defaultCancellationPolicy,
    })
  }

  return (
    <Card className="p-6 space-y-6">
      <h3 className="text-lg font-semibold">Booking Details</h3>

      {/* Supplier */}
      <div className="space-y-2" data-field="supplier">
        <Label className="text-sm font-medium text-gray-700">Supplier</Label>
        <SupplierCombobox
          value={pricingData.supplier || null}
          onValueChange={(value) => onUpdate({ supplier: value || '' })}
          onSupplierSelect={handleSupplierSelect}
          placeholder="Search for supplier..."
          allowCreate
        />
      </div>

      {/* Booking Date */}
      {onBookingDateChange && (
        <div className="space-y-2" data-field="bookingDate">
          <Label className="text-sm font-medium text-gray-700">Booking Date</Label>
          <DatePickerEnhanced
            value={bookingDate || null}
            onChange={(date) => onBookingDateChange(date)}
            placeholder="YYYY-MM-DD"
          />
        </div>
      )}

      {/* Terms & Conditions */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Terms & Conditions</Label>
        <Textarea
          rows={3}
          placeholder="Enter terms and conditions..."
          value={pricingData.termsAndConditions || ''}
          onChange={(e) => onUpdate({ termsAndConditions: e.target.value })}
        />
      </div>

      {/* Cancellation Policy */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">Cancellation Policy</Label>
        <Textarea
          rows={3}
          placeholder="Enter cancellation policy..."
          value={pricingData.cancellationPolicy || ''}
          onChange={(e) => onUpdate({ cancellationPolicy: e.target.value })}
        />
      </div>

      <Separator />

      {/* Confirmation Details */}
      <div className="space-y-4">
        <h4 className="text-md font-semibold">Confirmation Details</h4>

        <div className="space-y-2" data-field="confirmationNumber">
          <Label className="text-sm font-medium text-gray-700">Confirmation Number</Label>
          <Input
            placeholder="Enter confirmation number..."
            value={pricingData.confirmationNumber || ''}
            onChange={(e) => onUpdate({ confirmationNumber: e.target.value })}
          />
        </div>

        {/* #302 — external "Book this activity" CTA URL surfaced in the
            shared-trip proposal preview. Empty = no CTA rendered. */}
        <div className="space-y-2" data-field="referralUrl">
          <Label className="text-sm font-medium text-gray-700">
            Client booking link <span className="text-xs text-gray-500 font-normal">(optional)</span>
          </Label>
          <Input
            type="url"
            placeholder="https://..."
            value={pricingData.referralUrl || ''}
            onChange={(e) => onUpdate({ referralUrl: e.target.value })}
          />
          <p className="text-xs text-gray-500">
            Shown as a “Book this activity →” button on the client proposal preview. Use a direct booking or affiliate link.
          </p>
        </div>

        {/* Document Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => onNavigateToTab?.('documents')}
          >
            Upload Receipt
          </Button>
          <Button variant="ghost" size="sm" type="button">
            Add Additional Confirmation Details
          </Button>
        </div>
      </div>
    </Card>
  )
}
