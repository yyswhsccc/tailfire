# Vacation Package Library UI — Implementation Plan (v2, Codex-reviewed)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a vacation package library page at `/library/vacation` in the admin app that lets travel agents search live VCO pricing, browse hotel results in a card grid, view enriched hotel details, and add vacation packages to trips.

**Architecture:** Search-first flow — agent fills a search form (gateway, destination, date, duration, travelers), triggers async VCO live pricing via BullMQ, polls until results arrive (3-5s), then renders all results as a card grid. Detail modal shows enrichment data and all package options. Trip integration via drag-and-drop or "Add to Trip" / "Create Trip" buttons. Follows cruise library patterns for trip context, but uses poll-then-render (not infinite scroll) since results come from a single VCO search.

**Tech Stack:** Next.js App Router, React Query (TanStack), shadcn/ui components, Tailwind CSS, existing API endpoints (`/softvoyage/search`, `/vacation-repository/*`)

**Key Codex review corrections applied:**
- Destination picker sends `providerIdentifier` (not UUID) for VCO search
- Hotel detail modal looks up by `providerIdentifier` (not UUID)
- No streaming/infinite scroll — poll-then-render
- `DatePickerEnhanced` uses `value`/`onChange` with ISO strings
- `Combobox` uses `onValueChange` returning `string | null`
- Drag source in `component-library-sidebar.tsx` (not `trip-itinerary.tsx`)
- Activity creation uses search-param ISO date (not parser display date)

---

## File Structure

```
apps/api/src/
├── vacation-repository/
│   └── vacation-repository.service.ts               ← MODIFY: Add providerIdentifier to destination list
│   └── vacation-repository.controller.ts            ← MODIFY: Add hotel-by-provider endpoint

apps/admin/src/
├── app/library/
│   ├── layout.tsx                                    ← MODIFY: Add "Vacation Packages" to sidebar
│   └── vacation/
│       ├── page.tsx                                  ← CREATE: Main vacation library page
│       └── _components/
│           ├── vacation-search-form.tsx               ← CREATE: Gateway/dest/date/duration form
│           ├── vacation-hotel-card.tsx                ← CREATE: Hotel result card
│           └── vacation-detail-modal.tsx              ← CREATE: Hotel detail + packages + enrichment
├── hooks/
│   └── use-vacation-library.ts                       ← CREATE: React Query hooks for vacation APIs
├── app/trips/[id]/_components/
│   ├── component-library-sidebar.tsx                 ← MODIFY: Add vacation drag source
│   └── trip-itinerary.tsx                            ← MODIFY: Add vacation drop handler
```

---

## Phase 0: Backend API Fixes (required before UI)

### Task 1: Add providerIdentifier to Destination List + Hotel Lookup by Provider

**Files:**
- Modify: `apps/api/src/vacation-repository/vacation-repository.service.ts`
- Modify: `apps/api/src/vacation-repository/vacation-repository.controller.ts`

- [ ] **Step 1: Add providerIdentifier to listDestinations response**

In `vacation-repository.service.ts`, add `providerIdentifier: vacationDestinations.providerIdentifier` to both SELECT queries in `listDestinations()` and update the return type to include `providerIdentifier: string`.

- [ ] **Step 2: Add getHotelByProvider method**

Add a new method to `VacationRepositoryService`:

```typescript
async getHotelByProvider(providerIdentifier: string): Promise<VacationHotelDetail> {
  // Same query as getHotelDetail but WHERE provider_identifier = X instead of id = X
  const results = await this.db.db
    .select({ /* same fields as getHotelDetail */ })
    .from(vacationHotels)
    .leftJoin(vacationHotelEnrichment, eq(vacationHotelEnrichment.hotelId, vacationHotels.id))
    .leftJoin(vacationDestinations, eq(vacationHotels.destinationId, vacationDestinations.id))
    .where(and(
      eq(vacationHotels.providerIdentifier, providerIdentifier),
      eq(vacationHotels.isActive, true),
    ))
    .limit(1)

  // Same enrichment dispatch + response mapping as getHotelDetail
}
```

- [ ] **Step 3: Add controller endpoint**

In `vacation-repository.controller.ts`, add:

```typescript
@Get('hotels/by-provider/:providerIdentifier')
async getHotelByProvider(@Param('providerIdentifier') providerIdentifier: string) {
  return this.vacationRepositoryService.getHotelByProvider(providerIdentifier)
}
```

Place this BEFORE the existing `@Get('hotels/:id')` route so it matches first.

- [ ] **Step 4: Run tests, commit**

