# Super Search — Design Spec

## Problem

The admin platform's navbar has a search button (with `Cmd+K` hint) that is completely non-functional. Users have no way to quickly find trips, contacts, or other entities without manually navigating to each section and using per-page search. Travel agents need to locate records fast — by client name, trip reference, email, or phone — from anywhere in the app.

## Solution

A global command palette (`Cmd+K`) powered by a single unified search API endpoint. The palette searches across core entity types in parallel, shows rich grouped results, and navigates directly to the selected record.

---

## 1. Searchable Entities

### v1 (this spec)

| Entity | Searchable Fields | Navigation Target | Icon |
|--------|------------------|------------------|------|
| **Trips** | name, description, referenceNumber | `/trips/:id` (detail page) | `Plane` |
| **Contacts** | firstName, lastName, email, phone | `/contacts/:id` (detail page) | `Users` |

Both have full detail pages with `[id]` dynamic routes — no deep-link contracts needed.

### v2 (future)

Tasks, suppliers, emails, tours, cruises, destinations, commission, tags, itineraries, notes. These require defining URL/deep-link contracts (e.g., `?search=` hydration, modal-open params) before they can be added.

---

## 2. Backend — Unified Search Endpoint

### New Module

**Files:**
- `apps/api/src/search/search.module.ts`
- `apps/api/src/search/search.controller.ts`
- `apps/api/src/search/search.service.ts`
- `apps/api/src/search/dto/search.dto.ts`
- `packages/shared-types/src/api/search.types.ts`

### Endpoint

`GET /api/v1/search?q=<term>&limit=5`

**Auth:** JWT required. Auth context passed through to each domain search method.

### Query DTO

```typescript
class SearchQueryDto {
  @IsString()
  @MinLength(2)
  q: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 5
}
```

### SearchService

Injects:
- `TripsService` + `TripAccessService`
- `ContactsService` + `ContactAccessService`

Each domain gets a dedicated `searchSummary(auth, q, limit)` private method in `SearchService` that:
1. Uses the domain's access service to resolve accessible IDs/scoping for the current user
2. Calls the domain service's `findAll()` with `{ search: q, limit: limit + 1, page: 1 }` and the appropriate access filters
3. Maps results to slim `SearchResultItem` projections
4. Returns `{ items, hasMore }` where `hasMore = results.length > limit` (trim to `limit`)

Queries both domains in parallel via `Promise.allSettled()`. Each call is individually wrapped — if one domain errors, the other still returns results.

### Access Control

**No new auth logic.** Each domain's existing access service enforces the real rules:

- **Trips:** Owned + shared + inbound visibility via `TripAccessService`. The service's `findAll()` already accepts accessible trip IDs from the controller — `SearchService` must replicate this by calling `TripAccessService.getAccessibleTripIds()` and passing them through.
- **Contacts:** Share-based visibility + default agency basic visibility via `ContactAccessService`. The controller at `contacts.controller.ts:81` applies additional access shaping after `findAll()` — `SearchService` must replicate this by calling `ContactAccessService` to filter/shape results the same way.

Admins see all results (matching existing service behavior).

### Response Types

```typescript
// packages/shared-types/src/api/search.types.ts

export type SearchResultType = 'trip' | 'contact'

export interface SearchResultItem {
  id: string
  type: SearchResultType
  title: string
  subtitle?: string
  status?: string
  url: string
}

export interface TripSearchResult extends SearchResultItem {
  type: 'trip'
  referenceNumber?: string
  startDate?: string
  endDate?: string
}

export interface ContactSearchResult extends SearchResultItem {
  type: 'contact'
  email?: string
  phone?: string
}

export interface SearchResultGroup<T extends SearchResultItem = SearchResultItem> {
  items: T[]
  hasMore: boolean
}

export interface SearchResponseDto {
  trips: SearchResultGroup<TripSearchResult>
  contacts: SearchResultGroup<ContactSearchResult>
}
```

### Projection Mapping

| Entity | `title` | `subtitle` | `status` | Typed fields | `url` |
|--------|---------|-----------|----------|-------------|-------|
| Trip | `name` | `referenceNumber` | `status` | `referenceNumber`, `startDate`, `endDate` | `/trips/${id}` |
| Contact | `firstName lastName` | `email` | — | `email`, `phone` | `/contacts/${id}` |

---

## 3. Frontend — SuperSearchDialog

### New Files

- `apps/admin/src/components/layout/super-search-dialog.tsx`
- `apps/admin/src/hooks/use-search.ts`

### Modified Files

- `apps/admin/src/components/layout/top-nav.tsx` — wire up search button + keyboard shortcut

### SuperSearchDialog Component

Renders `Dialog` + `Command shouldFilter={false}` directly (not `CommandDialog`, which does not expose `shouldFilter` to the inner `Command` root). Precedent: `supplier-combobox.tsx` uses server-backed cmdk with `shouldFilter={false}`.

Key implementation details:
- **`shouldFilter={false}`** on the `<Command>` root — results are server-filtered, client filtering must be disabled
- **Keyboard shortcut:** `useEffect` registers `Cmd+K` / `Ctrl+K` listener to toggle the dialog
- **Debounced input:** 300ms debounce via existing `useDebounce` hook, minimum 2 characters before firing
- **Loading state:** Show `Loader2` spinner while fetching
- **Empty state:** `CommandEmpty` with "No results found" when search returns zero items across all groups
- **Result groups:** One `CommandGroup` per entity type, each with a heading (e.g., "Trips", "Contacts"). Only rendered if the group has results.
- **"View all" links:** If `group.hasMore === true`, show a footer `CommandItem` that navigates to the entity's list page

