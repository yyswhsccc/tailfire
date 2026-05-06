'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUsers } from '@/hooks/use-users'
import { api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'

interface ReportFiltersProps {
  slug: string
  filters: Record<string, string>
  onChange: (filters: Record<string, string>) => void
  isAdmin?: boolean
}

/** Report slugs that support agent filtering */
const AGENT_FILTER_SLUGS = new Set([
  'booked-sales',
  'departed-sales',
  'sales-by-destination',
  'sales-by-agent',
  'commission-aging',
  'commission-reconciliation',
  'agent-commission-statement',
  'payment-schedule',
])

/** Report slugs that support trip type filtering */
const TRIP_TYPE_SLUGS = new Set([
  'booked-sales',
  'departed-sales',
  'sales-by-destination',
])

/** Report slugs that support supplier name filtering */
const SUPPLIER_FILTER_SLUGS = new Set([
  'sales-by-supplier',
  'booked-sales-by-supplier',
  'departed-sales-by-supplier',
])

/** Report slugs that support daysThreshold filtering */
const DAYS_THRESHOLD_SLUGS = new Set([
  'dormant-clients',
  'passport-expiry',
  'upcoming-birthdays',
])

function updateFilter(
  prev: Record<string, string>,
  key: string,
  value: string,
): Record<string, string> {
  const next = { ...prev }
  if (value === '' || value === 'all') {
    delete next[key]
  } else {
    next[key] = value
  }
  return next
}

export function ReportFilters({ slug, filters, onChange, isAdmin }: ReportFiltersProps) {
  const showAgent = isAdmin && AGENT_FILTER_SLUGS.has(slug)
  const showTripType = TRIP_TYPE_SLUGS.has(slug)
  const showSupplier = SUPPLIER_FILTER_SLUGS.has(slug)
  const showDaysThreshold = DAYS_THRESHOLD_SLUGS.has(slug)
  const [supplierSearch, setSupplierSearch] = useState('')

  // Fetch users for the agent dropdown — only fetches when showAgent is true
  const { data: usersData } = useUsers(
    showAgent ? { role: 'user', limit: 100 } : {},
  )
  const agents = showAgent ? (usersData?.users ?? []) : []

  // Fetch suppliers for dropdown — only fetches when showSupplier is true
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', 'list'],
    queryFn: () => api.get<{ data: Array<{ id: string; name: string }> }>('/suppliers?limit=500'),
    enabled: showSupplier,
  })
  const suppliers = showSupplier ? (suppliersData?.data ?? []) : []
  const selectedSuppliers = (filters.supplierName ?? '').split(',').filter(Boolean)

  const toggleSupplier = (name: string) => {
    const current = new Set(selectedSuppliers)
    if (current.has(name)) {
      current.delete(name)
    } else {
      current.add(name)
    }
    onChange(updateFilter(filters, 'supplierName', [...current].join(',')))
  }

  // If no filters are applicable, render nothing
  if (!showAgent && !showTripType && !showSupplier && !showDaysThreshold) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {showAgent && (
        <Select
          value={filters.agentId ?? 'all'}
          onValueChange={(v) => onChange(updateFilter(filters, 'agentId', v))}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.firstName} {agent.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {showTripType && (
        <Select
          value={filters.tripType ?? 'all'}
          onValueChange={(v) => onChange(updateFilter(filters, 'tripType', v))}
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="leisure">Leisure</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="group">Group</SelectItem>
            <SelectItem value="honeymoon">Honeymoon</SelectItem>
            <SelectItem value="corporate">Corporate</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      )}

      {showSupplier && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Input
              type="text"
              placeholder="Search suppliers..."
              className="h-8 w-[220px] text-xs"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
            />
            {supplierSearch && (
              <div className="absolute z-50 mt-1 max-h-48 w-[280px] overflow-auto rounded-md border bg-popover p-1 shadow-md">
                {suppliers
                  .filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                  .slice(0, 15)
                  .map(s => (
                    <button
                      key={s.id}
                      className={`w-full rounded px-2 py-1 text-left text-xs hover:bg-accent ${selectedSuppliers.includes(s.name) ? 'bg-accent font-medium' : ''}`}
                      onClick={() => { toggleSupplier(s.name); setSupplierSearch('') }}
                    >
                      {s.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
          {selectedSuppliers.map(name => (
            <Badge key={name} variant="secondary" className="text-xs gap-1">
              {name}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleSupplier(name)} />
            </Badge>
          ))}
        </div>
      )}

      {showDaysThreshold && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Days threshold:</span>
          <Input
            type="number"
            min={1}
            className="h-8 w-[80px] text-xs"
            value={filters.daysThreshold ?? ''}
            placeholder="90"
            onChange={(e) => onChange(updateFilter(filters, 'daysThreshold', e.target.value))}
          />
        </div>
      )}
    </div>
  )
}
