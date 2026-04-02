# Travelers Tab Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Travelers Tab (snapshot diff for primary traveler only) with an accordion-based traveler management hub with inline contact editing, validation badges, and relationship display.

**Architecture:** New `trip-travelers-tab.tsx` component replaces the inline `TravelersTab` in `page.tsx`. Each traveler renders as an accordion item with editable contact fields (auto-save via `useUpdateContact`), trip settings, passport validation, and relationships. Tab badge shows aggregate validation issue count as a red pill.

**Tech Stack:** React, shadcn/ui Accordion, React Query mutations, Tailwind CSS, existing Tailfire hooks

**Spec:** `docs/superpowers/specs/2026-04-02-travelers-tab-revamp-design.md`

---

### Task 1: Upgrade sidebar badge to red count pill

The simplest standalone change. Modifies sidebar badge styling from plain muted text to a red pill for numeric badges. No functional changes — just visual.

**Files:**
- Modify: `apps/admin/src/components/layout/detail-sidebar.tsx`

- [ ] **Step 1: Update badge rendering for button items**

In `apps/admin/src/components/layout/detail-sidebar.tsx`, find the badge span at approximately line 104:

```typescript
{item.badge && (
  <span className="text-xs text-ash-500">
    {item.badge}
  </span>
)}
```

Replace with:

```typescript
{item.badge && (
  <span className={cn(
    "text-xs font-medium",
    typeof item.badge === 'number' || (typeof item.badge === 'string' && /^\d+$/.test(item.badge))
      ? "bg-red-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1"
      : "text-ash-500"
  )}>
    {item.badge}
  </span>
)}
```

This renders numeric badges (like `"3"`) as red pills, and non-numeric badges (like `"!"`) in the existing muted style. `cn` should already be imported.

- [ ] **Step 2: Apply the same change to link items**

Find the second badge span at approximately line 128 (inside the `Link` variant). Apply the identical replacement.

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/layout/detail-sidebar.tsx
git commit -m "feat(admin): render numeric sidebar badges as red count pills

Numeric badges (e.g. '3') now render as bg-red-500 text-white rounded
pills. Non-numeric badges (e.g. '!') keep the existing muted style."
```

---

### Task 2: Create `contactFromSnapshot` utility

Small utility function needed by the tab badge computation and accordion status indicators. Converts a traveler's `contactSnapshot` JSONB into the `Contact` type that `validateContactForTravel` expects.

**Files:**
- Modify: `apps/admin/src/lib/snapshot-utils.ts`

- [ ] **Step 1: Add `contactFromSnapshot` export**

At the end of `apps/admin/src/lib/snapshot-utils.ts` (after the existing `validateContactForTravel` function), add:

```typescript
/**
 * Convert a traveler's contactSnapshot JSONB to the Contact type
 * used by validateContactForTravel. Maps common snapshot field variations.
 */
export function contactFromSnapshot(snapshot: Record<string, any> | null): Contact {
  if (!snapshot) {
    return {
      id: '',
      firstName: null,
      lastName: null,
      legalFirstName: null,
      legalLastName: null,
      middleName: null,
      preferredName: null,
      prefix: null,
      suffix: null,
      gender: null,
      pronouns: null,
      email: null,
      phone: null,
      dateOfBirth: null,
      passportNumber: null,
      passportExpiry: null,
      passportCountry: null,
      passportIssueDate: null,
      nationality: null,
      redressNumber: null,
      knownTravelerNumber: null,
      dietaryRequirements: null,
      mobilityRequirements: null,
      seatPreference: null,
      cabinPreference: null,
      floorPreference: null,
    }
  }

  return {
    id: snapshot.id || '',
    firstName: snapshot.firstName || null,
    lastName: snapshot.lastName || null,
    legalFirstName: snapshot.legalFirstName || null,
    legalLastName: snapshot.legalLastName || null,
    middleName: snapshot.middleName || null,
    preferredName: snapshot.preferredName || null,
    prefix: snapshot.prefix || null,
    suffix: snapshot.suffix || null,
    gender: snapshot.gender || null,
    pronouns: snapshot.pronouns || null,
    email: snapshot.email || null,
    phone: snapshot.phone || null,
    dateOfBirth: snapshot.dateOfBirth || null,
    passportNumber: snapshot.passportNumber || snapshot.passport?.number || null,
    passportExpiry: snapshot.passportExpiry || snapshot.passport?.expiry || null,
    passportCountry: snapshot.passportCountry || snapshot.passport?.country || null,
    passportIssueDate: snapshot.passportIssueDate || null,
    nationality: snapshot.nationality || null,
    redressNumber: snapshot.redressNumber || null,
    knownTravelerNumber: snapshot.knownTravelerNumber || null,
    dietaryRequirements: snapshot.dietaryRequirements || null,
    mobilityRequirements: snapshot.mobilityRequirements || null,
    seatPreference: snapshot.seatPreference || null,
    cabinPreference: snapshot.cabinPreference || null,
    floorPreference: snapshot.floorPreference || null,
  }
}
```

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/lib/snapshot-utils.ts
git commit -m "feat(admin): add contactFromSnapshot utility

Converts traveler contactSnapshot JSONB to the Contact type expected
by validateContactForTravel. Handles passport field variations."
```

