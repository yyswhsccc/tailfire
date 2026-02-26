'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { useContactFilterOptions } from '@/hooks/use-contacts'
import { cn } from '@/lib/utils'
import type { ContactFilterDto } from '@tailfire/shared-types/api'

interface ContactsFilterPanelProps {
  filters: ContactFilterDto
  onFiltersChange: (filters: ContactFilterDto) => void
}

export function ContactsFilterPanel({ filters, onFiltersChange }: ContactsFilterPanelProps) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const { data: filterOptions } = useContactFilterOptions()

  const activeFilterCount = [
    (filters.tags?.length ?? 0) > 0,
  ].filter(Boolean).length

  const handleTagToggle = (tagName: string) => {
    const current = filters.tags || []
    const updated = current.includes(tagName)
      ? current.filter((t) => t !== tagName)
      : [...current, tagName]
    onFiltersChange({ ...filters, tags: updated.length > 0 ? updated : undefined, page: 1 })
  }

  const handleClearFilters = () => {
    onFiltersChange({
      page: filters.page,
      limit: filters.limit,
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    })
  }

  return (
    <div className="flex items-center gap-2">
      {/* Tags Filter (multi-select) */}
      {(filterOptions?.tags?.length ?? 0) > 0 && (
        <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn((filters.tags?.length ?? 0) > 0 && 'border-phoenix-gold-500 bg-phoenix-gold-50')}
            >
              Tags
              {(filters.tags?.length ?? 0) > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5">
                  {filters.tags!.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search tags..." />
              <CommandList>
                <CommandEmpty>No tags found.</CommandEmpty>
                <CommandGroup>
                  {(filterOptions?.tags || []).map((tagName) => (
                    <CommandItem
                      key={tagName}
                      value={tagName}
                      onSelect={() => handleTagToggle(tagName)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          filters.tags?.includes(tagName) ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {tagName}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Clear Filters */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="mr-1 h-3 w-3" />
          Clear ({activeFilterCount})
        </Button>
      )}
    </div>
  )
}
