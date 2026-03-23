'use client'

/**
 * Supplier Combobox Component
 *
 * Searchable dropdown for selecting suppliers with optional inline creation.
 * Uses the suppliers API for data and supports both existing supplier selection
 * and creating new suppliers on the fly.
 */

import * as React from 'react'
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useSuppliers, useCreateSupplier } from '@/hooks/use-suppliers'
import type { SupplierDto } from '@tailfire/shared-types'

interface SupplierComboboxProps {
  /** Current supplier name value */
  value?: string | null
  /** Callback when supplier selection changes (name only for backward compatibility) */
  onValueChange: (value: string | null) => void
  /** Callback when supplier is selected with full supplier data */
  onSupplierSelect?: (supplier: SupplierDto | null) => void
  /** Placeholder text when no value is selected */
  placeholder?: string
  /** Whether the combobox is disabled */
  disabled?: boolean
  /** Additional CSS classes */
  className?: string
  /** Allow creating new suppliers inline */
  allowCreate?: boolean
  /** Filter by supplier type */
  supplierType?: string
  /** Filter to show only active suppliers (default: true) */
  showOnlyActive?: boolean
  /** data-field anchor for targeting specific fields (e.g. booking validation UX) */
  'data-field'?: string
}

export function SupplierCombobox({
  value,
  onValueChange,
  onSupplierSelect,
  placeholder = 'Search suppliers...',
  disabled = false,
  className,
  allowCreate = true,
  supplierType,
  showOnlyActive = true,
  'data-field': dataField,
}: SupplierComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')

  // Debounce search to reduce API calls
  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setDebouncedSearch(value)
  }, 300)

  // Fetch suppliers based on search - filter by isActive when showOnlyActive is true
  const { data: suppliersData, isLoading } = useSuppliers({
    search: debouncedSearch || undefined,
    supplierType,
    isActive: showOnlyActive ? true : undefined,
    limit: 20,
  })

  // Create supplier mutation
  const createSupplierMutation = useCreateSupplier()

  const suppliers = suppliersData?.suppliers ?? []

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    debouncedSetSearch(value)
  }

  // Handle supplier selection
  const handleSelect = (supplierName: string) => {
    if (supplierName === value) {
      // Clearing selection
      onValueChange(null)
      onSupplierSelect?.(null)
    } else {
      // Find the full supplier object
      const selectedSupplier = suppliers.find((s) => s.name === supplierName)
      onValueChange(supplierName)
      onSupplierSelect?.(selectedSupplier ?? null)
    }
    setOpen(false)
    setSearchValue('')
    setDebouncedSearch('')
  }

  // Handle creating a new supplier
  const handleCreateSupplier = async () => {
    if (!searchValue.trim()) return

    try {
      const newSupplier = await createSupplierMutation.mutateAsync({
        name: searchValue.trim(),
        supplierType: supplierType || undefined,
      })
      onValueChange(newSupplier.name)
      onSupplierSelect?.(newSupplier)
      setOpen(false)
      setSearchValue('')
      setDebouncedSearch('')
    } catch {
      // Error handling is done in the mutation
    }
  }

  // Check if the search value matches an existing supplier
  const searchMatchesExisting = suppliers.some(
    (s) => s.name.toLowerCase() === searchValue.trim().toLowerCase()
  )

  // Show create option if search doesn't match an existing supplier
  const showCreateOption =
    allowCreate &&
    searchValue.trim() &&
    !searchMatchesExisting &&
    !isLoading

  return (
    <div data-field={dataField}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className
          )}
          disabled={disabled}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search suppliers..."
            value={searchValue}
            onValueChange={handleSearchChange}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : suppliers.length === 0 && !showCreateOption ? (
              <CommandEmpty>No suppliers found.</CommandEmpty>
            ) : (
              <>
                <CommandGroup heading="Suppliers">
                  {suppliers.map((supplier) => (
                    <CommandItem
                      key={supplier.id}
                      value={supplier.name}
                      onSelect={() => handleSelect(supplier.name)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === supplier.name ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{supplier.name}</span>
                        {supplier.supplierType && (
                          <span className="text-xs text-muted-foreground">
                            {supplier.supplierType}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>

                {showCreateOption && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Create New">
                      <CommandItem
                        onSelect={handleCreateSupplier}
                        disabled={createSupplierMutation.isPending}
                        className="cursor-pointer"
                      >
                        {createSupplierMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        <span>
                          Create &quot;{searchValue.trim()}&quot;
                        </span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    </div>
  )
}
