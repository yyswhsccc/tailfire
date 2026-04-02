'use client'

import { useState, useCallback, useRef, useMemo } from 'react'
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  UserPlus,
} from 'lucide-react'
import {
  useUpdateContact,
  useCreateContact,
  contactKeys,
} from '@/hooks/use-contacts'
import {
  useUpdateTripTraveler,
  useResetTravelerSnapshot,
  tripTravelerKeys,
} from '@/hooks/use-trip-travelers'
import { useRelationships } from '@/hooks/use-relationships'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import {
  validateContactForTravel,
  contactFromSnapshot,
} from '@/lib/snapshot-utils'
import type { TripTravelerResponseDto } from '@tailfire/shared-types/api'
import Link from 'next/link'

interface TravelerAccordionItemProps {
  traveler: TripTravelerResponseDto
  tripId: string
  tripStartDate?: string | null
  travelerContactIds: Set<string>
  isExpanded?: boolean
}

type ContactFields = {
  firstName: string
  lastName: string
  email: string
  phone: string
  dateOfBirth: string
  passportNumber: string
  passportExpiry: string
  passportCountry: string
  addressLine1: string
  addressLine2: string
  city: string
  province: string
  postalCode: string
  country: string
}

function initContactFields(
  traveler: TripTravelerResponseDto
): ContactFields {
  const c = traveler.contact
  const s = traveler.contactSnapshot
  return {
    firstName: c?.firstName ?? s?.firstName ?? '',
    lastName: c?.lastName ?? s?.lastName ?? '',
    email: c?.email ?? s?.email ?? '',
    phone: c?.phone ?? s?.phone ?? '',
    dateOfBirth: c?.dateOfBirth ?? s?.dateOfBirth ?? '',
    passportNumber: c?.passportNumber ?? s?.passportNumber ?? '',
    passportExpiry: c?.passportExpiry ?? s?.passportExpiry ?? '',
    passportCountry: c?.passportCountry ?? s?.passportCountry ?? '',
    addressLine1: c?.addressLine1 ?? s?.addressLine1 ?? '',
    addressLine2: c?.addressLine2 ?? s?.addressLine2 ?? '',
    city: c?.city ?? s?.city ?? '',
    province: c?.province ?? s?.province ?? '',
    postalCode: c?.postalCode ?? s?.postalCode ?? '',
    country: c?.country ?? s?.country ?? '',
  }
}