---

### Task 3: Create `TravelerAccordionItem` component

The core UI component — a single traveler's accordion card with all editable sections. This is the largest task.

**Files:**
- Create: `apps/admin/src/app/trips/[id]/_components/traveler-accordion-item.tsx`

- [ ] **Step 1: Create the component file**

Create `apps/admin/src/app/trips/[id]/_components/traveler-accordion-item.tsx` with the full implementation. The component should:

**Props:**
```typescript
interface TravelerAccordionItemProps {
  traveler: TripTravelerResponseDto
  tripId: string
  tripStartDate?: string | null
  travelerContactIds: Set<string>  // All contact IDs on this trip (for relationship filtering)
}
```

**Structure:**
- AccordionItem wrapping AccordionTrigger (collapsed state) + AccordionContent (expanded)
- **Collapsed:** Avatar, name, role badge, traveler type, validation status indicator
- **Expanded sections:**
  1. Travel Essentials — first name, last name, DOB, email, phone (Input fields, auto-save on blur)
  2. Passport — passport number, expiry (DatePickerEnhanced), country (Input, auto-save on blur, inline validation warnings)
  3. Address — collapsible via Collapsible component — address line 1, line 2, city, province, postal code, country
  4. Trip Settings — role Select, traveler type Select, special requirements Textarea (save via useUpdateTripTraveler)
  5. Relationships — lazy-loaded via useRelationships, filtered to travelers on this trip, read-only list with "View Full CRM Record" link
  6. Snapshot-only banner — if no contactId, show read-only fields with "Create CRM Record" button

**Key implementation details:**
- Local state for all contact fields (initialized from `traveler.contact`)
- `useUpdateContact` for saving contact edits on blur
- After contact save success: invalidate `tripTravelerKeys.lists()` AND `contactKeys.detail(contactId)`
- Debounced snapshot reset: `useResetTravelerSnapshot` fires 2s after last contact edit
- `useUpdateTripTraveler` for role/type/specialRequirements changes
- `validateContactForTravel` run on current local state for status indicator
- For snapshot-only travelers: fields are read-only, values from `traveler.contactSnapshot`, "Create CRM Record" button calls `useCreateContact` then `useUpdateTripTraveler({ contactId })`

**Imports needed:**
```typescript
import { useState, useCallback, useRef, useMemo } from 'react'
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DatePickerEnhanced } from '@/components/ui/date-picker-enhanced'
import { AlertCircle, CheckCircle2, AlertTriangle, ChevronDown, ExternalLink, UserPlus } from 'lucide-react'
import { useUpdateContact, useCreateContact } from '@/hooks/use-contacts'
import { useUpdateTripTraveler, useResetTravelerSnapshot, tripTravelerKeys } from '@/hooks/use-trip-travelers'
import { useRelationships } from '@/hooks/use-relationships'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import { validateContactForTravel, contactFromSnapshot } from '@/lib/snapshot-utils'
import { contactKeys } from '@/hooks/use-contacts'
import type { TripTravelerResponseDto, ContactRelationshipResponseDto } from '@tailfire/shared-types/api'
import Link from 'next/link'
```

This is a large component (~300-400 lines). Build it section by section, testing the build after each major section.

- [ ] **Step 2: Build and verify**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS (component created but not yet imported anywhere)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/trips/\[id\]/_components/traveler-accordion-item.tsx
git commit -m "feat(admin): create TravelerAccordionItem component

