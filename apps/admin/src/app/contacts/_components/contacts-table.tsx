'use client'

import { format } from 'date-fns'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RelationshipIndicator } from './relationship-indicator'
import type { ContactListItemDto } from '@tailfire/shared-types/api'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ContactsTableProps {
  contacts: ContactListItemDto[]
  isLoading: boolean
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void
  onContactClick: (contactId: string) => void
}

// ---------------------------------------------------------------------------
// Status badge colors
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  prospecting: 'bg-blue-100 text-blue-700',
  quoted: 'bg-indigo-100 text-indigo-700',
  booked: 'bg-green-100 text-green-700',
  traveling: 'bg-emerald-100 text-emerald-700',
  returned: 'bg-slate-100 text-slate-700',
  awaiting_next: 'bg-amber-100 text-amber-700',
  inactive: 'bg-red-100 text-red-700',
}

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Sortable header helper
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSortChange,
}: {
  label: string
  field: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void
}) {
  return (
    <button
      className="flex items-center gap-1 hover:text-foreground"
      onClick={() =>
        onSortChange(
          field,
          sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc',
        )
      }
    >
      {label}
      {sortBy === field &&
        (sortOrder === 'asc' ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        ))}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Initials helper
// ---------------------------------------------------------------------------

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.charAt(0)?.toUpperCase() ?? ''
  const l = lastName?.charAt(0)?.toUpperCase() ?? ''
  return f + l || '?'
}

