/**
 * trip-settings-tab.tsx (PR-2 Commit 2)
 *
 * Admin-only Trip Settings tab. Renders:
 *   - Fee Rate Override card (trips.commission_fee_rate_override)
 *   - Collaborators table (commission_percentage + agent_split_override
 *     per row)
 *   - Audit-tied confirmation dialog requiring a reason on every change
 *
 * Wires to:
 *   GET   /trips/:id/collaborators
 *   GET   /trips/:id                                   (for fee rate)
 *   PATCH /trips/:id/commission-overrides
 *
 * Non-admins see an "admin only" empty state — the surface is registered
 * unconditionally in the page nav because the tab decides what to show.
 */

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Settings, Save, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState } from '@/components/shared/empty-state'
import { useUser } from '@/hooks/use-user'
import { useTrip } from '@/hooks/use-trips'
import {
  useTripCollaborators,
  useUpdateCommissionOverrides,
} from '@/hooks/use-trip-commission-overrides'
import type {
  TripCollaboratorResponseDto,
  UpdateCollaboratorCommissionDto,
} from '@tailfire/shared-types/api'

interface TripSettingsTabProps {
  tripId: string
}

/**
 * Form state mirrors the editable fields. Strings throughout (so blank
 * input means "clear override"). At submit time we coerce to the typed
 * DTO shape that the API expects.
 */
interface FormState {
  feeRateOverride: string // "" means clear / use agency default
  collaborators: Array<{
    id: string
    userId: string
    displayName: string
    email: string
    commissionPercentage: string // mandatory non-null
    agentSplitOverride: string // "" means clear
  }>
}

function buildFormState(
  trip: { commissionFeeRateOverride?: string | null } | null | undefined,
  collaborators: TripCollaboratorResponseDto[] | undefined,
): FormState {
  return {
    feeRateOverride: trip?.commissionFeeRateOverride ?? '',
    collaborators: (collaborators ?? []).map((c) => ({
      id: c.id,
      userId: c.userId,
      displayName: [c.user?.firstName, c.user?.lastName].filter(Boolean).join(' ') ||
        c.user?.email ||
        c.userId.slice(0, 8),
      email: c.user?.email ?? '',
      commissionPercentage: c.commissionPercentage,
      agentSplitOverride: c.agentSplitOverride ?? '',
    })),
  }
}

/**
 * Diffs the form against the original snapshot and produces the
 * PATCH /trips/:id/commission-overrides body. Returns null when nothing
 * changed (skip the API call).
 */
function buildPatchBody(
  form: FormState,
  original: FormState,
): {
  feeRateOverridePercent?: number | null
  collaboratorOverrides?: UpdateCollaboratorCommissionDto[]
} | null {
  const body: ReturnType<typeof buildPatchBody> = {}
  let hasChange = false

  if (form.feeRateOverride !== original.feeRateOverride) {
    body!.feeRateOverridePercent =
      form.feeRateOverride.trim() === '' ? null : Number(form.feeRateOverride)
    hasChange = true
  }

  const collabChanges: UpdateCollaboratorCommissionDto[] = []
  for (const row of form.collaborators) {
    const before = original.collaborators.find((c) => c.id === row.id)
    if (!before) continue
    const update: UpdateCollaboratorCommissionDto = { collaboratorId: row.id }
    let rowChanged = false
    if (row.commissionPercentage !== before.commissionPercentage) {
      update.commissionPercentage = row.commissionPercentage
      rowChanged = true
    }
    if (row.agentSplitOverride !== before.agentSplitOverride) {
      update.agentSplitOverridePercent =
        row.agentSplitOverride.trim() === '' ? null : Number(row.agentSplitOverride)
      rowChanged = true
    }
    if (rowChanged) collabChanges.push(update)
  }
  if (collabChanges.length > 0) {
    body!.collaboratorOverrides = collabChanges
    hasChange = true
  }

  return hasChange ? body : null
}

