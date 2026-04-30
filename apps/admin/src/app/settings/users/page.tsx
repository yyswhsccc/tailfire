'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { RowSelectionState } from '@tanstack/react-table'
import { Plus, UserPlus } from 'lucide-react'
import type { UserListItemDto, UserStatus, UserRole } from '@tailfire/shared-types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SettingsTabsLayout } from '../_components/settings-tabs-layout'
import { UsersTable } from './_components/users-table'
import { UserFilters } from './_components/user-filters'
import { InviteUserDialog } from './_components/invite-user-dialog'
import { CreateUserDialog } from './_components/create-user-dialog'
import { EditUserDialog } from './_components/edit-user-dialog'
import { ChangeStatusDialog } from './_components/change-status-dialog'
import { BatchActionBar } from './_components/batch-action-bar'
import { BatchConfirmDialog, BatchResult } from './_components/batch-confirm-dialog'
import { useUsers, useUpdateUserStatus, useDeleteUser, useResetUserMfa } from '@/hooks/use-users'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/hooks/use-toast'
import { useUser } from '@/hooks/use-user'
import { useImpersonation } from '@/hooks/use-impersonation'

type StatusAction = 'lock' | 'unlock' | 'activate' | 'delete' | 'resend-invite'
type BatchAction = 'lock' | 'unlock' | 'delete'

const pastTenseMap: Record<BatchAction, string> = {
  lock: 'locked',
  unlock: 'unlocked',
  delete: 'deleted',
}

