'use client'

import { useState, useCallback } from 'react'
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
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'
import { useTags, tagKeys } from '@/hooks/use-tags'
import { contactKeys } from '@/hooks/use-contacts'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import type { TagResponseDto } from '@tailfire/shared-types/api'

interface TagAssignPopoverProps {
  selectedContactIds: string[]
  onComplete: () => void
  children: React.ReactNode
}

export function TagAssignPopover({
  selectedContactIds,
  onComplete,
  children,
}: TagAssignPopoverProps) {
  const [open, setOpen] = useState(false)
  const [checkedTagIds, setCheckedTagIds] = useState<Set<string>>(new Set())
  const [isApplying, setIsApplying] = useState(false)
  const [progress, setProgress] = useState(0)

  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: allTags = [], isLoading: tagsLoading } = useTags({ limit: 200 })

  const toggleTag = useCallback((tagId: string) => {
    setCheckedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) {
        next.delete(tagId)
      } else {
        next.add(tagId)
      }
      return next
    })
  }, [])

  const handleApply = useCallback(async () => {
    if (checkedTagIds.size === 0 || selectedContactIds.length === 0) return

    setIsApplying(true)
    setProgress(0)

    const tagIdsToAdd = Array.from(checkedTagIds)
    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < selectedContactIds.length; i++) {
      const contactId = selectedContactIds[i]!
      try {
        // 1. Fetch current tags for this contact
        const currentTags = await api.get<TagResponseDto[]>(
          `/contacts/${contactId}/tags`
        )
        const currentTagIds = currentTags.map((t) => t.id)

        // 2. Merge: union of current tags + new tags (deduplicated)
        const mergedTagIds = Array.from(
          new Set([...currentTagIds, ...tagIdsToAdd])
        )

        // 3. PUT the merged set back
        await api.put<TagResponseDto[]>(`/contacts/${contactId}/tags`, {
          tagIds: mergedTagIds,
        })

        successCount++
      } catch {
        errorCount++
      }

      setProgress(Math.round(((i + 1) / selectedContactIds.length) * 100))
    }

    setIsApplying(false)

    // Invalidate queries so the list refreshes
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: contactKeys.all }),
      queryClient.invalidateQueries({ queryKey: tagKeys.lists() }),
    ])

    if (errorCount === 0) {
      toast({
        title: 'Tags applied',
        description: `Added ${checkedTagIds.size} tag${checkedTagIds.size === 1 ? '' : 's'} to ${successCount} contact${successCount === 1 ? '' : 's'}.`,
      })
    } else {
      toast({
        title: 'Tags partially applied',
        description: `Succeeded for ${successCount}, failed for ${errorCount} contact${errorCount === 1 ? '' : 's'}.`,
        variant: 'destructive',
      })
    }

    // Reset and close
    setCheckedTagIds(new Set())
    setProgress(0)
    setOpen(false)
    onComplete()
  }, [checkedTagIds, selectedContactIds, queryClient, toast, onComplete])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (isApplying) return // Don't close while applying
      setOpen(nextOpen)
      if (!nextOpen) {
        // Reset on close
        setCheckedTagIds(new Set())
        setProgress(0)
      }
    },
    [isApplying]
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {isApplying ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                Applying tags to {selectedContactIds.length} contact
                {selectedContactIds.length === 1 ? '' : 's'}...
              </span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right">
              {progress}%
            </p>
          </div>
        ) : (
          <>
            <Command>
              <CommandInput placeholder="Search tags..." />
              <CommandList>
                <CommandEmpty>
                  {tagsLoading ? 'Loading tags...' : 'No tags found.'}
                </CommandEmpty>
                <CommandGroup>
                  {allTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => toggleTag(tag.id)}
                    >
                      <Checkbox
                        checked={checkedTagIds.has(tag.id)}
                        className="mr-2"
                        // Prevent double-toggle from CommandItem onSelect + Checkbox onClick
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggleTag(tag.id)}
                      />
                      <span className="truncate">{tag.name}</span>
                      {tag.color && (
                        <span
                          className="ml-auto h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            <div className="border-t p-2">
              <Button
                size="sm"
                className="w-full"
                disabled={checkedTagIds.size === 0}
                onClick={handleApply}
              >
                Apply to {selectedContactIds.length} contact
                {selectedContactIds.length === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