Accordion card with editable contact fields (auto-save on blur),
passport validation, trip settings, relationships, and snapshot-only
handling with 'Create CRM Record' promotion flow."
```

---

### Task 4: Create `TripTravelersTab` component

The main tab component that wraps the accordion and computes the validation badge.

**Files:**
- Create: `apps/admin/src/app/trips/[id]/_components/trip-travelers-tab.tsx`

- [ ] **Step 1: Create the tab component**

Create `apps/admin/src/app/trips/[id]/_components/trip-travelers-tab.tsx`:

```typescript
'use client'

import { useMemo } from 'react'
import { Users } from 'lucide-react'
import { Accordion } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import { useTripTravelers } from '@/hooks/use-trip-travelers'
import { validateContactForTravel, contactFromSnapshot } from '@/lib/snapshot-utils'
import { TravelerAccordionItem } from './traveler-accordion-item'
import type { TripTravelerResponseDto } from '@tailfire/shared-types/api'

interface TripTravelersTabProps {
  tripId: string
  tripStartDate?: string | null
  onManageTravelers: () => void  // Opens the existing Edit Travelers modal
}

export function TripTravelersTab({ tripId, tripStartDate, onManageTravelers }: TripTravelersTabProps) {
  const { data: travelers = [], isLoading } = useTripTravelers(tripId)

  // Sort: primary first, then by sequenceOrder, then by name
  const sortedTravelers = useMemo(() => {
    return [...travelers].sort((a, b) => {
      if (a.isPrimaryTraveler && !b.isPrimaryTraveler) return -1
      if (!a.isPrimaryTraveler && b.isPrimaryTraveler) return 1
      if (a.sequenceOrder !== b.sequenceOrder) return a.sequenceOrder - b.sequenceOrder
      const nameA = a.contact?.firstName || a.contactSnapshot?.firstName || ''
      const nameB = b.contact?.firstName || b.contactSnapshot?.firstName || ''
      return nameA.localeCompare(nameB)
    })
  }, [travelers])

  // Aggregate validation issues for the banner
  const { totalIssues, travelersWithIssues } = useMemo(() => {
    let total = 0
    let withIssues = 0
    for (const t of travelers) {
      const contact = t.contact || contactFromSnapshot(t.contactSnapshot)
      const validation = validateContactForTravel(contact, tripStartDate)
      if (validation.totalIssues > 0) {
        total += validation.totalIssues
        withIssues++
      }
    }
    return { totalIssues: total, travelersWithIssues: withIssues }
  }, [travelers, tripStartDate])

  // Set of all traveler contact IDs (for relationship filtering)
  const travelerContactIds = useMemo(() => {
    return new Set(travelers.map(t => t.contactId).filter((id): id is string => id !== null))
  }, [travelers])

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading travelers...</div>
  }

  if (travelers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="h-12 w-12 text-ash-300 mb-4" />
        <h3 className="text-lg font-medium text-ash-900 mb-1">No travelers on this trip</h3>
        <p className="text-sm text-ash-500 mb-4">Add travelers to manage their details and travel readiness.</p>
        <Button onClick={onManageTravelers}>
          Manage Travelers
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Travelers ({travelers.length})</h3>
          {travelersWithIssues > 0 && (
            <p className="text-sm text-ash-500">
              {travelersWithIssues} traveler{travelersWithIssues !== 1 ? 's' : ''} with issues requiring attention
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onManageTravelers}>
          Manage Travelers
        </Button>
      </div>

      {/* Validation Summary Banner */}
      {totalIssues > 0 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-sm text-amber-800">
            <strong>{totalIssues} validation issue{totalIssues !== 1 ? 's' : ''}</strong> across {travelersWithIssues} traveler{travelersWithIssues !== 1 ? 's' : ''}.
            Expand each traveler to review and fix.
          </AlertDescription>
        </Alert>
      )}

      {/* Accordion */}
      <Accordion type="single" collapsible className="space-y-2">
        {sortedTravelers.map((traveler) => (
          <TravelerAccordionItem
            key={traveler.id}
            traveler={traveler}
            tripId={tripId}
            tripStartDate={tripStartDate}
            travelerContactIds={travelerContactIds}
          />
        ))}
      </Accordion>
    </div>
  )
}
```

- [ ] **Step 2: Export `totalIssueCount` for badge computation**

Add a custom hook export at the top of the file that the parent page can use for the badge:

```typescript
/**
 * Hook to compute total validation issue count across all travelers.
 * Used by the parent page for the sidebar badge.
 */
