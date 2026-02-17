'use client'

import { DollarSign, Bed } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SailingDetailResponse } from '@/hooks/use-cruise-library'

interface CabinPricingGridProps {
  sailing: SailingDetailResponse
}

/**
 * Format price in dollars from cents
 */
function formatPrice(cents: number | null): string {
  if (cents === null) return 'N/A'
  return `$${Math.round(cents / 100).toLocaleString()}`
}

const CABIN_CATEGORIES = [
  {
    key: 'inside',
    label: 'Inside',
    priceKey: 'cheapestInside' as const,
    description: 'Interior cabin with no windows',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  {
    key: 'oceanview',
    label: 'Ocean View',
    priceKey: 'cheapestOceanview' as const,
    description: 'Cabin with a window or porthole',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    key: 'balcony',
    label: 'Balcony',
    priceKey: 'cheapestBalcony' as const,
    description: 'Private balcony with ocean views',
    color: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    key: 'suite',
    label: 'Suite',
    priceKey: 'cheapestSuite' as const,
    description: 'Luxury suite with extra space',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
]

export function CabinPricingGrid({ sailing }: CabinPricingGridProps) {
  const { priceSummary } = sailing

  // Check if any prices are available
  const hasAnyPrice = CABIN_CATEGORIES.some(
    (cat) => priceSummary[cat.priceKey] !== null
  )

  if (!hasAnyPrice) {
    return (
      <div>
        <h3 className="font-semibold text-sm text-ash-900 mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Cabin Pricing
        </h3>
        <div className="bg-ash-50 rounded-lg p-4 text-center text-sm text-ash-500">
          Pricing information is not currently available for this sailing.
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="font-semibold text-sm text-ash-900 mb-3 flex items-center gap-2">
        <DollarSign className="h-4 w-4" />
        Cabin Pricing
        <span className="text-xs font-normal text-ash-500 ml-2">
          (per person, double occupancy)
        </span>
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {CABIN_CATEGORIES.map((category) => {
          const price = priceSummary[category.priceKey]

          return (
            <div
              key={category.key}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                price !== null ? category.color : 'bg-ash-50 text-ash-400 border-ash-200'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Bed className="h-4 w-4" />
                <span className="font-medium text-sm">{category.label}</span>
              </div>
              <p className="text-xl font-bold">
                {price !== null ? formatPrice(price) : 'N/A'}
              </p>
              <p className="text-xs opacity-75 mt-1">{category.description}</p>
            </div>
          )
        })}
      </div>

      {/* Detailed Pricing Table (if we have detailed prices) */}
      {sailing.prices.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-ash-500 cursor-pointer hover:text-ash-700">
            View all {sailing.prices.length} cabin options
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ash-200">
                  <th className="text-left py-2 px-2 font-medium text-ash-600">Cabin Code</th>
                  <th className="text-left py-2 px-2 font-medium text-ash-600">Category</th>
                  <th className="text-right py-2 px-2 font-medium text-ash-600">Base</th>
                  <th className="text-right py-2 px-2 font-medium text-ash-600">Taxes</th>
                  <th className="text-right py-2 px-2 font-medium text-ash-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ash-100">
                {sailing.prices.slice(0, 20).map((price) => (
                  <tr key={price.cabinCode} className="hover:bg-ash-50">
                    <td className="py-2 px-2 font-mono text-xs">{price.cabinCode}</td>
                    <td className="py-2 px-2 capitalize">{price.cabinCategory}</td>
                    <td className="py-2 px-2 text-right">{formatPrice(price.basePriceCents)}</td>
                    <td className="py-2 px-2 text-right text-ash-500">
                      {formatPrice(price.taxesCents)}
                    </td>
                    <td className="py-2 px-2 text-right font-medium">
                      {formatPrice(price.totalPriceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sailing.prices.length > 20 && (
              <p className="text-xs text-ash-500 mt-2 text-center">
                Showing 20 of {sailing.prices.length} cabin options
              </p>
            )}
          </div>
        </details>
      )}
    </div>
  )
}
