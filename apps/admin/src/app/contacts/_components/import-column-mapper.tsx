'use client'

import { useState, KeyboardEvent } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, X } from 'lucide-react'

const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'firstName', label: 'First Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'dateOfBirth', label: 'Date of Birth' },
  { value: 'addressLine1', label: 'Address Line 1' },
  { value: 'addressLine2', label: 'Address Line 2' },
  { value: 'city', label: 'City' },
  { value: 'province', label: 'Province / State' },
  { value: 'postalCode', label: 'Postal Code' },
  { value: 'country', label: 'Country' },
  { value: 'passportNumber', label: 'Passport Number' },
  { value: 'passportExpiry', label: 'Passport Expiry' },
  { value: 'passportCountry', label: 'Passport Country' },
]

interface ImportColumnMapperProps {
  headers: string[]
  mapping: Record<string, string> // header → fieldName (or 'ignore')
  onMappingChange: (mapping: Record<string, string>) => void
  tags: string[]
  onTagsChange: (tags: string[]) => void
}

export function ImportColumnMapper({
  headers,
  mapping,
  onMappingChange,
  tags,
  onTagsChange,
}: ImportColumnMapperProps) {
  const [tagInput, setTagInput] = useState('')

  function handleFieldChange(header: string, value: string) {
    onMappingChange({ ...mapping, [header]: value })
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' && e.key !== ',') return
    e.preventDefault()
    const trimmed = tagInput.trim()
    if (!trimmed || tags.includes(trimmed)) {
      setTagInput('')
      return
    }
    onTagsChange([...tags, trimmed])
    setTagInput('')
  }

  function removeTag(tag: string) {
    onTagsChange(tags.filter((t) => t !== tag))
  }

  return (
    <div className="space-y-6">
      {/* Column mapping table */}
      <div>
        <div className="grid grid-cols-2 gap-x-4 px-3 py-2 bg-muted/50 rounded-t-md border border-b-0 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <span>File Column</span>
          <span>Map To</span>
        </div>
        <div className="border rounded-b-md divide-y">
          {headers.map((header) => {
            const mapped = mapping[header]
            const isMapped = mapped && mapped !== 'ignore'
            return (
              <div
                key={header}
                className={`grid grid-cols-2 gap-x-4 items-center px-3 py-2 ${
                  isMapped ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isMapped ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  ) : (
                    <span className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="text-sm truncate" title={header}>
                    {header}
                  </span>
                </div>
                <Select
                  value={mapped ?? 'ignore'}
                  onValueChange={(val) => handleFieldChange(header, val)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="— Ignore —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ignore">— Ignore —</SelectItem>
                    {FIELD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tags section */}
      <div className="space-y-2">
        <Label htmlFor="import-tags">Import Tags</Label>
        <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="rounded-full hover:bg-muted p-0.5 transition-colors"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <Input
          id="import-tags"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Type a tag and press Enter to add…"
          className="h-8 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Press Enter or comma to add a tag.
        </p>
      </div>
    </div>
  )
}
