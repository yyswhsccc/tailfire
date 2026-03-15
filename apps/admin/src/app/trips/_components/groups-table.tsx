'use client'

import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { FolderOpen } from 'lucide-react'
import { useTripGroups } from '@/hooks/use-trips'
import { format } from 'date-fns'

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  planning: 'default',
  confirmed: 'secondary',
  completed: 'outline',
  cancelled: 'destructive',
}

const typeLabels: Record<string, string> = {
  folder: 'Folder',
  group_booking: 'Group Booking',
}

interface GroupsTableProps {
  search?: string
}

export function GroupsTable({ search = '' }: GroupsTableProps) {
  const router = useRouter()
  const { data: groups = [], isLoading } = useTripGroups()

  const filteredGroups = groups.filter((g: any) =>
    !search || g.name?.toLowerCase().includes(search.toLowerCase()) ||
    g.destination?.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading groups...
      </div>
    )
  }

  if (filteredGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FolderOpen className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No groups yet</p>
        <p className="text-sm">Create one to organize trips.</p>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead>Travel Dates</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Trips</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredGroups.map((group: any) => (
            <TableRow
              key={group.id}
              className="cursor-pointer"
              onClick={() => router.push(`/trips/groups/${group.id}`)}
            >
              <TableCell className="font-medium">{group.name}</TableCell>
              <TableCell>
                <Badge variant={group.type === 'group_booking' ? 'default' : 'outline'}>
                  {typeLabels[group.type] || group.type}
                </Badge>
              </TableCell>
              <TableCell>{group.destination || '\u2014'}</TableCell>
              <TableCell>
                {group.startDate && group.endDate
                  ? `${format(new Date(group.startDate), 'MMM d')} - ${format(new Date(group.endDate), 'MMM d, yyyy')}`
                  : group.startDate
                    ? format(new Date(group.startDate), 'MMM d, yyyy')
                    : '\u2014'}
              </TableCell>
              <TableCell>
                {group.status ? (
                  <Badge variant={statusVariants[group.status] || 'outline'}>
                    {group.status}
                  </Badge>
                ) : '\u2014'}
              </TableCell>
              <TableCell className="text-right">{group.tripCount ?? 0}</TableCell>
              <TableCell>
                {group.createdAt
                  ? format(new Date(group.createdAt), 'MMM d, yyyy')
                  : '\u2014'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
