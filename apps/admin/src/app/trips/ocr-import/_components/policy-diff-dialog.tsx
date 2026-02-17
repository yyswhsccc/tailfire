'use client'

import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PolicyDiff } from '@tailfire/shared-types'

interface PolicyDiffDialogProps {
  policyDiff: PolicyDiff
  open: boolean
  isPending: boolean
  onUpdateDefaults: () => void
  onKeepDefaults: () => void
}

export function PolicyDiffDialog({
  policyDiff,
  open,
  isPending,
  onUpdateDefaults,
  onKeepDefaults,
}: PolicyDiffDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Policy Differences — {policyDiff.supplierName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            The extracted policies differ from the supplier&apos;s saved defaults.
            The activity-level policies have already been saved. Would you like to
            update the supplier&apos;s default policies?
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {policyDiff.termsAndConditions && (
            <DiffSection
              label="Terms & Conditions"
              supplierDefault={policyDiff.termsAndConditions.supplierDefault}
              extracted={policyDiff.termsAndConditions.extracted}
            />
          )}
          {policyDiff.cancellationPolicy && (
            <DiffSection
              label="Cancellation Policy"
              supplierDefault={policyDiff.cancellationPolicy.supplierDefault}
              extracted={policyDiff.cancellationPolicy.extracted}
            />
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={onKeepDefaults} disabled={isPending}>
            Keep Current Defaults
          </Button>
          <Button onClick={onUpdateDefaults} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Supplier Defaults'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DiffSection({
  label,
  supplierDefault,
  extracted,
}: {
  label: string
  supplierDefault: string
  extracted: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-ash-500 mb-1">Current Supplier Default</p>
          <ScrollArea className="h-32 rounded-md border p-3">
            <p className="text-xs whitespace-pre-wrap">{supplierDefault}</p>
          </ScrollArea>
        </div>
        <div>
          <p className="text-xs font-medium text-ash-500 mb-1">Extracted from This Document</p>
          <ScrollArea className="h-32 rounded-md border border-blue-200 bg-blue-50/50 p-3">
            <p className="text-xs whitespace-pre-wrap">{extracted}</p>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
