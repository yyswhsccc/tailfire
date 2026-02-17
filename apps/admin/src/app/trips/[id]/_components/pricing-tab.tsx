'use client'

import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DollarSign } from 'lucide-react'

const PRICING_TYPES = [
  { value: 'per_person', label: 'Per Person' },
  { value: 'per_room', label: 'Per Room' },
  { value: 'flat_rate', label: 'Flat Rate' },
  { value: 'per_night', label: 'Per Night' },
  { value: 'per_vehicle', label: 'Per Vehicle' },
  { value: 'per_trip', label: 'Per Trip' },
] as const

interface PricingTabProps {
  componentData: {
    pricingType?: string | null
    currency?: string
    [key: string]: unknown
  }
  onUpdate: (updates: Partial<PricingTabProps['componentData']>) => void
}

export function PricingTab({ componentData, onUpdate }: PricingTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4" />
          Pricing Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-ash-900 block mb-2">
                Pricing Type
              </label>
              <Select
                value={componentData.pricingType || 'flat_rate'}
                onValueChange={(value) => onUpdate({ pricingType: value })}
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
                value={componentData.currency || ''}
                onChange={(e) => onUpdate({ currency: e.target.value.toUpperCase() })}
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
      </CardContent>
    </Card>
  )
}