```bash
pnpm --filter @tailfire/api exec jest --testPathPattern="softvoyage/|vacation-import/" --no-coverage
git add apps/api/src/vacation-repository/
git commit -m "feat(api): add providerIdentifier to destination list and hotel-by-provider lookup"
```

---

## Phase 1: Data Layer + Navigation

### Task 2: Vacation Library React Query Hooks

**Files:**
- Create: `apps/admin/src/hooks/use-vacation-library.ts`

- [ ] **Step 1: Create the hooks file with types**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ============================================================================
// Types
// ============================================================================

export interface VacationPackageOption {
  roomType: string
  mealPlan: string
  nights: number
  tourOperator: string
  departureDate: string   // Display format from parser (e.g., "APR 05")
  flightNumber: string
  departureTime: string
  arrivalTime: string
  baggage: string
  basePrice: number       // cents
  taxes: number           // cents
  totalPrice: number      // cents (per person)
  grandTotal: number      // cents (all travelers)
}

export interface VacationSearchResult {
  hotelId: string          // Softvoyage provider ID (NOT a UUID)
  hotelName: string
  destination: string
  starRating: number
  imageUrl: string
  amenities: string[]
  monarcRating: string
  monarcReviewCount: number
  packages: VacationPackageOption[]
}

export interface VacationSearchParams {
  gatewayCode: string
  destDep: string          // Destination providerIdentifier (NOT UUID)
  dateDep: string          // YYYYMMDD
  duration: string
  nbAdults?: number
  nbRooms?: number
  allInclusive?: boolean
}

export interface VacationGateway {
  id: string
  name: string
  airportCode: string
}

export interface VacationDestination {
  id: string
  providerIdentifier: string  // VCO destination ID — used for search
  name: string
  countryCode: string | null
  countryName: string | null
  regionGroup: string | null
  availableDurations: number[] | null
}

export interface VacationHotelDetail {
  id: string
  name: string
  destination: string
  hotelChain: string | null
  starRating: number | null
  imageUrl: string | null
  amenities: Record<string, boolean> | null
  monarcRating: string | null
  monarcReviewCount: number | null
  enrichment: {
    googleRating: string | null
    googleReviewCount: number | null
    tripadvisorRating: string | null
    tripadvisorReviewCount: number | null
    tripadvisorLink: string | null
    latitude: string | null
    longitude: string | null
    address: string | null
    website: string | null
    phone: string | null
    photos: string[]
    enrichedAt: string | null
    isStale: boolean
  } | null
}

// ============================================================================
// Query Keys
// ============================================================================

export const vacationLibraryKeys = {
  all: ['vacation-library'] as const,
  gateways: () => [...vacationLibraryKeys.all, 'gateways'] as const,
  destinations: (gatewayId?: string) => [...vacationLibraryKeys.all, 'destinations', gatewayId] as const,
  hotelDetail: (providerIdentifier: string) => [...vacationLibraryKeys.all, 'hotel', providerIdentifier] as const,
}

// ============================================================================
// Hooks
// ============================================================================

/** Fetch active departure gateways */
export function useVacationGateways() {
  return useQuery({
    queryKey: vacationLibraryKeys.gateways(),
    queryFn: () => api.get<VacationGateway[]>('/vacation-repository/gateways'),
    staleTime: 5 * 60_000,
  })
}

/** Fetch destinations, optionally filtered by gateway */
export function useVacationDestinations(gatewayId?: string) {
  return useQuery({
    queryKey: vacationLibraryKeys.destinations(gatewayId),
    queryFn: () => {
      const params = gatewayId ? `?gatewayId=${gatewayId}` : ''
      return api.get<VacationDestination[]>(`/vacation-repository/destinations${params}`)
    },
    staleTime: 5 * 60_000,
  })
}

/** Submit a live vacation search and poll for results */
export function useVacationSearch() {
  return useMutation({
    mutationFn: async (params: VacationSearchParams): Promise<VacationSearchResult[]> => {
      // 1. Submit search
      const submitResp = await api.post<
        | { cached: true; results: VacationSearchResult[]; fetchedAt: string }
        | { cached: false; jobId: string; pollUrl: string }
      >('/softvoyage/search', params)

      if (submitResp.cached) return submitResp.results

      // 2. Poll for results (max 30 seconds, 1.5s interval)
      const jobId = submitResp.jobId
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        const pollResp = await api.get<
          | { status: 'completed'; results: VacationSearchResult[]; fetchedAt: string }
          | { status: 'processing' }
          | { status: 'failed' }
        >(`/softvoyage/search/${jobId}`)

        if (pollResp.status === 'completed') return pollResp.results ?? []
        if (pollResp.status === 'failed') throw new Error('Search failed. Please try again.')
      }
      throw new Error('Search timed out. Please try again.')
    },
  })
}

