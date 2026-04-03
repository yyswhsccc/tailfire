'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  ContactImportRow,
  ContactImportPreviewResult,
} from '@tailfire/shared-types/api'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ImportPreviewTableProps {
  previewResults: ContactImportPreviewResult
  rows: ContactImportRow[]
  selectedRows: Set<number>
  onSelectionChange: (selected: Set<number>) => void
  rowActions: Map<number, 'create' | 'merge' | 'skip'>
  onRowActionChange: (rowIndex: number, action: 'create' | 'merge' | 'skip') => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isActionableDisposition(
  disposition: string,
): boolean {
  return disposition === 'new' || disposition === 'update' || disposition === 'possible_match'
}

function DispositionBadge({ disposition }: { disposition: string }) {
  switch (disposition) {
    case 'new':
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
          New
        </Badge>
      )
    case 'update':
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
          Update
        </Badge>
      )
    case 'possible_match':
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">
          Possible Match
        </Badge>
      )
    case 'skip_other_agent':
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100">
          Other Agent
        </Badge>
      )
    case 'skip_invalid':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
          Invalid
        </Badge>
      )
    default:
      return <Badge variant="outline">{disposition}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Summary bar
// ---------------------------------------------------------------------------

function SummaryBar({ summary }: { summary: ContactImportPreviewResult['summary'] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
      <span>
        <span className="mr-1">✅</span>
        <strong className="text-foreground">{summary.newCount}</strong> new
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span>
        <span className="mr-1">🔄</span>
        <strong className="text-foreground">{summary.updateCount}</strong> updates
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span>
        <span className="mr-1">🔵</span>
        <strong className="text-foreground">{summary.possibleMatchCount}</strong> possible matches
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span>
        <span className="mr-1">⬜</span>
        <strong className="text-foreground">{summary.skipOtherAgentCount}</strong> skipped
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span>
        <span className="mr-1">🔴</span>
        <strong className="text-foreground">{summary.skipInvalidCount}</strong> invalid
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ImportPreviewTable({
  previewResults,
  rows,
  selectedRows,
  onSelectionChange,
  rowActions,
  onRowActionChange,
}: ImportPreviewTableProps) {
  const { results, summary } = previewResults

  // Build a lookup map from rowIndex → result
  const resultByIndex = new Map(results.map((r) => [r.rowIndex, r]))

  // Actionable row indices (can be selected/deselected)
  const actionableIndices = results
    .filter((r) => isActionableDisposition(r.disposition))
    .map((r) => r.rowIndex)

  const allActionableSelected =
    actionableIndices.length > 0 &&
    actionableIndices.every((i) => selectedRows.has(i))

  const someActionableSelected =
    !allActionableSelected && actionableIndices.some((i) => selectedRows.has(i))

  function handleSelectAll(checked: boolean) {
    const next = new Set(selectedRows)
    for (const i of actionableIndices) {
      if (checked) {
        next.add(i)
      } else {
        next.delete(i)
      }
    }
    onSelectionChange(next)
  }

  function handleSelectRow(rowIndex: number, checked: boolean) {
    const next = new Set(selectedRows)
    if (checked) {
      next.add(rowIndex)
    } else {
      next.delete(rowIndex)
    }
    onSelectionChange(next)
  }

  return (
    <div className="space-y-3">
      <SummaryBar summary={summary} />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 px-3">
                <Checkbox
                  checked={
                    allActionableSelected
                      ? true
                      : someActionableSelected
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(val) => handleSelectAll(!!val)}
                  aria-label="Select all actionable rows"
                />
              </TableHead>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-36">Disposition</TableHead>
              <TableHead>Match Details</TableHead>
              <TableHead className="w-40">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const result = resultByIndex.get(idx)
              const disposition = result?.disposition ?? 'skip_invalid'
              const actionable = isActionableDisposition(disposition)
              const isSelected = selectedRows.has(idx)
              const rowAction = rowActions.get(idx) ?? 'create'

              const fullName = [row.firstName, row.lastName]
                .filter(Boolean)
                .join(' ') || '—'

              const matchDetails =
                disposition === 'update' || disposition === 'possible_match'
                  ? result?.matchedContactName || result?.matchedContactEmail
                    ? `Matches: ${result.matchedContactName ?? ''}${
                        result.matchedContactEmail
                          ? ` (${result.matchedContactEmail})`
                          : ''
                      }`.trim()
                    : null
                  : null

              return (
                <TableRow
                  key={idx}
                  className={
                    !actionable
                      ? 'opacity-50'
                      : isSelected
                        ? ''
                        : 'opacity-70'
                  }
                >
                  {/* Checkbox */}
                  <TableCell className="px-3">
                    <Checkbox
                      checked={isSelected}
                      disabled={!actionable}
                      onCheckedChange={(val) => handleSelectRow(idx, !!val)}
                      aria-label={`Select row ${idx + 1}`}
                    />
                  </TableCell>

                  {/* Row number */}
                  <TableCell className="text-center text-muted-foreground text-xs">
                    {idx + 1}
                  </TableCell>

                  {/* Name */}
                  <TableCell className="font-medium">{fullName}</TableCell>

                  {/* Email */}
                  <TableCell className="text-sm text-muted-foreground">
                    {row.email ?? '—'}
                  </TableCell>

                  {/* Disposition badge */}
                  <TableCell>
                    <DispositionBadge disposition={disposition} />
                  </TableCell>

                  {/* Match details */}
                  <TableCell className="text-sm text-muted-foreground">
                    {matchDetails ?? '—'}
                  </TableCell>

                  {/* Action — only for possible_match */}
                  <TableCell>
                    {disposition === 'possible_match' ? (
                      <Select
                        value={rowAction}
                        onValueChange={(val) =>
                          onRowActionChange(idx, val as 'create' | 'merge' | 'skip')
                        }
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="merge">Merge</SelectItem>
                          <SelectItem value="create">Create New</SelectItem>
                          <SelectItem value="skip">Skip</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
