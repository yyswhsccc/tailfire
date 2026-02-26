'use client'

import { useState, KeyboardEvent } from 'react'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from './badge'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from './command'
import { useTags } from '@/hooks/use-tags'
import type { TagResponseDto, TagWithUsageDto } from '@tailfire/shared-types/api'

interface TagInputProps {
  /**
   * Current tag IDs or Tag objects
   * Supports both for backward compatibility
   */
  value: string[] | TagResponseDto[]
  /**
   * Called when tags change - receives array of tag IDs
   */
  onChange: (tagIds: string[]) => void
  /**
   * Filter dropdown to a specific tag type ('system' | 'agent')
   * Leave undefined to show both grouped
   */
  tagType?: 'system' | 'agent'
  /**
   * Callback when a new tag is created inline
   */
  onCreateTag?: (name: string) => Promise<TagResponseDto>
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function TagInput({
  value = [],
  onChange,
  tagType,
  onCreateTag,
  placeholder = 'Add tag...',
  disabled = false,
  className,
}: TagInputProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')

  // Fetch all available tags (both types — we group them in the dropdown)
  const { data: allTags = [], isLoading } = useTags({
    ...(tagType ? { type: tagType } : {}),
    sortBy: 'name',
    sortOrder: 'asc',
    limit: 200,
  })

  // Normalize value to array of tag IDs
  const selectedTagIds = Array.isArray(value)
    ? value.length > 0 && typeof value[0] === 'string'
      ? (value as string[])
      : (value as TagResponseDto[]).map((t) => t.id)
    : []

  // Get selected tag objects
  const selectedTags = allTags.filter((tag) => selectedTagIds.includes(tag.id))

  // Filter available tags based on search and already selected
  const availableTags = allTags.filter(
    (tag) =>
      !selectedTagIds.includes(tag.id) &&
      tag.name.toLowerCase().includes(inputValue.toLowerCase())
  )

  // Group available tags by type for the dropdown
  const systemTags = availableTags.filter((t) => t.type === 'system')
  const agentTags = availableTags.filter((t) => t.type === 'agent')

  // Check if input matches an existing tag exactly
  const exactMatch = allTags.find(
    (tag) => tag.name.toLowerCase() === inputValue.toLowerCase()
  )

  const handleSelectTag = (tagId: string) => {
    onChange([...selectedTagIds, tagId])
    setInputValue('')
    setOpen(false)
  }

  const handleRemoveTag = (tagId: string) => {
    onChange(selectedTagIds.filter((id) => id !== tagId))
  }

  const handleCreateTag = async () => {
    if (!inputValue.trim() || !onCreateTag) return

    try {
      const newTag = await onCreateTag(inputValue.trim())
      onChange([...selectedTagIds, newTag.id])
      setInputValue('')
      setOpen(false)
    } catch (error) {
      console.error('Failed to create tag:', error)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setInputValue('')
    } else if (e.key === 'Backspace' && !inputValue && selectedTagIds.length > 0) {
      onChange(selectedTagIds.slice(0, -1))
    }
  }

  const renderTagItem = (tag: TagWithUsageDto) => (
    <CommandItem
      key={tag.id}
      value={tag.id}
      onSelect={() => handleSelectTag(tag.id)}
    >
      <div className="flex items-center gap-2 flex-1">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: tag.color || '#e5e7eb' }}
        />
        <span>{tag.name}</span>
        {tag.category && (
          <span className="text-xs text-muted-foreground">
            ({tag.category})
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {tag.usageCount} uses
      </span>
    </CommandItem>
  )

  return (
    <div className={cn('relative', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            className={cn(
              'flex min-h-[40px] w-full flex-wrap gap-2 rounded-md border border-ash-200 bg-white px-3 py-2 text-sm',
              'cursor-text focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2',
              disabled && 'cursor-not-allowed opacity-50',
              className
            )}
            onClick={() => !disabled && setOpen(true)}
          >
            {selectedTags.map((tag) => (
              <Badge
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium"
                style={{
                  backgroundColor: tag.color || '#e5e7eb',
                  color: tag.color ? getContrastColor(tag.color) : '#1f2937',
                  border: 'none',
                }}
              >
                <span>{tag.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveTag(tag.id)
                  }}
                  disabled={disabled}
                  className="rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Remove {tag.name}</span>
                </button>
              </Badge>
            ))}
            <input
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                setOpen(true)
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setOpen(true)}
              disabled={disabled}
              placeholder={selectedTagIds.length === 0 ? placeholder : ''}
              className="flex-1 bg-transparent outline-none placeholder:text-ash-400 disabled:cursor-not-allowed min-w-[120px]"
            />
          </div>
        </PopoverTrigger>

        <PopoverContent className="w-[300px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandList>
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading tags...
                </div>
              ) : (
                <>
                  {/* Show grouped when no tagType filter */}
                  {!tagType && systemTags.length > 0 && (
                    <CommandGroup heading="System Tags">
                      {systemTags.map(renderTagItem)}
                    </CommandGroup>
                  )}

                  {!tagType && agentTags.length > 0 && (
                    <CommandGroup heading="My Tags">
                      {agentTags.map(renderTagItem)}
                    </CommandGroup>
                  )}

                  {/* Show flat list when tagType is filtered */}
                  {tagType && availableTags.length > 0 && (
                    <CommandGroup heading="Select tag">
                      {availableTags.map(renderTagItem)}
                    </CommandGroup>
                  )}

                  {inputValue && !exactMatch && onCreateTag && (
                    <>
                      {availableTags.length > 0 && (
                        <div className="border-t" />
                      )}
                      <CommandGroup>
                        <CommandItem
                          value={`create-${inputValue}`}
                          onSelect={handleCreateTag}
                          className="text-blue-600"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create &quot;{inputValue}&quot;
                        </CommandItem>
                      </CommandGroup>
                    </>
                  )}

                  {!inputValue && availableTags.length === 0 && (
                    <CommandEmpty>No tags available.</CommandEmpty>
                  )}

                  {inputValue && availableTags.length === 0 && !onCreateTag && (
                    <CommandEmpty>No tags found.</CommandEmpty>
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

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}
