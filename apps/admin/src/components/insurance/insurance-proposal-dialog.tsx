'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shield, AlertTriangle, CheckCircle2, UserX } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useInsurancePreview,
  useInitiateInsurance,
  type InsurancePreviewTraveler,
} from '@/hooks/use-automations'
import { useToast } from '@/hooks/use-toast'

interface InsuranceProposalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tripId: string
}

export function InsuranceProposalDialog({
  open,
  onOpenChange,
  tripId,
}: InsuranceProposalDialogProps) {
  const { toast } = useToast()
  const { data: preview, isLoading } = useInsurancePreview(tripId, open)
  const initiateInsurance = useInitiateInsurance(tripId)

  const [selectedTravelerIds, setSelectedTravelerIds] = useState<Set<string>>(
    new Set()
  )
  const [guardianOverrides, setGuardianOverrides] = useState<
    Record<string, string>
  >({})

  // Determine which travelers are eligible (adults with pending/no insurance, have email)
  const getEligibleTravelers = useCallback(
    (travelers: InsurancePreviewTraveler[]) => {
      return travelers.filter(
        (t) =>
          !t.isMinor &&
          t.email &&
          (!t.insuranceStatus ||
            t.insuranceStatus === 'pending')
      )
    },
    []
  )

  // Reset selections when dialog opens with new preview data
  useEffect(() => {
    if (preview?.travelers) {
      const eligible = getEligibleTravelers(preview.travelers)
      setSelectedTravelerIds(new Set(eligible.map((t) => t.id)))
      // Initialize guardian overrides from auto-detected guardians
      const overrides: Record<string, string> = {}
      for (const t of preview.travelers) {
        if (t.isMinor && t.guardian) {
          overrides[t.id] = t.guardian.travelerId
        }
      }
      setGuardianOverrides(overrides)
    }
  }, [preview, getEligibleTravelers])

  const handleToggleTraveler = (travelerId: string) => {
    setSelectedTravelerIds((prev) => {
      const next = new Set(prev)
      if (next.has(travelerId)) {
        next.delete(travelerId)
      } else {
        next.add(travelerId)
      }
      return next
    })
  }

  const handleGuardianChange = (minorId: string, guardianId: string) => {
    setGuardianOverrides((prev) => ({
      ...prev,
      [minorId]: guardianId,
    }))
  }

  const handleSubmit = async () => {
    const travelerIds = Array.from(selectedTravelerIds)
    if (travelerIds.length === 0) return

    try {
      await initiateInsurance.mutateAsync({
        travelerIds,
        guardianOverrides:
          Object.keys(guardianOverrides).length > 0
            ? guardianOverrides
            : undefined,
      })
      toast({
        title: `${travelerIds.length} insurance proposal email${travelerIds.length !== 1 ? 's' : ''} queued`,
        description: 'Check the Automations tab to monitor progress.',
      })
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: 'Failed to queue insurance proposals',
        description: error?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      })
    }
  }

  const travelers = preview?.travelers || []
  const adults = travelers.filter((t) => !t.isMinor)
  const minors = travelers.filter((t) => t.isMinor)
  const adultTravelers = adults.filter((t) => t.email) // adults with email

  // Travelers who already have insurance (skipped)
  const skippedTravelers = travelers.filter(
    (t) =>
      t.insuranceStatus &&
      t.insuranceStatus !== 'pending'
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Send Insurance Proposals
          </DialogTitle>
          <DialogDescription>
            Select travelers to receive insurance proposal emails. Minors will be
            included under their guardian&apos;s proposal.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-ash-500">
            Loading traveler information...
          </div>
        ) : travelers.length === 0 ? (
          <div className="py-8 text-center text-sm text-ash-500">
            No travelers found on this trip.
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Adult travelers (selectable) */}
            {adultTravelers.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-ash-700">
                  Adult Travelers
                </Label>
                <div className="space-y-2">
                  {adultTravelers.map((traveler) => {
                    const isSkipped =
                      traveler.insuranceStatus &&
                      traveler.insuranceStatus !== 'pending'
                    const isChecked = selectedTravelerIds.has(traveler.id)

                    return (
                      <div
                        key={traveler.id}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                          isSkipped
                            ? 'bg-ash-50 border-ash-200 opacity-60'
                            : 'border-ash-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {!isSkipped ? (
                            <Checkbox
                              id={`traveler-${traveler.id}`}
                              checked={isChecked}
                              onCheckedChange={() =>
                                handleToggleTraveler(traveler.id)
                              }
                            />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          <div>
                            <label
                              htmlFor={`traveler-${traveler.id}`}
                              className="text-sm font-medium text-ash-900 cursor-pointer"
                            >
                              {traveler.firstName} {traveler.lastName}
                            </label>
                            <p className="text-xs text-ash-500">
                              {traveler.email}
                            </p>
                          </div>
                        </div>
                        {isSkipped && (
                          <Badge variant="secondary" className="text-xs">
                            {traveler.insuranceStatus === 'has_own_insurance'
                              ? 'Has Insurance'
                              : traveler.insuranceStatus === 'declined'
                                ? 'Declined'
                                : traveler.insuranceStatus === 'selected_package'
                                  ? 'Selected'
                                  : traveler.insuranceStatus}
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Adults without email */}
            {adults.filter((t) => !t.email).length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-ash-700">
                  Missing Email
                </Label>
                {adults
                  .filter((t) => !t.email)
                  .map((traveler) => (
                    <div
                      key={traveler.id}
                      className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
                    >
                      <UserX className="h-4 w-4 text-amber-600" />
                      <div>
                        <p className="text-sm font-medium text-ash-900">
                          {traveler.firstName} {traveler.lastName}
                        </p>
                        <p className="text-xs text-amber-700">
                          No email address - cannot send proposal
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Minors with guardian assignment */}
            {minors.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-ash-700">
                    Minor Travelers (included with guardian)
                  </Label>
                  <div className="space-y-2">
                    {minors.map((minor) => {
                      const currentGuardianId =
                        guardianOverrides[minor.id] ||
                        minor.guardian?.travelerId ||
                        ''

                      return (
                        <div
                          key={minor.id}
                          className="rounded-lg border border-ash-200 px-3 py-2.5 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-ash-900">
                                {minor.firstName} {minor.lastName}
                              </p>
                              <p className="text-xs text-ash-500">
                                Age {minor.age ?? 'unknown'} - Minor
                              </p>
                            </div>
                            {minor.needsGuardianAssignment && (
                              <Badge
                                variant="outline"
                                className="border-amber-300 text-amber-700 bg-amber-50 text-xs gap-1"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Needs Guardian
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-ash-500 shrink-0">
                              Guardian:
                            </Label>
                            <Select
                              value={currentGuardianId}
                              onValueChange={(value) =>
                                handleGuardianChange(minor.id, value)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select guardian" />
                              </SelectTrigger>
                              <SelectContent>
                                {adults.map((adult) => (
                                  <SelectItem
                                    key={adult.id}
                                    value={adult.id}
                                  >
                                    {adult.firstName} {adult.lastName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Skipped travelers (already have insurance, not shown above) */}
            {skippedTravelers.filter((t) => !adultTravelers.includes(t))
              .length > 0 && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-xs text-ash-400">
                    {
                      skippedTravelers.filter(
                        (t) => !adultTravelers.includes(t)
                      ).length
                    }{' '}
                    traveler(s) skipped (already have insurance or declined)
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              selectedTravelerIds.size === 0 || initiateInsurance.isPending
            }
          >
            {initiateInsurance.isPending
              ? 'Queuing...'
              : `Queue ${selectedTravelerIds.size} Email${selectedTravelerIds.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