export function useTravelerValidationCount(tripId: string, tripStartDate?: string | null): number {
  const { data: travelers = [] } = useTripTravelers(tripId)

  return useMemo(() => {
    return travelers.reduce((sum, t) => {
      const contact = t.contact || contactFromSnapshot(t.contactSnapshot)
      const validation = validateContactForTravel(contact, tripStartDate)
      return sum + validation.totalIssues
    }, 0)
  }, [travelers, tripStartDate])
}
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/app/trips/\[id\]/_components/trip-travelers-tab.tsx
git commit -m "feat(admin): create TripTravelersTab with accordion layout

Main tab component with sorted traveler accordion, validation summary
banner, empty state, and useTravelerValidationCount hook for badge."
```

---

### Task 5: Wire up the new tab in `page.tsx`

Replace the inline `TravelersTab` with the new component and upgrade the badge.

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/page.tsx`

- [ ] **Step 1: Import new components**

Add imports at the top of `page.tsx`:

```typescript
import { TripTravelersTab, useTravelerValidationCount } from './_components/trip-travelers-tab'
```

- [ ] **Step 2: Replace badge computation**

In the trip detail component (around where `hasTravelerChanges` is used for the badge), add:

```typescript
const travelerIssueCount = useTravelerValidationCount(trip.id, trip.startDate)
```

Change the sidebar config badge from:
```typescript
badge: hasTravelerChanges ? '!' : undefined,
```
to:
```typescript
badge: travelerIssueCount > 0 ? travelerIssueCount.toString() : undefined,
```

- [ ] **Step 3: Replace the tab content**

Find where `TravelersTab` is rendered (around line 593):
```typescript
return <TravelersTab tripId={trip.id} primaryContactId={trip.primaryContactId} tripStartDate={trip.startDate} />
```

Replace with:
```typescript
return <TripTravelersTab
  tripId={trip.id}
  tripStartDate={trip.startDate}
  onManageTravelers={() => setEditTravelersOpen(true)}
/>
```

Make sure `editTravelersOpen` state and the Edit Travelers dialog are accessible from this scope.

- [ ] **Step 4: Remove the old inline TravelersTab function**

Delete the old `function TravelersTab(...)` (approximately lines 246-345). It's no longer needed.

- [ ] **Step 5: Build and verify**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/trips/\[id\]/page.tsx
git commit -m "feat(admin): wire TripTravelersTab into trip detail page

Replace inline TravelersTab with new accordion component.
Badge upgraded from '!' to red count of validation issues.

fixes #118"
```

---

### Task 6: Add traveler ordering to API

The current `findAll` has no `orderBy`. Add deterministic sort: primary first, then sequenceOrder.

**Files:**
- Modify: `apps/api/src/trips/trip-travelers.service.ts`

- [ ] **Step 1: Add orderBy to findAll query**

In `apps/api/src/trips/trip-travelers.service.ts`, find the `findAll` method (around line 271). It should have a `.from(...)` query without an `.orderBy()`. Add:

```typescript
.orderBy(
  desc(this.db.schema.tripTravelers.isPrimaryTraveler),
  asc(this.db.schema.tripTravelers.sequenceOrder),
  asc(this.db.schema.tripTravelers.createdAt),
)
```

Make sure `asc` and `desc` are imported from `drizzle-orm`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/trips/trip-travelers.service.ts
git commit -m "fix(api): add deterministic ordering to trip travelers query

Orders by isPrimaryTraveler DESC, sequenceOrder ASC, createdAt ASC.
Ensures stable rendering in the accordion UI."
```

---

### Task 7: Final build and PR

- [ ] **Step 1: Full build**

Run: `pnpm --filter @tailfire/admin build`
Expected: PASS

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin feature/issue-118-travelers-tab-revamp
gh pr create --base main --title "feat(admin): revamp Travelers Tab with accordion editing hub" --body "..."
```

- [ ] **Step 3: Push to preview and verify**

Merge to preview, verify on tf-demo:
1. Open a trip with travelers -> Travelers tab shows accordion
2. Expand a traveler -> fields editable, auto-save on blur
3. Validation issues show per-traveler status + tab badge count
4. "View Full CRM Record" link works
5. "Manage Travelers" button opens existing modal
