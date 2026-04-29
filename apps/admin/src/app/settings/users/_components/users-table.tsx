'use client'

import { useMemo } from 'react'
import {
  ColumnDef,
  RowSelectionState,
  OnChangeFn,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { MoreVertical, Pencil, Lock, Unlock, Trash2, Mail, UserCheck, UserCog, ShieldOff } from 'lucide-react'
import type { UserListItemDto } from '@tailfire/shared-types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { UserStatusBadge } from './user-status-badge'
import { getRoleDisplayName } from '@/lib/constants/roles'
import { usePresence } from '@/providers/presence-provider'

interface UsersTableProps {
  users: UserListItemDto[]
  currentUserId: string
  isCurrentUserAdmin?: boolean
  onEdit: (user: UserListItemDto) => void
  onLock: (user: UserListItemDto) => void
  onUnlock: (user: UserListItemDto) => void
  onActivate: (user: UserListItemDto) => void
  onDelete: (user: UserListItemDto) => void
  onResendInvite: (user: UserListItemDto) => void
  onImpersonate?: (user: UserListItemDto) => void
  onResetMfa?: (user: UserListItemDto) => void
  rowSelection: RowSelectionState
  onRowSelectionChange: OnChangeFn<RowSelectionState>
}

function getRoleBadge(role: 'admin' | 'user') {
  const label = getRoleDisplayName(role)
  if (role === 'admin') {
    return <Badge variant="outline" className="border-purple-500 text-purple-600">{label}</Badge>
  }
  return <Badge variant="outline">{label}</Badge>
}

function formatName(firstName: string | null, lastName: string | null): string {
  const parts = [firstName, lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : '—'
}

export function UsersTable({
  users,
  currentUserId,
  isCurrentUserAdmin = false,
  onEdit,
  onLock,
  onUnlock,
  onActivate,
  onDelete,
  onResendInvite,
  onImpersonate,
  onResetMfa,
  rowSelection,
  onRowSelectionChange,
}: UsersTableProps) {
  const { isOnline } = usePresence()

  // Memoize columns to prevent infinite re-renders — useReactTable
  // recomputes when the columns reference changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns: ColumnDef<UserListItemDto>[] = useMemo(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all on page"
        />
      ),
      cell: ({ row }) => {
        const user = row.original
        const isCurrentUser = user.id === currentUserId
        return (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            disabled={isCurrentUser}
            aria-label={`Select ${user.email}`}
            onClick={(e) => e.stopPropagation()}
          />
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const user = row.original
        const isCurrentUser = user.id === currentUserId
        const online = isOnline(user.id)
        return (
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${online ? 'bg-green-500' : 'bg-gray-300'}`}
              title={online ? 'Online' : 'Offline'}
            />
            <div className="text-sm font-medium text-gray-900">
              {formatName(user.firstName, user.lastName)}
            </div>
            {isCurrentUser && (
              <Badge variant="secondary" className="text-xs">You</Badge>
            )}
          </div>
        )
      },
    },
    {
      id: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <div className="text-sm text-gray-700">{row.original.email}</div>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      cell: ({ row }) => getRoleBadge(row.original.role),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <UserStatusBadge status={row.original.status} isActive={row.original.isActive} />
      ),
    },
    {
      id: 'lastLogin',
      header: 'Last Login',
      cell: ({ row }) => (
        <div className="text-sm text-gray-700">
          {row.original.lastLoginAt
            ? new Date(row.original.lastLoginAt).toLocaleDateString()
            : 'Never'}
        </div>
      ),
    },
    {
      id: 'created',
      header: 'Created',
      cell: ({ row }) => (
        <div className="text-sm text-gray-700">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const user = row.original
        const isCurrentUser = user.id === currentUserId
        const canModify = !isCurrentUser

        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(user)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>

                {isCurrentUserAdmin && user.role !== 'admin' && !isCurrentUser && onImpersonate && (
                  <DropdownMenuItem onClick={() => onImpersonate(user)}>
                    <UserCog className="mr-2 h-4 w-4" />
                    Impersonate
                  </DropdownMenuItem>
                )}

                {isCurrentUserAdmin && canModify && user.status === 'active' && onResetMfa && (
                  <DropdownMenuItem onClick={() => onResetMfa(user)}>
                    <ShieldOff className="mr-2 h-4 w-4" />
                    Reset MFA
                  </DropdownMenuItem>
                )}

                {user.status === 'pending' && (
                  <>
                    <DropdownMenuItem onClick={() => onResendInvite(user)}>
                      <Mail className="mr-2 h-4 w-4" />
                      Resend Invite
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onActivate(user)}>
                      <UserCheck className="mr-2 h-4 w-4" />
                      Activate
                    </DropdownMenuItem>
                  </>
                )}

                {canModify && user.status === 'locked' && (
                  <DropdownMenuItem onClick={() => onUnlock(user)}>
                    <Unlock className="mr-2 h-4 w-4" />
                    Unlock
                  </DropdownMenuItem>
                )}

                {canModify && user.status === 'active' && (
                  <DropdownMenuItem onClick={() => onLock(user)}>
                    <Lock className="mr-2 h-4 w-4" />
                    Lock
                  </DropdownMenuItem>
                )}

                {canModify && user.isActive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(user)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ], [currentUserId, isCurrentUserAdmin, isOnline, onEdit, onLock, onUnlock, onActivate, onDelete, onResendInvite, onImpersonate, onResetMfa])

  const table = useReactTable({
    data: users,
    columns,
    getRowId: (row) => row.id,
    onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    state: {
      rowSelection,
    },
  })

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="bg-gray-50">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="px-6 py-3 text-left text-xs font-medium text-ash-600 uppercase tracking-wider"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className="hover:bg-gray-50 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-6 py-4 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No users found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