/** Fetch hotel detail by provider ID (triggers lazy enrichment) */
export function useVacationHotelDetail(providerIdentifier: string | null) {
  return useQuery({
    queryKey: vacationLibraryKeys.hotelDetail(providerIdentifier ?? ''),
    queryFn: () => api.get<VacationHotelDetail>(
      `/vacation-repository/hotels/by-provider/${providerIdentifier}`
    ),
    enabled: !!providerIdentifier,
    staleTime: 60_000,
    refetchInterval: (query) => {
      // Auto-refetch if enrichment is missing/stale (waiting for async enrichment)
      const data = query.state.data
      if (!data) return false
      if (!data.enrichment || data.enrichment.isStale) return 10_000
      return false
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/use-vacation-library.ts
git commit -m "feat(admin): add React Query hooks for vacation package library"
```

### Task 3: Add Vacation Packages to Library Sidebar

**Files:**
- Modify: `apps/admin/src/app/library/layout.tsx`

- [ ] **Step 1: Add "Vacation Packages" to the Travel Activities group**

Import `Palmtree` from `lucide-react`. Add between Package Templates and Cruises:

```typescript
{ name: 'Vacation Packages', href: '/library/vacation', icon: Palmtree },
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/library/layout.tsx
git commit -m "feat(admin): add Vacation Packages to library sidebar"
```

---

## Phase 2: Search Form + Results Page

### Task 4: Vacation Search Form Component

**Files:**
- Create: `apps/admin/src/app/library/vacation/_components/vacation-search-form.tsx`

- [ ] **Step 1: Create the search form**

Key props/patterns to follow:
- `DatePickerEnhanced`: `value={isoString}` `onChange={(iso: string | null) => ...}` — NOT `date`/`onDateChange`
- `Combobox`: `value={string | null}` `onValueChange={(val: string | null) => ...}` — NOT `onSelect`
- Gateway Combobox: value is `airportCode`, label is `"City (CODE)"`
- Destination Combobox: value is `providerIdentifier` (NOT UUID), label is destination name
- When gateway changes, reset destination selection and refetch destinations for that gateway
- Form submit builds `VacationSearchParams` with `destDep = selectedDestination.providerIdentifier`
- Date formatted as YYYYMMDD from the ISO string value

Defaults from trip context query params:
```typescript
defaults?: {
  startDate?: string    // ISO YYYY-MM-DD
  travelers?: number
  gateway?: string      // airport code
}
```

Include fields: Gateway (Combobox), Destination (Combobox), Date (DatePickerEnhanced), Duration (Select), Adults (Select), Rooms (Select), All-Inclusive (Switch), Search button.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/library/vacation/_components/vacation-search-form.tsx
git commit -m "feat(admin): add vacation package search form component"
```

### Task 5: Vacation Hotel Card Component

**Files:**
- Create: `apps/admin/src/app/library/vacation/_components/vacation-hotel-card.tsx`

- [ ] **Step 1: Create the hotel card**

Reference `apps/admin/src/app/library/cruises/_components/cruise-card.tsx` for structure.

Card shows:
- Image (h-36, `next/image` with Hotel icon fallback, hover zoom)
- Star rating badge (top-left)
- Package count badge (top-right, amber)
- Hotel name (line-clamp-2)
- Destination (MapPin icon)
- Monarc rating + review count
- Amenity icons as small badges with Tooltips (max 6, then "+N")
- Cheapest price ("from $X/pp" or "$X total") with tour operator badge
- "View Details" button

Props: `result: VacationSearchResult`, `priceMode: 'perPerson' | 'grandTotal'`, `onSelect: () => void`

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/library/vacation/_components/vacation-hotel-card.tsx
git commit -m "feat(admin): add vacation hotel card component"
```

### Task 6: Vacation Detail Modal

**Files:**
- Create: `apps/admin/src/app/library/vacation/_components/vacation-detail-modal.tsx`

- [ ] **Step 1: Create the detail modal**

Reference `apps/admin/src/app/library/cruises/_components/cruise-detail-modal.tsx` for structure.

Uses `useVacationHotelDetail(result.hotelId)` to fetch enrichment by **provider identifier** (the `hotelId` from search results IS the Softvoyage provider ID).

Sections:
1. **Header:** Hotel name, destination, stars, Monarc rating
2. **Photo gallery:** From enrichment photos array, with prev/next navigation
3. **Enrichment info grid:** Google rating, TripAdvisor rating, address, website/phone/TA links
4. **Loading state:** While enrichment loads (Loader2 spinner)
5. **Package options table:** Sortable by price/date/nights/operator
   - Columns: Room (type + meal plan), TO (badge), Nts, Date, Flight, Times, Price, Select
   - Price toggle (Switch): per-person vs grand total
   - Click row to select, selected row highlighted amber
6. **Footer:** Close + "Create Trip" (outline) + "Add to Itinerary" (primary, disabled until package selected)

Props:
```typescript
{
  result: VacationSearchResult | null
  isOpen: boolean
  onClose: () => void
  tripContext?: { tripId: string; dayId: string; itineraryId: string }
  onAddToTrip?: (result: VacationSearchResult, pkg: VacationPackageOption) => void
  onCreateTrip?: (result: VacationSearchResult, pkg: VacationPackageOption) => void
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/library/vacation/_components/vacation-detail-modal.tsx
git commit -m "feat(admin): add vacation detail modal with enrichment and package table"
```

### Task 7: Main Vacation Library Page

**Files:**
- Create: `apps/admin/src/app/library/vacation/page.tsx`

- [ ] **Step 1: Create the main page**

Reference `apps/admin/src/app/library/cruises/page.tsx` for page structure.

Trip context from search params (same pattern as cruises):
```typescript
const tripId = searchParams.get('tripId')
const dayId = searchParams.get('dayId')
const itineraryId = searchParams.get('itineraryId')
const returnUrl = searchParams.get('returnUrl')
```

Defaults pre-filled from trip context:
```typescript
const defaults = {
  startDate: searchParams.get('startDate') ?? undefined,
  travelers: searchParams.get('travelers') ? Number(searchParams.get('travelers')) : undefined,
  gateway: searchParams.get('gateway') ?? undefined,
}
```

States:
- **Initial** (no search yet): Palmtree icon + "Search for vacation packages" prompt
- **Searching** (mutation pending): Spinner + "Searching vacation packages..." + "This may take a few seconds"
- **Error**: AlertCircle + error message
- **No results**: Palmtree icon + "No packages found" + "Try adjusting your search criteria"
- **Results**: Result count summary + price toggle (per-person/grand-total Switch) + card grid (1/2/3/4 cols responsive)

Header: Palmtree icon + "Vacation Packages" title + "Back to Trip" button (when tripContext + returnUrl)

Results sorted by cheapest price. Cards open detail modal on click.

`handleAddToTrip` and `handleCreateTrip` — v1 uses `AddToTripDialog` (shared component at `apps/admin/src/components/library/add-to-trip-dialog.tsx`) for the no-trip-context flow. With trip context, directly creates the activity.

**Important:** Keep the submitted search params (especially the ISO date from DatePickerEnhanced) in state so the mutation can use the real date for `findOrCreateByDate`, not the parser's display date.

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/library/vacation/
git commit -m "feat(admin): add vacation package library page"
```

---

## Phase 3: Trip Integration

### Task 8: Add Vacation Drag Source + Drop Handler

**Files:**
- Modify: `apps/admin/src/app/trips/[id]/_components/component-library-sidebar.tsx`
- Modify: `apps/admin/src/app/trips/[id]/_components/trip-itinerary.tsx`

- [ ] **Step 1: Add drag source in component-library-sidebar.tsx**

Find the section with `library-cruise` and `library-tour` DraggableComponent entries. Add before `library-cruise`:

```typescript
<DraggableComponent
  id="library-vacation"
  componentType="library-item"
  label="Vacation Package"
  icon={Palmtree}
/>
```

Import `Palmtree` from `lucide-react`.

- [ ] **Step 2: Add drop handler in trip-itinerary.tsx**

Find CASE 3 (`library-item` to `day-column`) and CASE 5 (`library-item` to `table`). In each, add a `library-vacation` handler after the `library-tour` handler:

```typescript
// Handle Vacation Library
if (activeId === 'library-vacation') {
  if (!selectedItinerary) {
    toast({
      title: 'No itinerary selected',
      description: 'Please select an itinerary before adding a vacation package.',
      variant: 'destructive',
    })
    return
  }
  const returnUrl = `/trips/${trip.id}?tab=itinerary`
  const params = new URLSearchParams({
    tripId: trip.id,
    dayId: targetDayId,  // or firstDay.id for table case
    itineraryId: selectedItinerary.id,
    returnUrl,
  })
  // Pre-fill from itinerary dates if available
  if (selectedItinerary.startDate) {
    params.set('startDate', selectedItinerary.startDate)
  }
  startLoading('vacation-library', 'Opening Vacation Library...')
  router.push(`/library/vacation?${params.toString()}`)
  return
}
```

Add handlers for both CASE 3 (day-column drop) and CASE 5 (table drop).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/trips/[id]/_components/component-library-sidebar.tsx
git add apps/admin/src/app/trips/[id]/_components/trip-itinerary.tsx
git commit -m "feat(admin): add vacation package drag-and-drop to itinerary builder"
```

### Task 9: Add Vacation to Trip Mutation

**Files:**
- Modify: `apps/admin/src/hooks/use-vacation-library.ts`
- Modify: `apps/admin/src/app/library/vacation/page.tsx`

- [ ] **Step 1: Add useAddVacationToItinerary mutation**

The mutation creates a lodging activity. For v1, flight info goes in notes. The key is using the **ISO date from search params** (not the parser's display date like "APR 05") for `findOrCreateByDate`.

```typescript
export function useAddVacationToItinerary(defaultItineraryId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      result,
      pkg,
      searchDate,      // ISO YYYY-MM-DD from the search form DatePickerEnhanced
      itineraryId,
      tripId,
    }: {
      result: VacationSearchResult
      pkg: VacationPackageOption
      searchDate: string  // ISO date used in the search — this is the reliable date
      itineraryId?: string
      tripId?: string
    }) => {
      const targetItineraryId = itineraryId ?? defaultItineraryId
      if (!targetItineraryId) throw new Error('No itinerary ID provided')

      // 1. Find or create day for departure date (uses ISO date from search form)
      const dayResp = await api.post<{ id: string }>(
        `/itineraries/${targetItineraryId}/days/find-or-create-by-date`,
        { date: searchDate }
      )

      // 2. Create lodging activity with flight info in notes
      const activity = await api.post('/activities', {
        itineraryDayId: dayResp.id,
        activityType: 'lodging',
        proposalStatus: 'draft',
        name: `${result.hotelName} - ${pkg.nights}N ${pkg.mealPlan}`,
        propertyName: result.hotelName,
        locationName: result.destination,
        startDate: searchDate,
        nights: pkg.nights,
        notes: [
          `Tour Operator: ${pkg.tourOperator}`,
          `Flight: ${pkg.flightNumber} (${pkg.departureTime} → ${pkg.arrivalTime})`,
          `Room: ${pkg.roomType}`,
          `Meal Plan: ${pkg.mealPlan}`,
          `Baggage: ${pkg.baggage || 'Check with airline'}`,
          `Price: $${(pkg.totalPrice / 100).toLocaleString()}/pp ($${(pkg.grandTotal / 100).toLocaleString()} total)`,
        ].join('\n'),
      })

      return activity
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['itineraries'] })
      queryClient.invalidateQueries({ queryKey: ['trips'] })
    },
  })
}
```

- [ ] **Step 2: Wire mutation into page.tsx**

Update `handleAddToTrip` and `handleCreateTrip` in the vacation page to use the mutation. Store `searchDate` (the ISO date from the search form) in page state so it's available when adding to trip.

For the no-trip-context flow, use `AddToTripDialog` (import from `@/components/library/add-to-trip-dialog`).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/hooks/use-vacation-library.ts apps/admin/src/app/library/vacation/page.tsx
git commit -m "feat(admin): wire vacation add-to-trip mutation with AddToTripDialog"
```