### Rich Result Rows

Each `CommandItem` renders entity-specific content using the typed result fields:

- **Trips:** `Plane` icon + trip name + reference number (muted) + status badge + date range (muted)
- **Contacts:** `Users` icon + full name + email (muted) + phone (muted)

### useSearch Hook

```typescript
// apps/admin/src/hooks/use-search.ts
export function useSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300)

  return useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => api.get<SearchResponseDto>(
      `/search?q=${encodeURIComponent(debouncedQuery)}`
    ),
    enabled: debouncedQuery.length >= 2,
  })
}
```

### TopNav Integration

Changes to `top-nav.tsx`:
1. Add `useState` for dialog open/close
2. Add `onClick` handler to the existing search `<Button>` to open the dialog
3. Render `<SuperSearchDialog open={open} onOpenChange={setOpen} />`
4. The keyboard shortcut (`Cmd+K`) is handled inside `SuperSearchDialog` via `useEffect`

### Navigation

On `CommandItem` select:
1. `router.push(item.url)`
2. Close the dialog

### "View All" Navigation

Each group's footer link navigates to the entity's list page:

| Entity | "View all" URL |
|--------|---------------|
| Trips | `/trips` |
| Contacts | `/contacts` |

**Note:** Neither list page currently hydrates search state from URL params — both use local component state. For v1, "View all" simply navigates to the list page. Adding `?search=` param hydration to list pages is a v2 enhancement.

---

## 4. Performance

- **Debounce:** 300ms client-side debounce prevents excessive API calls
- **Min chars:** 2-character minimum filters out noise
- **Parallel queries:** `Promise.allSettled()` ensures all domain searches run concurrently
- **Result cap:** 5 results per entity type keeps response size small
- **`limit + 1` pattern:** Avoids expensive count queries — fetch one extra to determine `hasMore`
- **Slim projections:** Only return display fields, not full entity DTOs — skip heavy DTO assembly
- **No full-text indexes needed:** Existing `ILIKE` on indexed text columns is fast enough for the data volumes in this app
- **Error isolation:** Individual domain failures don't block other results

---

## 5. UX Behavior

| Action | Result |
|--------|--------|
| Click search button in navbar | Opens command palette |
| Press `Cmd+K` / `Ctrl+K` | Opens command palette |
| Type < 2 chars | No search fires, input shown |
| Type >= 2 chars | Debounced search fires after 300ms |
| Arrow keys | Navigate between results |
| Enter / click result | Navigate to entity detail page, close dialog |
| Click "View all" | Navigate to entity list page |
| Press `Escape` | Close dialog |
| Click outside dialog | Close dialog |

---

## 6. Files Changed

| File | Change |
|------|--------|
| `apps/api/src/search/search.module.ts` | **New** — NestJS module importing TripsModule, ContactsModule |
| `apps/api/src/search/search.controller.ts` | **New** — `GET /search` endpoint |
| `apps/api/src/search/search.service.ts` | **New** — parallel search orchestration with access services + projection mapping |
| `apps/api/src/search/dto/search.dto.ts` | **New** — query validation DTO |
| `apps/api/src/app.module.ts` | **Modify** — register SearchModule |
| `packages/shared-types/src/api/search.types.ts` | **New** — typed response definitions (discriminated union) |
| `packages/shared-types/src/api/index.ts` | **Modify** — export search types |
| `apps/admin/src/components/layout/super-search-dialog.tsx` | **New** — command palette UI (Dialog + Command shouldFilter={false}) |
| `apps/admin/src/hooks/use-search.ts` | **New** — search hook with debounce |
| `apps/admin/src/components/layout/top-nav.tsx` | **Modify** — wire search button + render dialog |

## Out of Scope

- Additional entity types (tasks, suppliers, emails, etc.) — v2, requires deep-link contracts
- Recent searches / search history
- Quick actions (create trip, go to dashboard)
- Full-text search indexes (pg_trgm, tsvector)
- Search analytics or tracking

## v2 Enhancements

### Additional Entity Types
- **Trip Groups / Folders** — `listTripGroups()` in `trips.service.ts:3619` already has access control (owner/shared/folder visibility). Needs: add `search` filter with ILIKE on `name`, `description`, `destination`, `groupNumber`. Navigate to `/trips/groups/:id`.
- **Tasks** — Service has search support but no detail page route. Needs: define deep-link contract (e.g., `?taskId=` param to open modal on `/tasks`).
- **Suppliers** — Service has search support but no detail page route. Needs: define deep-link contract for `/library/suppliers`.
- **Emails** — Two separate systems (agency email logs vs user synced mailbox). Needs: pick one, define route contract for `/emails/inbox`.

### Deeper Trip Search
- Current trip search only matches `name`, `description`, `referenceNumber` on the trips table.
- v2 should also search: **destinations** (itinerary day locations), **activity names**, **traveler names** (contact firstName/lastName on trip travelers), **supplier names** on activities.
- This requires JOIN-based search or a denormalized search index.

### Performance
- Replace generic `findAll()` calls with dedicated `searchSummary()` methods that skip count queries and heavy DTO assembly.
- Consider `pg_trgm` extension for fuzzy/typo-tolerant search.
- Consider a denormalized search table or materialized view for cross-entity search at scale.

### UX
- Recent searches stored in localStorage (last 5-10 queries)
- Quick actions: "Create new trip", "Create new contact", "Go to Dashboard"
- Keyboard navigation hints in the dialog
- Search result ranking/relevance ordering across entity types