export default function UsersSettingsPage() {
  const { user: currentUser } = useAuthStore()
  const { toast } = useToast()
  const { isAdmin } = useUser()
  const { start: startImpersonation } = useImpersonation()
  const updateStatus = useUpdateUserStatus()
  const deleteUser = useDeleteUser()
  const resetMfa = useResetUserMfa()

  // Filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserStatus | undefined>()
  const [roleFilter, setRoleFilter] = useState<UserRole | undefined>()

  // Dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserListItemDto | null>(null)
  const [statusAction, setStatusAction] = useState<StatusAction | null>(null)

  // Batch selection state
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [batchAction, setBatchAction] = useState<BatchAction | null>(null)

  // Fetch users
  const { data, isLoading, error } = useUsers({
    search: search || undefined,
    status: statusFilter,
    role: roleFilter,
  })

  // Reset selection only when the SET of user IDs changes (not on reference change)
  const prevUserIdsRef = useRef<string>('')
  useEffect(() => {
    const currentIds = data?.users?.map((u) => u.id).sort().join(',') ?? ''
    if (currentIds !== prevUserIdsRef.current) {
      // Only reset if we had a previous value (not initial mount)
      if (prevUserIdsRef.current !== '') {
        setRowSelection({})
      }
      prevUserIdsRef.current = currentIds
    }
  }, [data?.users])

  // Derive selectedUsers from rowSelection + current data
  // Filter by rowSelection[id] === true to handle false values
  const selectedUsers = useMemo(() => {
    if (!data?.users) return []
    return data.users.filter((u) => rowSelection[u.id] === true)
  }, [rowSelection, data?.users])

  // Compute targetUsers for current batchAction (used for dialog open guard)
  const targetUsers = useMemo(() => {
    const currentUserId = currentUser?.id || ''
    return selectedUsers
      .filter((u) => u.id !== currentUserId)
      .filter((u) => {
        if (batchAction === 'lock') return u.status === 'active' && u.isActive
        if (batchAction === 'unlock') return u.status === 'locked'
        if (batchAction === 'delete') return u.isActive
        return false
      })
  }, [selectedUsers, batchAction, currentUser?.id])

  // Show toast and reset if action set but no valid targets
  useEffect(() => {
    if (batchAction !== null && targetUsers.length === 0) {
      toast({
        title: 'No valid users',
        description: `No users can be ${pastTenseMap[batchAction]}`,
      })
      setBatchAction(null)
    }
  }, [batchAction, targetUsers.length, toast])

  const handleEdit = (user: UserListItemDto) => {
    setSelectedUser(user)
    setEditDialogOpen(true)
  }

  const handleStatusAction = (user: UserListItemDto, action: StatusAction) => {
    setSelectedUser(user)
    setStatusAction(action)
    setStatusDialogOpen(true)
  }

  const handleResetMfa = async (user: UserListItemDto) => {
    if (!confirm(`Reset MFA for ${user.email}? They will need to set up 2FA again on next login.`)) return
    try {
      const result = await resetMfa.mutateAsync(user.id)
      toast({
        title: 'MFA Reset',
        description: `Removed ${result.factorsRemoved} factor(s) for ${user.email}`,
      })
    } catch {
      toast({ title: 'Failed to reset MFA', variant: 'destructive' })
    }
  }

  const executeBatchAction = async (reason?: string): Promise<BatchResult> => {
    const currentUserId = currentUser?.id || ''

    // Get target users (filtered by action type, excluding self)
    const usersToProcess = selectedUsers
      .filter((u) => u.id !== currentUserId)
      .filter((u) => {
        if (batchAction === 'lock') return u.status === 'active' && u.isActive
        if (batchAction === 'unlock') return u.status === 'locked'
        if (batchAction === 'delete') return u.isActive
        return false
      })

    const results = await Promise.allSettled(
      usersToProcess.map((user) => {
        switch (batchAction) {
          case 'lock':
            return updateStatus.mutateAsync({
              id: user.id,
              data: { status: 'locked', lockedReason: reason },
            })
          case 'unlock':
            return updateStatus.mutateAsync({
              id: user.id,
              data: { status: 'active' },
            })
          case 'delete':
            return deleteUser.mutateAsync(user.id)
          default:
            return Promise.reject(new Error('Unknown action'))
        }
      })
    )

    const succeeded: string[] = []
    const failed: Array<{ userId: string; error: string }> = []

    results.forEach((result, index) => {
      const user = usersToProcess[index]
      if (!user) {
        return
      }
      const userId = user.id
      if (result.status === 'fulfilled') {
        succeeded.push(userId)
      } else {
        failed.push({
          userId,
          error: result.reason?.message || 'Unknown error',
        })
      }
    })

    // Show toast summary with proper past tense
    const pastTense = pastTenseMap[batchAction!]
    if (failed.length === 0) {
      toast({
        title: 'Success',
        description: `${succeeded.length} user(s) ${pastTense}`,
      })
      setRowSelection({})
    } else if (succeeded.length > 0) {
      toast({
        title: 'Partial success',
        description: `${succeeded.length} succeeded, ${failed.length} failed`,
      })
    } else {
      toast({
        title: 'Failed',
        description: `All ${failed.length} operations failed`,
        variant: 'destructive',
      })
    }

    return { succeeded, failed }
  }

  return (
    <SettingsTabsLayout activeTab="users">
      {/* Page header with actions */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">User Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage team members and user permissions
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Invite via Email
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <UserFilters
          search={search}
          onSearchChange={setSearch}
          status={statusFilter}
          onStatusChange={setStatusFilter}
          role={roleFilter}
          onRoleChange={setRoleFilter}
        />
      </div>

      {/* Batch action bar */}
      <BatchActionBar
        selectedUsers={selectedUsers}
        currentUserId={currentUser?.id || ''}
        onBatchLock={() => setBatchAction('lock')}
        onBatchUnlock={() => setBatchAction('unlock')}
        onBatchDelete={() => setBatchAction('delete')}
        onClearSelection={() => setRowSelection({})}
        disabled={batchAction !== null}
      />

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading users...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-destructive">Failed to load users</p>
            </div>
          ) : !data?.users.length ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-muted-foreground">No users found</p>
              <p className="text-sm text-muted-foreground">
                {search || statusFilter || roleFilter
                  ? 'Try adjusting your filters'
                  : 'Get started by inviting a team member'}
              </p>
            </div>
          ) : (
            <UsersTable
              users={data.users}
              currentUserId={currentUser?.id || ''}
              isCurrentUserAdmin={isAdmin}
              onEdit={handleEdit}
              onLock={(user) => handleStatusAction(user, 'lock')}
              onUnlock={(user) => handleStatusAction(user, 'unlock')}
              onActivate={(user) => handleStatusAction(user, 'activate')}
              onDelete={(user) => handleStatusAction(user, 'delete')}
              onResendInvite={(user) => handleStatusAction(user, 'resend-invite')}
              onImpersonate={(user) => startImpersonation(user.id)}
              onResetMfa={handleResetMfa}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <InviteUserDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
      />

      <CreateUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <EditUserDialog
        user={selectedUser}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        isCurrentUser={selectedUser?.id === currentUser?.id}
      />

      <ChangeStatusDialog
        user={selectedUser}
        action={statusAction}
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
      />

      {/* Batch confirm dialog */}
      <BatchConfirmDialog
        open={batchAction !== null && targetUsers.length > 0}
        onOpenChange={(open) => !open && setBatchAction(null)}
        action={batchAction}
        selectedUsers={selectedUsers}
        currentUserId={currentUser?.id || ''}
        onConfirm={executeBatchAction}
      />
    </SettingsTabsLayout>
  )
}
