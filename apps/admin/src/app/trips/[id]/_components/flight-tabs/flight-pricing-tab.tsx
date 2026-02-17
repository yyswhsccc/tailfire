'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PRICING_TYPES = [
  { value: 'per_person', label: 'Per Person' },
  { value: 'per_room', label: 'Per Room' },
  { value: 'flat_rate', label: 'Flat Rate' },
  { value: 'per_night', label: 'Per Night' },
] as const

interface FlightPricingTabProps {
  pricingData: {
    pricingType: string
    currency: string
  }
  onPricingDataChange: (data: any) => void
}

export function FlightPricingTab({
  pricingData,
  onPricingDataChange,
}: FlightPricingTabProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-ash-900">Pricing Information</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Pricing Type
            </label>
            <Select
              value={pricingData.pricingType}
              onValueChange={(value) => onPricingDataChange({ ...pricingData, pricingType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICING_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-ash-900 block mb-2">
              Currency
            </label>
            <Input
              value={pricingData.currency}
              onChange={(e) => onPricingDataChange({ ...pricingData, currency: e.target.value.toUpperCase() })}
              placeholder="USD"
              maxLength={3}
            />
          </div>
        </div>

        <div className="rounded-lg bg-ash-50 p-4 mt-6">
          <p className="text-sm text-ash-600">
            <strong>Note:</strong> Detailed pricing information including payment schedules,
            commissions, and supplier details will be available once the shared pricing tables
            are fully implemented.
          </p>
        </div>
      </div>
    </div>
  )
}
