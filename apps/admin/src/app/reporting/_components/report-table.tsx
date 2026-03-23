'use client'

import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

export interface ReportColumnDef {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  mono?: boolean
}

interface ReportTableProps {
  columns: ReportColumnDef[]
  data: Record<string, unknown>[]
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSort?: (columnKey: string) => void
  isLoading?: boolean
}

/** Format cents values as $X,XXX.XX */
function formatCents(value: unknown): string {
  if (value == null) return '--'
  const cents = Number(value)
  if (isNaN(cents)) return String(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

/** Check if a column key represents a monetary cents value */
function isCentsColumn(key: string): boolean {
  return /[Cc]ents$/.test(key) || /[Pp]rice$/.test(key)
}

function formatCellValue(key: string, value: unknown): string {
  if (value == null) return '--'
  if (isCentsColumn(key)) return formatCents(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function SortIcon({ columnKey, sortBy, sortOrder }: {
  columnKey: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}) {
  if (sortBy !== columnKey) {
    return <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />
  }
  return sortOrder === 'asc'
    ? <ChevronUp className="ml-1 h-3.5 w-3.5" />
    : <ChevronDown className="ml-1 h-3.5 w-3.5" />
}

export function ReportTable({
  columns,
  data,
  sortBy,
  sortOrder,
  onSort,
  isLoading,
}: ReportTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No data for the selected period
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              const alignClass =
                col.align === 'right'
                  ? 'text-right'
                  : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'

              return (
                <TableHead
                  key={col.key}
                  className={`${alignClass} ${onSort ? 'cursor-pointer select-none hover:bg-muted/50' : ''}`}
                  onClick={() => onSort?.(col.key)}
                >
                  <div className={`flex items-center ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                    {col.label}
                    {onSort && <SortIcon columnKey={col.key} sortBy={sortBy} sortOrder={sortOrder} />}
                  </div>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIdx) => (
            <TableRow key={rowIdx}>
              {columns.map((col) => {
                const alignClass =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                const monoClass = col.mono || isCentsColumn(col.key) ? 'font-mono tabular-nums' : ''

                return (
                  <TableCell
                    key={col.key}
                    className={`${alignClass} ${monoClass}`}
                  >
                    {formatCellValue(col.key, row[col.key])}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
