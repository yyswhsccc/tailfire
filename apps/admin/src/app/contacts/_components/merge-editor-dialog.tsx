'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useContact } from '@/hooks/use-contacts'
import { useContactMerge } from '@/hooks/use-contact-merge'
import { useToast } from '@/hooks/use-toast'
import type { ContactMergeRequest, ContactResponseDto } from '@tailfire/shared-types/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MergeEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactIds: [string, string]
  onMergeComplete: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MERGE_FIELDS: { key: keyof ContactResponseDto; label: string }[] = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'addressLine1', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'province', label: 'Province' },
  { key: 'postalCode', label: 'Postal Code' },
  { key: 'country', label: 'Country' },
  { key: 'passportNumber', label: 'Passport #' },
  { key: 'passportExpiry', label: 'Passport Expiry' },
  { key: 'passportCountry', label: 'Passport Country' },
  { key: 'contactType', label: 'Type' },
  { key: 'contactStatus', label: 'Status' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(contact: ContactResponseDto): string {
  const first = contact.firstName?.[0] ?? ''
  const last = contact.lastName?.[0] ?? ''
  return (first + last).toUpperCase() || '?'
}

function displayValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '\u2014'
  return String(val)
}

function isEmpty(val: unknown): boolean {
  return val === null || val === undefined || val === ''
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MergeEditorDialog({
  open,
  onOpenChange,
  contactIds,
  onMergeComplete,
}: MergeEditorDialogProps) {
  const { toast } = useToast()
  const contactA = useContact(contactIds[0])
  const contactB = useContact(contactIds[1])
  const mergeMutation = useContactMerge()

  // 0 = contact A is primary, 1 = contact B is primary
  const [primaryIndex, setPrimaryIndex] = useState<0 | 1>(0)
  // Per-field override: which contact index (0 or 1) to take the value from
  const [overrides, setOverrides] = useState<Record<string, 0 | 1>>({})

  const contacts: [ContactResponseDto | undefined, ContactResponseDto | undefined] = [
    contactA.data,
    contactB.data,
  ]

  const isLoading = contactA.isLoading || contactB.isLoading
  const isError = contactA.isError || contactB.isError

  // Compute effective selection for each field.
  // Default: primary contact's value. Auto-select non-null when one side is empty.
  const effectiveSelection = useMemo(() => {
    const sel: Record<string, 0 | 1> = {}
    if (!contacts[0] || !contacts[1]) return sel
    for (const { key } of MERGE_FIELDS) {
      if (key in overrides) {
        sel[key] = overrides[key]
      } else {
        const aVal = contacts[0][key]
        const bVal = contacts[1][key]
        // If primary's value is empty but secondary has data, auto-pick secondary
        if (isEmpty(primaryIndex === 0 ? aVal : bVal) && !isEmpty(primaryIndex === 0 ? bVal : aVal)) {
          sel[key] = primaryIndex === 0 ? 1 : 0
        } else {
          sel[key] = primaryIndex
        }
      }
    }
    return sel
  }, [contacts[0], contacts[1], primaryIndex, overrides])

  const handleFieldChange = useCallback((fieldKey: string, idx: 0 | 1) => {
    setOverrides((prev) => ({ ...prev, [fieldKey]: idx }))
  }, [])

  const handlePrimaryChange = useCallback((value: string) => {
    setPrimaryIndex(Number(value) as 0 | 1)
    // Reset field overrides when switching primary since defaults shift
    setOverrides({})
  }, [])

  const handleMerge = useCallback(async () => {
    if (!contacts[0] || !contacts[1]) return

    const primaryId = contacts[primaryIndex]!.id
    const secondaryId = contacts[primaryIndex === 0 ? 1 : 0]!.id

    // Build field overrides — only include fields where the selection differs from the primary
    const fieldOverrides: Record<string, 'primary' | 'secondary'> = {}
    for (const { key } of MERGE_FIELDS) {
      const selectedIdx = effectiveSelection[key]
      if (selectedIdx !== undefined && selectedIdx !== primaryIndex) {
        fieldOverrides[key] = 'secondary'
      }
    }

    const request: ContactMergeRequest = {
      primaryId,
      secondaryId,
      fieldOverrides,
    }

    try {
      await mergeMutation.mutateAsync(request)
      toast({
        title: 'Contacts merged',
        description: `Successfully merged into ${contacts[primaryIndex]!.displayName}.`,
      })
      onMergeComplete()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Merge failed',
        description: 'Failed to merge contacts. Please try again.',
        variant: 'destructive',
      })
    }
  }, [contacts, primaryIndex, effectiveSelection, mergeMutation, toast, onMergeComplete, onOpenChange])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const secondaryContact = contacts[primaryIndex === 0 ? 1 : 0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge Contacts</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading contacts...</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">Failed to load one or both contacts.</p>
          </div>
        )}

        {contacts[0] && contacts[1] && (
          <>
            {/* ---- Primary Selector ---- */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Primary Contact (survives the merge)</Label>
              <RadioGroup
                value={String(primaryIndex)}
                onValueChange={handlePrimaryChange}
                className="grid grid-cols-2 gap-4"
              >
                {contacts.map((c, idx) => (
                  <label
                    key={c!.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                      primaryIndex === idx
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    }`}
                  >
                    <RadioGroupItem value={String(idx)} />
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(c!)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c!.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c!.email || 'No email'}
                      </p>
                    </div>
                    {primaryIndex === idx && (
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        Primary
                      </Badge>
                    )}
                  </label>
                ))}
              </RadioGroup>
            </div>

            {/* ---- Field Comparison Table ---- */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Field-by-Field Comparison</Label>
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Field</th>
                      <th className="px-3 py-2 text-left font-medium">
                        {contacts[0]!.displayName}
                        {primaryIndex === 0 && (
                          <Badge variant="outline" className="ml-1.5 text-[10px]">
                            primary
                          </Badge>
                        )}
                      </th>
                      <th className="px-3 py-2 text-left font-medium">
                        {contacts[1]!.displayName}
                        {primaryIndex === 1 && (
                          <Badge variant="outline" className="ml-1.5 text-[10px]">
                            primary
                          </Badge>
                        )}
                      </th>
                      <th className="w-20 px-3 py-2 text-center font-medium">Keep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MERGE_FIELDS.map(({ key, label }) => {
                      const valA = contacts[0]![key]
                      const valB = contacts[1]![key]
                      const bothIdentical = String(valA ?? '') === String(valB ?? '')
                      const bothEmpty = isEmpty(valA) && isEmpty(valB)
                      const selected = effectiveSelection[key]

                      // Skip rows where both are empty
                      if (bothEmpty) return null

                      return (
                        <tr key={key} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-medium text-muted-foreground">
                            {label}
                          </td>
                          <td
                            className={`px-3 py-2 ${
                              selected === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {displayValue(valA)}
                          </td>
                          <td
                            className={`px-3 py-2 ${
                              selected === 1 ? 'font-medium text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {displayValue(valB)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {bothIdentical ? (
                              <span className="text-xs text-muted-foreground">Same</span>
                            ) : (
                              <RadioGroup
                                value={String(selected ?? primaryIndex)}
                                onValueChange={(v) =>
                                  handleFieldChange(key, Number(v) as 0 | 1)
                                }
                                className="flex items-center justify-center gap-3"
                              >
                                <RadioGroupItem value="0" aria-label={`Keep ${contacts[0]!.displayName}'s ${label}`} />
                                <RadioGroupItem value="1" aria-label={`Keep ${contacts[1]!.displayName}'s ${label}`} />
                              </RadioGroup>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---- Inheritance Summary ---- */}
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    The surviving contact will inherit from{' '}
                    <span className="font-semibold">{secondaryContact?.displayName}</span>:
                  </p>
                  <ul className="list-disc pl-5 text-amber-700 dark:text-amber-300">
                    <li>All trip associations</li>
                    <li>All relationships</li>
                    <li>All tags</li>
                    <li>All payment records, documents, notes, and tasks</li>
                  </ul>
                  <p className="pt-1 text-xs text-amber-600 dark:text-amber-400">
                    The secondary contact ({secondaryContact?.displayName}) will be deactivated
                    after merge. This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ---- Footer ---- */}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={isLoading || isError || mergeMutation.isPending}
          >
            {mergeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Merging...
              </>
            ) : (
              'Merge Contacts'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
