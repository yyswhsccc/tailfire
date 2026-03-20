'use client'

import { useState, useCallback, useMemo } from 'react'
import { DndContext, DragOverlay, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core'
import { AlertTriangle, Loader2, Pencil, RefreshCw, Mail, Search } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { useEmailFolders, useEmails, useSyncEmails, useMoveEmail } from '@/hooks/use-emails'
import { useEmailStore, type EmailSortBy } from '@/stores/email.store'
import { useDndSensors, dndCollisionDetection, type EmailDragData, type FolderDropData } from '@/lib/dnd-config'
import { FolderSidebar } from './_components/folder-sidebar'
import { EmailList } from './_components/email-list'
import { EmailReader } from './_components/email-reader'
import { ComposeEmailDialog } from './_components/compose-email-dialog'
import type { SyncedEmailResponseDto } from '@tailfire/shared-types/api'

export default function EmailInboxPage() {
  const { data: accounts, isLoading: accountsLoading } = useEmailAccounts()
  const activeAccount = accounts?.[0] ?? null
  const accountId = activeAccount?.id ?? null

  const activeFolder = useEmailStore((s) => s.activeFolder)
  const selectedEmailId = useEmailStore((s) => s.selectedEmailId)
  const search = useEmailStore((s) => s.search)
  const sortBy = useEmailStore((s) => s.sortBy)
  const compose = useEmailStore((s) => s.compose)
  const setActiveFolder = useEmailStore((s) => s.setActiveFolder)
  const setSelectedEmailId = useEmailStore((s) => s.setSelectedEmailId)
  const setSearch = useEmailStore((s) => s.setSearch)
  const setSortBy = useEmailStore((s) => s.setSortBy)
  const openCompose = useEmailStore((s) => s.openCompose)

  const { data: folders, error: foldersError } = useEmailFolders(accountId)
  const isImapAuthError = activeAccount?.lastSyncError === 'IMAP_AUTH_FAILED'
    || (foldersError && 'code' in foldersError && (foldersError as any).code === 'IMAP_AUTH_FAILED')
  const { data: emailsData, isLoading: emailsLoading } = useEmails(accountId, {
    folder: activeFolder,
    search: search || undefined,
  })
  const syncEmails = useSyncEmails(accountId)
  const moveEmail = useMoveEmail(accountId)

  // Client-side sorting
  const sortedEmails = useMemo(() => {
    const emails = [...(emailsData?.emails || [])]
    switch (sortBy) {
      case 'date-desc':
        return emails.sort((a, b) =>
          new Date(b.date || b.syncedAt).getTime() - new Date(a.date || a.syncedAt).getTime()
        )
      case 'date-asc':
        return emails.sort((a, b) =>
          new Date(a.date || a.syncedAt).getTime() - new Date(b.date || b.syncedAt).getTime()
        )
      case 'unread':
        return emails.sort((a, b) => {
          if (a.isSeen !== b.isSeen) return a.isSeen ? 1 : -1
          return new Date(b.date || b.syncedAt).getTime() - new Date(a.date || a.syncedAt).getTime()
        })
      case 'starred':
        return emails.sort((a, b) => {
          if (a.isFlagged !== b.isFlagged) return a.isFlagged ? -1 : 1
          return new Date(b.date || b.syncedAt).getTime() - new Date(a.date || a.syncedAt).getTime()
        })
      default:
        return emails
    }
  }, [emailsData?.emails, sortBy])

  // DnD state
  const sensors = useDndSensors()
  const [activeDragEmail, setActiveDragEmail] = useState<SyncedEmailResponseDto | null>(null)

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as EmailDragData | undefined
    if (data?.type === 'email') {
      setActiveDragEmail(data.email)
    }
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragEmail(null)
    const overData = event.over?.data.current as FolderDropData | undefined
    if (!overData || overData.type !== 'folder') return

    const emailData = event.active.data.current as EmailDragData | undefined
    if (!emailData || emailData.type !== 'email') return

    const targetFolder = overData.folderPath
    if (targetFolder === activeFolder) return

    moveEmail.mutate({ emailId: emailData.email.id, folder: targetFolder })

    // Clear selection if the moved email was selected
    if (emailData.email.id === selectedEmailId) {
      setSelectedEmailId(null)
    }
  }, [activeFolder, moveEmail, selectedEmailId, setSelectedEmailId])

  const handleDragCancel = useCallback(() => {
    setActiveDragEmail(null)
  }, [])

  // No email account configured
  if (!accountsLoading && (!accounts || accounts.length === 0)) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Mail className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">No email account configured</h2>
            <p className="text-sm text-muted-foreground">
              Set up your email in{' '}
              <a href="/profile?tab=email" className="text-primary hover:underline">
                Profile &gt; Email
              </a>{' '}
              to get started.
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (accountsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <DndContext
        sensors={sensors}
        collisionDetection={dndCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-lg border">
          {/* Folder Sidebar */}
          <div className="w-52 flex-shrink-0 border-r bg-muted/20 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Folders</h3>
              <div className="flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => openCompose({ mode: 'new' })}
                  title="Compose"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => syncEmails.mutate()}
                  disabled={syncEmails.isPending}
                  title="Sync emails"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncEmails.isPending ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
            {isImapAuthError && (
              <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 p-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="text-xs">
                    <p className="font-medium text-destructive">Authentication failed</p>
                    <p className="mt-0.5 text-muted-foreground">
                      Your email password may have changed.{' '}
                      <a href="/profile?tab=email" className="text-primary hover:underline">
                        Update credentials
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}
            <FolderSidebar
              accountId={accountId}
              folders={folders || []}
              activeFolder={activeFolder}
              onSelectFolder={setActiveFolder}
            />
          </div>

          {/* Email List */}
          <div className="flex w-80 flex-shrink-0 flex-col border-r">
            <div className="space-y-2 border-b p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search emails..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 pl-9"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {emailsData?.total ?? sortedEmails.length} email{(emailsData?.total ?? sortedEmails.length) !== 1 ? 's' : ''}
                </span>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as EmailSortBy)}>
                  <SelectTrigger className="h-7 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-desc">Newest first</SelectItem>
                    <SelectItem value="date-asc">Oldest first</SelectItem>
                    <SelectItem value="unread">Unread first</SelectItem>
                    <SelectItem value="starred">Starred first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {emailsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <EmailList
                  accountId={accountId}
                  activeFolder={activeFolder}
                  emails={sortedEmails}
                  selectedEmailId={selectedEmailId}
                  onSelectEmail={setSelectedEmailId}
                />
              )}
            </div>
          </div>

          {/* Email Reader */}
          <div className="flex-1 overflow-hidden">
            {selectedEmailId && accountId ? (
              <EmailReader accountId={accountId} emailId={selectedEmailId} />
            ) : (
              <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
                Select an email to read
              </div>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDragEmail && (
            <div className="w-72 rounded-md border bg-background p-3 shadow-lg rotate-2">
              <p className="truncate text-sm font-medium">
                {activeDragEmail.subject || '(no subject)'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {activeDragEmail.fromName || activeDragEmail.fromAddress || 'Unknown'}
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Compose Dialog */}
      {compose && accountId && (
        <ComposeEmailDialog accountId={accountId} compose={compose} />
      )}
    </DashboardLayout>
  )
}