// ---------------------------------------------------------------------------
// Skeleton rows for loading state
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i} className="border-b border-ash-100">
          <TableCell className="w-[40px] px-4 py-2">
            <Skeleton className="h-4 w-4" />
          </TableCell>
          <TableCell className="px-4 py-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          </TableCell>
          <TableCell className="w-[120px] px-4 py-2">
            <Skeleton className="h-5 w-20" />
          </TableCell>
          <TableCell className="w-[80px] px-4 py-2">
            <Skeleton className="h-5 w-14" />
          </TableCell>
          <TableCell className="px-4 py-2">
            <Skeleton className="h-4 w-36" />
          </TableCell>
          <TableCell className="w-[130px] px-4 py-2">
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell className="w-[160px] px-4 py-2">
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell className="w-[100px] px-4 py-2">
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell className="w-[50px] px-4 py-2">
            <Skeleton className="h-4 w-8" />
          </TableCell>
          <TableCell className="px-4 py-2">
            <div className="flex gap-1">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-14" />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ContactsTable({
  contacts,
  isLoading,
  selectedIds,
  onSelectionChange,
  sortBy,
  sortOrder,
  onSortChange,
  onContactClick,
}: ContactsTableProps) {
  const currentMonth = new Date().getMonth()

  // ---- Select-all logic ---------------------------------------------------
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))
  const someSelected = contacts.some((c) => selectedIds.has(c.id))
  const headerChecked = allSelected ? true : someSelected ? 'indeterminate' as const : false

  function handleSelectAll() {
    if (allSelected) {
      // Deselect all visible
      const next = new Set(selectedIds)
      for (const c of contacts) next.delete(c.id)
      onSelectionChange(next)
    } else {
      // Select all visible
      const next = new Set(selectedIds)
      for (const c of contacts) next.add(c.id)
      onSelectionChange(next)
    }
  }

  function handleToggleOne(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onSelectionChange(next)
  }

  // ---- Shared header props ------------------------------------------------
  const sortProps = { sortBy, sortOrder, onSortChange }
  const thClass = 'h-10 px-4 text-xs font-medium text-ash-600'

  return (
    <div className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-ash-200 hover:bg-transparent">
            {/* 1. Checkbox */}
            <TableHead className={`${thClass} w-[40px]`}>
              <Checkbox
                checked={headerChecked}
                onCheckedChange={handleSelectAll}
                aria-label="Select all contacts"
              />
            </TableHead>

            {/* 2. Name */}
            <TableHead className={thClass}>
              <SortableHeader label="Name" field="lastName" {...sortProps} />
            </TableHead>

            {/* 3. Status */}
            <TableHead className={`${thClass} w-[120px]`}>
              <SortableHeader label="Status" field="contactStatus" {...sortProps} />
            </TableHead>

            {/* 4. Type */}
            <TableHead className={`${thClass} w-[80px]`}>
              <SortableHeader label="Type" field="contactType" {...sortProps} />
            </TableHead>

            {/* 5. Email */}
            <TableHead className={thClass}>
              <SortableHeader label="Email" field="email" {...sortProps} />
            </TableHead>

            {/* 6. Phone */}
            <TableHead className={`${thClass} w-[130px]`}>Phone</TableHead>

            {/* 7. Next Trip */}
            <TableHead className={`${thClass} w-[160px]`}>
              <SortableHeader label="Next Trip" field="nextTripDate" {...sortProps} />
            </TableHead>

            {/* 8. Birthday */}
            <TableHead className={`${thClass} w-[100px]`}>
              <SortableHeader label="Birthday" field="dateOfBirth" {...sortProps} />
            </TableHead>

            {/* 9. Relationships */}
            <TableHead className={`${thClass} w-[50px]`} />

            {/* 10. Tags */}
            <TableHead className={thClass}>Tags</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {/* Loading state */}
          {isLoading && <SkeletonRows />}

          {/* Empty state */}
          {!isLoading && contacts.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={10}
                className="h-32 text-center text-sm text-ash-500"
              >
                No contacts found
              </TableCell>
            </TableRow>
          )}

          {/* Data rows */}
          {!isLoading &&
            contacts.map((contact) => {
              const isSelected = selectedIds.has(contact.id)
              const birthdayMonth =
                contact.dateOfBirth != null
                  ? new Date(contact.dateOfBirth).getMonth()
                  : null
              const isBirthdayMonth = birthdayMonth === currentMonth

              return (
                <TableRow
                  key={contact.id}
                  onClick={() => onContactClick(contact.id)}
                  className={`cursor-pointer transition-colors border-b border-ash-100 ${
                    isSelected
                      ? 'bg-primary/5 hover:bg-primary/10'
                      : 'hover:bg-ash-50/50'
                  }`}
                >
                  {/* 1. Checkbox */}
                  <TableCell className="w-[40px] px-4 py-2">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleOne(contact.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${contact.displayName}`}
                    />
                  </TableCell>

                  {/* 2. Name + Avatar */}
                  <TableCell className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 text-xs">
                        <AvatarFallback>
                          {getInitials(contact.firstName, contact.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-ash-900 truncate">
                        {contact.firstName ?? ''} {contact.lastName ?? ''}
                      </span>
                    </div>
                  </TableCell>

                  {/* 3. Status */}
                  <TableCell className="w-[120px] px-4 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[contact.contactStatus] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {formatStatusLabel(contact.contactStatus)}
                    </span>
                  </TableCell>

                  {/* 4. Type */}
                  <TableCell className="w-[80px] px-4 py-2">
                    {contact.contactType === 'client' ? (
                      <Badge variant="default" className="text-xs">
                        Client
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Lead
                      </Badge>
                    )}
                  </TableCell>

                  {/* 5. Email */}
                  <TableCell className="px-4 py-2 text-sm text-ash-700 max-w-[200px]">
                    <span className="truncate block">{contact.email ?? '\u2014'}</span>
                  </TableCell>

                  {/* 6. Phone */}
                  <TableCell className="w-[130px] px-4 py-2 text-sm text-ash-700">
                    {contact.phone ?? '\u2014'}
                  </TableCell>

                  {/* 7. Next Trip */}
                  <TableCell className="w-[160px] px-4 py-2">
                    {contact.nextTripName ? (
                      <div className="flex flex-col">
                        <span className="text-sm text-ash-900 truncate">
                          {contact.nextTripName}
                        </span>
                        {contact.nextTripDate && (
                          <span className="text-xs text-ash-500">
                            {format(new Date(contact.nextTripDate), 'MMM d')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-ash-400">{'\u2014'}</span>
                    )}
                  </TableCell>

                  {/* 8. Birthday */}
                  <TableCell className="w-[100px] px-4 py-2">
                    {contact.dateOfBirth ? (
                      <span
                        className={`text-sm ${
                          isBirthdayMonth
                            ? 'bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded'
                            : 'text-ash-700'
                        }`}
                      >
                        {format(new Date(contact.dateOfBirth), 'MMM d')}
                      </span>
                    ) : (
                      <span className="text-sm text-ash-400">{'\u2014'}</span>
                    )}
                  </TableCell>

                  {/* 9. Relationships */}
                  <TableCell className="w-[50px] px-4 py-2">
                    <RelationshipIndicator
                      contactId={contact.id}
                      contactName={contact.displayName}
                      count={contact.relationshipCount ?? 0}
                      onClick={() => onContactClick(contact.id)}
                    />
                  </TableCell>

                  {/* 10. Tags */}
                  <TableCell className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags?.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {(contact.tags?.length ?? 0) > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{contact.tags!.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
    </div>
  )
}