export function TravelerAccordionItem({
  traveler,
  tripId,
  tripStartDate,
  travelerContactIds,
  isExpanded = false,
}: TravelerAccordionItemProps) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const updateContact = useUpdateContact()
  const createContact = useCreateContact()
  const updateTraveler = useUpdateTripTraveler(tripId)
  const resetSnapshot = useResetTravelerSnapshot(tripId)

  const contactId = traveler.contactId
  const isSnapshotOnly = !contactId

  // Local state for contact fields
  const [fields, setFields] = useState<ContactFields>(() =>
    initContactFields(traveler)
  )
  const initialFieldsRef = useRef<ContactFields>(fields)
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Address section collapsible
  const [addressOpen, setAddressOpen] = useState(false)

  // Special requirements local state
  const [specialReqs, setSpecialReqs] = useState(
    traveler.specialRequirements ?? ''
  )

  // Lazy-loaded relationships (only when expanded and has contact)
  const { data: relationships } = useRelationships(
    isExpanded && contactId ? contactId : null
  )

  // ── Validation ──
  const validation = useMemo(() => {
    const contactData = contactId
      ? contactFromSnapshot(traveler.contact as Record<string, any>)
      : contactFromSnapshot(traveler.contactSnapshot)
    return validateContactForTravel(contactData, tripStartDate)
  }, [traveler.contact, traveler.contactSnapshot, contactId, tripStartDate])

  // ── Display helpers ──
  const name = useMemo(() => {
    const first = fields.firstName || ''
    const last = fields.lastName || ''
    return `${first} ${last}`.trim() || 'Unknown Traveler'
  }, [fields.firstName, fields.lastName])

  const initials = useMemo(() => {
    const parts = name.split(' ')
    const lastPart = parts[parts.length - 1]
    if (parts.length >= 2 && parts[0]?.[0] && lastPart?.[0]) {
      return `${parts[0][0]}${lastPart[0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }, [name])

  const roleLabel =
    traveler.role === 'primary_contact'
      ? 'Primary Contact'
      : traveler.role === 'full_access'
        ? 'Full Access'
        : 'Limited Access'

  const typeLabel =
    traveler.travelerType === 'adult'
      ? 'Adult'
      : traveler.travelerType === 'child'
        ? 'Child'
        : traveler.travelerType === 'infant'
          ? 'Infant'
          : traveler.travelerType

  // ── Auto-save on blur ──
  const handleFieldBlur = useCallback(
    (field: keyof ContactFields) => {
      if (!contactId) return
      const currentVal = fields[field]
      const initialVal = initialFieldsRef.current[field]
      if (currentVal === initialVal) return

      // Update initial ref so we don't re-save
      initialFieldsRef.current = { ...initialFieldsRef.current, [field]: currentVal }

      updateContact.mutate(
        {
          id: contactId,
          data: { [field]: currentVal || undefined },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: tripTravelerKeys.lists(),
            })
            queryClient.invalidateQueries({
              queryKey: contactKeys.detail(contactId),
            })
            // Debounced snapshot reset
            if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
            snapshotTimerRef.current = setTimeout(() => {
              resetSnapshot.mutate(traveler.id)
            }, 2000)
          },
          onError: () => {
            toast({
              title: 'Save failed',
              description: `Could not update ${field}`,
              variant: 'destructive',
            })
          },
        }
      )
    },
    [
      contactId,
      fields,
      updateContact,
      queryClient,
      resetSnapshot,
      traveler.id,
      toast,
    ]
  )

  const handleDateChange = useCallback(
    (field: keyof ContactFields, value: string | null) => {
      const val = value ?? ''
      setFields((prev) => ({ ...prev, [field]: val }))
      if (!contactId) return
      if (val === initialFieldsRef.current[field]) return
      initialFieldsRef.current = { ...initialFieldsRef.current, [field]: val }

      updateContact.mutate(
        { id: contactId, data: { [field]: val || undefined } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tripTravelerKeys.lists() })
            queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) })
            if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current)
            snapshotTimerRef.current = setTimeout(() => {
              resetSnapshot.mutate(traveler.id)
            }, 2000)
          },
        }
      )
    },
    [contactId, updateContact, queryClient, resetSnapshot, traveler.id]
  )

  // ── Trip settings save ──
  const handleTripSettingChange = useCallback(
    (data: Record<string, string>) => {
      updateTraveler.mutate(
        { id: traveler.id, data },
        {
          onError: () => {
            toast({
              title: 'Error',
              description: 'Failed to update trip settings',
              variant: 'destructive',
            })
          },
        }
      )
    },
    [updateTraveler, traveler.id, toast]
  )

  // ── Create CRM Record (snapshot-only) ──
  const handleCreateCrmRecord = useCallback(async () => {
    try {
      const newContact = await createContact.mutateAsync({
        firstName: fields.firstName || undefined,
        lastName: fields.lastName || undefined,
        email: fields.email || undefined,
        phone: fields.phone || undefined,
      })
      await updateTraveler.mutateAsync({
        id: traveler.id,
        data: { contactId: newContact.id },
      })
      queryClient.invalidateQueries({ queryKey: tripTravelerKeys.lists() })
      toast({ title: 'CRM record created', description: `${name} linked to contact record` })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create CRM record',
        variant: 'destructive',
      })
    }
  }, [
    createContact,
    updateTraveler,
    fields,
    traveler.id,
    queryClient,
    toast,
    name,
  ])

  // ── Relationships filtered to co-travelers ──
  const coTravelerRelationships = useMemo(() => {
    if (!relationships || !contactId) return []
    return relationships.filter((r) => {
      const otherId =
        r.contactId1 === contactId ? r.contactId2 : r.contactId1
      return travelerContactIds.has(otherId)
    })
  }, [relationships, contactId, travelerContactIds])

  // ── Validation badge ──
  const validationBadge = useMemo(() => {
    const { errors, warnings } = validation
    if (errors.length > 0) {
      return (
        <span className="flex items-center gap-1 text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs font-medium">{errors.length + warnings.length}</span>
        </span>
      )
    }
    if (warnings.length > 0) {
      return (
        <span className="flex items-center gap-1 text-amber-500">
          <AlertTriangle className="h-4 w-4" />
        </span>
      )
    }
    return (
      <span className="flex items-center text-green-600">
        <CheckCircle2 className="h-4 w-4" />
      </span>
    )
  }, [validation])

  // ── Render helpers ──
  const inputField = (
    label: string,
    field: keyof ContactFields,
    opts?: { type?: string; placeholder?: string }
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={fields[field]}
        onChange={(e) =>
          setFields((prev) => ({ ...prev, [field]: e.target.value }))
        }
        onBlur={() => handleFieldBlur(field)}
        disabled={isSnapshotOnly}
        placeholder={opts?.placeholder}
        type={opts?.type}
        className="h-9"
      />
    </div>
  )

  return (
    <AccordionItem value={traveler.id} className="border rounded-lg px-4 mb-2">
      {/* ── Collapsed trigger ── */}
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>

          <span className="font-medium text-sm truncate">{name}</span>

          <Badge variant="outline" className="text-[10px] shrink-0">
            {roleLabel}
          </Badge>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {typeLabel}
          </Badge>

          {validationBadge}

          {isSnapshotOnly && (
            <Badge variant="destructive" className="text-[10px] shrink-0">
              No CRM Link
            </Badge>
          )}
        </div>
      </AccordionTrigger>

      {/* ── Expanded content ── */}
      <AccordionContent className="space-y-6">
        {/* Section 1: Travel Essentials */}
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Travel Essentials
          </h4>
          <div className="grid grid-cols-3 gap-3">
            {inputField('First Name', 'firstName')}
            {inputField('Last Name', 'lastName')}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date of Birth</Label>
              <DatePickerEnhanced
                value={fields.dateOfBirth || null}
                onChange={(v) => handleDateChange('dateOfBirth', v)}
                disabled={isSnapshotOnly}
                className="[&_input]:min-h-9 [&_input]:h-9 [&_button]:h-7 [&_button]:w-7"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {inputField('Email', 'email', { type: 'email' })}
            {inputField('Phone', 'phone', { type: 'tel' })}
          </div>
        </section>

        {/* Section 2: Passport */}
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Passport
          </h4>
          <div className="grid grid-cols-3 gap-3">
            {inputField('Passport Number', 'passportNumber')}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Passport Expiry</Label>
              <DatePickerEnhanced
                value={fields.passportExpiry || null}
                onChange={(v) => handleDateChange('passportExpiry', v)}
                disabled={isSnapshotOnly}
                className="[&_input]:min-h-9 [&_input]:h-9 [&_button]:h-7 [&_button]:w-7"
              />
            </div>
            {inputField('Passport Country', 'passportCountry', {
              placeholder: 'e.g. CAN',
            })}
          </div>
          {/* Inline passport validation warnings */}
          {validation.issues
            .filter((i) => i.category === 'passport')
            .map((issue) => (
              <div
                key={issue.field + issue.message}
                className={`flex items-start gap-2 mt-2 text-xs ${
                  issue.type === 'error' ? 'text-red-600' : 'text-amber-600'
                }`}
              >
                {issue.type === 'error' ? (
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                )}
                <span>{issue.message}</span>
              </div>
            ))}
        </section>

        {/* Section 3: Address (collapsible) */}
        <Collapsible open={addressOpen} onOpenChange={setAddressOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 text-xs text-muted-foreground p-0 h-auto hover:bg-transparent"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  addressOpen ? 'rotate-180' : ''
                }`}
              />
              Address
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {inputField('Address Line 1', 'addressLine1')}
              {inputField('Address Line 2', 'addressLine2')}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {inputField('City', 'city')}
              {inputField('Province', 'province')}
              {inputField('Postal Code', 'postalCode')}
              {inputField('Country', 'country', { placeholder: 'e.g. CA' })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Section 4: Trip Settings */}
        <section>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Trip Settings
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select
                value={traveler.role}
                onValueChange={(v) => handleTripSettingChange({ role: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary_contact">Primary Contact</SelectItem>
                  <SelectItem value="full_access">Full Access</SelectItem>
                  <SelectItem value="limited_access">Limited Access</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Traveler Type</Label>
              <Select
                value={traveler.travelerType}
                onValueChange={(v) =>
                  handleTripSettingChange({ travelerType: v })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="adult">Adult</SelectItem>
                  <SelectItem value="child">Child</SelectItem>
                  <SelectItem value="infant">Infant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Special Requirements
            </Label>
            <Textarea
              value={specialReqs}
              onChange={(e) => setSpecialReqs(e.target.value)}
              onBlur={() => {
                if (specialReqs !== (traveler.specialRequirements ?? '')) {
                  handleTripSettingChange({
                    specialRequirements: specialReqs,
                  })
                }
              }}
              placeholder="Dietary needs, accessibility, etc."
              rows={2}
              className="resize-none"
            />
          </div>
        </section>

        {/* Section 5: Relationships */}
        {contactId && (
          <section>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Relationships
            </h4>
            {coTravelerRelationships.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No relationships with other travelers on this trip.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {coTravelerRelationships.map((rel) => {
                  const isSideOne = rel.contactId1 === contactId
                  const label = isSideOne
                    ? rel.labelForContact2
                    : rel.labelForContact1
                  const otherName =
                    rel.relatedContact?.firstName && rel.relatedContact?.lastName
                      ? `${rel.relatedContact.firstName} ${rel.relatedContact.lastName}`
                      : rel.relatedContact?.firstName ?? 'Unknown'
                  return (
                    <li
                      key={rel.id}
                      className="text-sm flex items-center gap-2"
                    >
                      <Badge variant="outline" className="text-[10px]">
                        {label || rel.category}
                      </Badge>
                      <span className="text-muted-foreground">{otherName}</span>
                    </li>
                  )
                })}
              </ul>
            )}
            <Link
              href={`/contacts/${contactId}`}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
            >
              View Full CRM Record
              <ExternalLink className="h-3 w-3" />
            </Link>
          </section>
        )}

        {/* Snapshot-only: Create CRM Record */}
        {isSnapshotOnly && (
          <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3">
            <p className="text-xs text-amber-800 mb-2">
              This traveler has no linked CRM contact. Fields are read-only.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateCrmRecord}
              disabled={createContact.isPending || updateTraveler.isPending}
              className="gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {createContact.isPending ? 'Creating...' : 'Create CRM Record'}
            </Button>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}