export function TripSettingsTab({ tripId }: TripSettingsTabProps) {
  const { isAdmin } = useUser()
  const { data: trip } = useTrip(tripId)
  const { data: collaborators, isLoading: collabLoading } = useTripCollaborators(
    isAdmin ? tripId : null,
  )
  const updateMutation = useUpdateCommissionOverrides()

  // Snapshot of original values (for diffing on submit + cancel reset).
  const original = useMemo(
    () => buildFormState(trip, collaborators),
    [trip, collaborators],
  )
  const [form, setForm] = useState<FormState>(original)
  useEffect(() => setForm(original), [original])

  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isAdmin) {
    return (
      <Card>
        <EmptyState
          icon={<Settings className="h-8 w-8" />}
          title="Admin-only settings"
          description="The Trip Settings tab is for managing per-trip commission overrides — only agency admins can see it."
        />
      </Card>
    )
  }

  if (collabLoading) {
    return (
      <Card>
        <div className="text-ash-500">Loading commission settings…</div>
      </Card>
    )
  }

  const pendingBody = buildPatchBody(form, original)
  const isDirty = pendingBody !== null

  const handleSave = async () => {
    if (!pendingBody) return
    if (!reason.trim()) {
      setError('Please provide a reason for the change (recorded in the audit trail).')
      return
    }
    setError(null)
    try {
      await updateMutation.mutateAsync({
        tripId,
        body: { ...pendingBody, reason: reason.trim() },
      })
      setReason('')
      setConfirmOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save commission overrides.')
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ash-900">Trip Settings</h2>
            <p className="mt-1 text-sm text-ash-500">
              Per-trip commission overrides. Every change is logged in the audit trail
              with the reason you provide on save.
            </p>
          </div>
          {isDirty && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setForm(original)
                  setError(null)
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Discard
              </Button>
              <Button onClick={() => setConfirmOpen(true)} disabled={updateMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                Save changes
              </Button>
            </div>
          )}
        </header>

        {/* Fee Rate Override card */}
        <section>
          <h3 className="mb-2 text-sm font-medium text-ash-900">Agency tech fee override</h3>
          <p className="mb-3 text-xs text-ash-500">
            Overrides the agency-wide default fee rate (typically 5%). Leave blank to use the
            agency default. Set to 0 for legacy payroll trips where Phoenix waived the tech fee.
          </p>
          <div className="flex items-end gap-2">
            <div className="w-40">
              <Label htmlFor="feeRateOverride">Fee rate (%)</Label>
              <Input
                id="feeRateOverride"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="default"
                value={form.feeRateOverride}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, feeRateOverride: e.target.value }))
                }
              />
            </div>
            {form.feeRateOverride !== original.feeRateOverride && (
              <p className="pb-2 text-xs text-amber-700">
                {original.feeRateOverride === ''
                  ? `pending: ${form.feeRateOverride || '(clear)'}%`
                  : form.feeRateOverride === ''
                    ? `pending: clear (revert to agency default)`
                    : `pending: ${original.feeRateOverride}% → ${form.feeRateOverride}%`}
              </p>
            )}
          </div>
        </section>

        {/* Collaborators table */}
        <section>
          <h3 className="mb-2 text-sm font-medium text-ash-900">Collaborators</h3>
          <p className="mb-3 text-xs text-ash-500">
            <strong>Share %</strong> splits commission between collaborators on this trip
            (must add to 100). <strong>Agent split override</strong> overrides each agent&apos;s
            profile default (typically 60%). Blank = use the agent&apos;s profile default.
          </p>
          {form.collaborators.length === 0 ? (
            <div className="rounded border border-ash-200 px-4 py-6 text-center text-sm text-ash-500">
              No collaborators on this trip.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ash-500">
                <tr>
                  <th className="pb-2">Agent</th>
                  <th className="pb-2 pl-4">Share % (between collaborators)</th>
                  <th className="pb-2 pl-4">Agent split override (vs profile)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ash-100">
                {form.collaborators.map((row, idx) => {
                  const before = original.collaborators[idx]
                  const splitChanged = before && row.commissionPercentage !== before.commissionPercentage
                  const overrideChanged = before && row.agentSplitOverride !== before.agentSplitOverride
                  return (
                    <tr key={row.id} className="text-ash-900">
                      <td className="py-2">
                        <div className="font-medium">{row.displayName}</div>
                        <div className="text-xs text-ash-500">{row.email}</div>
                      </td>
                      <td className="py-2 pl-4">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={row.commissionPercentage}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              collaborators: prev.collaborators.map((c) =>
                                c.id === row.id ? { ...c, commissionPercentage: e.target.value } : c,
                              ),
                            }))
                          }
                          className={splitChanged ? 'border-amber-400' : ''}
                        />
                      </td>
                      <td className="py-2 pl-4">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="profile default"
                          value={row.agentSplitOverride}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              collaborators: prev.collaborators.map((c) =>
                                c.id === row.id ? { ...c, agentSplitOverride: e.target.value } : c,
                              ),
                            }))
                          }
                          className={overrideChanged ? 'border-amber-400' : ''}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Audit-tied confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm commission override changes</AlertDialogTitle>
            <AlertDialogDescription>
              Every change is recorded in the trip&apos;s audit trail. Please describe why
              you&apos;re making this change — agents and finance can read it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Label htmlFor="commissionReason" className="text-sm">
              Reason <span className="text-red-600">*</span>
            </Label>
            <Input
              id="commissionReason"
              placeholder="e.g. Legacy payroll trip — tech fee waived for May 2025 cohort"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setError(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save & log'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
