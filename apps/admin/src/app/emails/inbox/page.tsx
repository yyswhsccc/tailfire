'use client'

import { Loader2, Pencil, RefreshCw, Mail, Search } from 'lucide-react'
import { DashboardLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useEmailAccounts } from '@/hooks/use-email-accounts'
import { useEmailFolders, useEmails, useSyncEmails } from '@/hooks/use-emails'
import { useEmailStore } from '@/stores/email.store'
import { FolderSidebar } from './_components/folder-sidebar'
import { EmailList } from './_components/email-list'
import { EmailReader } from './_components/email-reader'
import { ComposeEmailDialog } from './_components/compose-email-dialog'

export default function EmailInboxPage() {
  const { data: accounts, isLoading: accountsLoading } = useEmailAccounts()
  const activeAccount = accounts?.[0] ?? null
  const accountId = activeAccount?.id ?? null

  const activeFolder = useEmailStore((s) => s.activeFolder)
  const selectedEmailId = useEmailStore((s) => s.selectedEmailId)
  const search = useEmailStore((s) => s.search)
  const compose = useEmailStore((s) => s.compose)
  const setActiveFolder = useEmailStore((s) => s.setActiveFolder)
  const setSelectedEmailId = useEmailStore((s) => s.setSelectedEmailId)
  const setSearch = useEmailStore((s) => s.setSearch)
  const openCompose = useEmailStore((s) => s.openCompose)

  const { data: folders } = useEmailFolders(accountId)
  const { data: emailsData, isLoading: emailsLoading } = useEmails(accountId, {
    folder: activeFolder,
    search: search || undefined,
  })
  const syncEmails = useSyncEmails(accountId)

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
          <FolderSidebar
            folders={folders || []}
            activeFolder={activeFolder}
            onSelectFolder={setActiveFolder}
          />
        </div>

        {/* Email List */}
        <div className="flex w-80 flex-shrink-0 flex-col border-r">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search emails..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
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
                emails={emailsData?.emails || []}
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

      {/* Compose Dialog */}
      {compose && accountId && (
        <ComposeEmailDialog accountId={accountId} compose={compose} />
      )}
    </DashboardLayout>
  )
}
