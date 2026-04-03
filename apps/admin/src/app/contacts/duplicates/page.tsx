'use client'

import { useState } from 'react'
import { DashboardLayout } from '@/components/layout'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Loader2 } from 'lucide-react'
import { useDuplicateDetection, useDismissDuplicate } from '@/hooks/use-contact-merge'
import { DuplicateGroupCard } from './_components/duplicate-group-card'
import { MergeEditorDialog } from '../_components/merge-editor-dialog'
import { useToast } from '@/hooks/use-toast'

export default function DuplicatesPage() {
  const { data, isLoading, isFetching, refetch } = useDuplicateDetection()
  const dismissMutation = useDismissDuplicate()
  const { toast } = useToast()
  const [mergeIds, setMergeIds] = useState<[string, string] | null>(null)

  const groups = data?.groups ?? []

  function handleDismiss(contactId1: string, contactId2: string, matchType: string) {
    dismissMutation.mutate(
      { contactId1, contactId2, matchType },
      {
        onSuccess: () => {
          toast({ title: 'Dismissed', description: 'This pair will no longer appear as duplicates.' })
        },
        onError: () => {
          toast({ title: 'Error', description: 'Failed to dismiss pair.', variant: 'destructive' })
        },
      },
    )
  }

  function handleMergeComplete() {
    setMergeIds(null)
    refetch()
    toast({ title: 'Contacts merged', description: 'The duplicate pair has been merged successfully.' })
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Duplicate Detection"
        actions={
          <div className="flex items-center gap-3">
            {groups.length > 0 && (
              <Badge variant="secondary">{groups.length} group{groups.length !== 1 ? 's' : ''} found</Badge>
            )}
            <Button
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-1.5" />
              )}
              {data ? 'Re-Scan' : 'Scan for Duplicates'}
            </Button>
          </div>
        }
      />

      {/* Content */}
      {!data && !isLoading && (
        <div className="text-center py-16">
          <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-medium mb-2">No scan results yet</h3>
          <p className="text-muted-foreground mb-4">
            Click &quot;Scan for Duplicates&quot; to detect potential duplicate contacts.
          </p>
        </div>
      )}

      {(isLoading || isFetching) && !data && (
        <div className="text-center py-16">
          <Loader2 className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Scanning contacts for duplicates...</p>
        </div>
      )}

      {data && groups.length === 0 && (
        <div className="text-center py-16">
          <h3 className="text-lg font-medium mb-2">No duplicates found</h3>
          <p className="text-muted-foreground">Your contact database looks clean!</p>
        </div>
      )}

      {groups.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <DuplicateGroupCard
              key={`${group.contacts[0].id}-${group.contacts[1].id}-${group.matchType}`}
              group={group}
              onMerge={(ids) => setMergeIds(ids)}
              onDismiss={handleDismiss}
              isDismissing={dismissMutation.isPending}
            />
          ))}
        </div>
      )}

      {mergeIds && (
        <MergeEditorDialog
          open={!!mergeIds}
          onOpenChange={(open) => { if (!open) setMergeIds(null) }}
          contactIds={mergeIds}
          onMergeComplete={handleMergeComplete}
        />
      )}
    </DashboardLayout>
  )
}
