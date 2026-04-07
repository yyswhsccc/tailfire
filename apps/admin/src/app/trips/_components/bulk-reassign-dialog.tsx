'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, AlertTriangle, CheckCircle2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useUsers } from '@/hooks/use-users'
import { useBulkReassignPreview, useBulkReassignTrips } from '@/hooks/use-trips'

interface BulkReassignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTripIds: string[]
  onComplete: () => void
}

type Step = 'select' | 'preview' | 'result'

export function BulkReassignDialog({
  open,
  onOpenChange,
  selectedTripIds,
  onComplete,
}: BulkReassignDialogProps) {
  const [step, setStep] = useState<Step>('select')
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const { data: usersData } = useUsers({ status: 'active', limit: 100 })
  const users = usersData?.users ?? []
  const preview = useBulkReassignPreview()
  const execute = useBulkReassignTrips()

  const selectedUser = users.find((u) => u.id === selectedUserId)
  const selectedUserName = selectedUser
    ? [selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ')
    : ''

  const handlePreview = async () => {
    try {
      await preview.mutateAsync({
        tripIds: selectedTripIds,
        newOwnerId: selectedUserId,
      })
      setStep('preview')
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate preview'
      toast.error(message)
    }
  }

  const handleConfirm = async () => {
    try {
      const result = await execute.mutateAsync({
        tripIds: selectedTripIds,
        newOwnerId: selectedUserId,
      })
      setStep('result')
      toast.success(
        `${result.tripsReassigned} trips reassigned, ${result.contactsAssigned} contacts assigned`
      )
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to reassign trips'
      toast.error(message)
    }
  }

  const handleClose = () => {
    const wasResult = step === 'result'
    setStep('select')
    setSelectedUserId('')
    preview.reset()
    execute.reset()
    onOpenChange(false)
    if (wasResult) onComplete()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reassign Trips</DialogTitle>
          <DialogDescription>
            Reassign {selectedTripIds.length} trip
            {selectedTripIds.length > 1 ? 's' : ''} to a different agent.
            Traveler contacts will be assigned automatically.
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Assign to Agent</label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {[user.firstName, user.lastName]
                        .filter(Boolean)
                        .join(' ') || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handlePreview}
                disabled={!selectedUserId || preview.isPending}
              >
                {preview.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Preview Changes
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && preview.data && (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>
                  <strong>{preview.data.tripsCount}</strong> trips will be
                  reassigned to <strong>{selectedUserName}</strong>
                </span>
              </div>
              {preview.data.contactsToAssign.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <Users className="h-4 w-4 text-blue-600 mt-0.5" />
                  <span>
                    <strong>{preview.data.contactsToAssign.length}</strong>{' '}
                    contacts will be assigned to {selectedUserName}
                  </span>
                </div>
              )}
              {preview.data.contactsToSkip.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <span>
                      <strong>{preview.data.contactsToSkip.length}</strong>{' '}
                      contacts will NOT be reassigned (owned by active agents):
                    </span>
                  </div>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 max-h-40 overflow-y-auto">
                    <ul className="space-y-1 text-xs text-amber-800">
                      {preview.data.contactsToSkip.map((c) => (
                        <li key={c.id}>
                          <strong>{c.name}</strong> — owned by{' '}
                          {c.currentOwnerName}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={execute.isPending}>
                {execute.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirm Reassign
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'result' && execute.data && (
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  <strong>{execute.data.tripsReassigned}</strong> trips
                  reassigned to <strong>{selectedUserName}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <Users className="h-4 w-4" />
                <span>
                  <strong>{execute.data.contactsAssigned}</strong> contacts
                  assigned
                </span>
              </div>
              {execute.data.contactsSkipped.length > 0 && (
                <div className="text-sm text-amber-700">
                  {execute.data.contactsSkipped.length} contacts unchanged
                  (owned by active agents)
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