---

## Phase 4: Verify + Ship

### Task 10: End-to-End Verification

- [ ] **Step 1: Start dev server**

```bash
turbo dev
```

- [ ] **Step 2: Verify vacation library page**

1. Navigate to `http://localhost:3100/library/vacation`
2. Sidebar shows "Vacation Packages" with Palmtree icon
3. Search form loads gateways from API
4. Select gateway → destinations reload
5. Fill form → click Search → loading state → results appear
6. Click card → detail modal opens
7. Enrichment loads (or shows loading spinner)
8. Package table is sortable, price toggle works
9. Select package → "Add to Trip" / "Create Trip" buttons enable

- [ ] **Step 3: Verify trip integration**

1. Open a trip with an itinerary
2. Drag "Vacation Package" from component library sidebar
3. Verify navigation to `/library/vacation?tripId=...&itineraryId=...`
4. "Back to Trip" button visible
5. Search and select a package
6. "Add to Itinerary" creates lodging activity
7. Return to trip shows the new activity

- [ ] **Step 4: Run build**

```bash
pnpm --filter @tailfire/admin build
```

- [ ] **Step 5: Commit fixes, push, PR**

```bash
git push -u origin feature/vacation-library-ui
gh pr create --base main --title "feat(admin): Vacation Package Library UI"
```
