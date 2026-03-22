# Super Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global command palette (Cmd+K) to the admin navbar that searches across trips and contacts with instant debounced results.

**Architecture:** A unified `GET /api/v1/search` endpoint delegates to existing `TripsService` and `ContactsService` with proper access control via `TripAccessService` and `ContactAccessService`. The frontend renders a `Dialog + Command shouldFilter={false}` command palette wired to the TopNav search button and Cmd+K shortcut.

**Tech Stack:** NestJS (backend), React + cmdk + shadcn/ui (frontend), TanStack Query (data fetching), Drizzle ORM (database)

**Spec:** `docs/superpowers/specs/2026-03-21-super-search-design.md`

**Worktree:** `.worktrees/super-search` on branch `feature/super-search`

---

### Task 1: Shared Types — Search Response Definitions

**Files:**
- Create: `packages/shared-types/src/api/search.types.ts`
- Modify: `packages/shared-types/src/api/index.ts`

- [ ] **Step 1: Create search type definitions**

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

- [ ] **Step 2: Export from barrel**

Add to `packages/shared-types/src/api/index.ts`:

```typescript
export * from './search.types.js'
```

Follow the existing pattern — all exports use `.js` extensions.

- [ ] **Step 3: Verify build**

Run: `cd packages/shared-types && pnpm build`
Expected: Clean build with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/api/search.types.ts packages/shared-types/src/api/index.ts
git commit -m "feat(shared-types): add search response type definitions"
```

---

### Task 2: Backend — Search DTO

**Files:**
- Create: `apps/api/src/search/dto/search.dto.ts`

- [ ] **Step 1: Create the search query DTO**

```typescript
// apps/api/src/search/dto/search.dto.ts
import { IsString, MinLength, IsOptional, IsInt, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class SearchQueryDto {
  @IsString()
  @MinLength(2)
  q: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 5
}
```

Follow existing DTO pattern from `trip-filter.dto.ts` — use `@Type(() => Number)` for query string conversion.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/search/dto/search.dto.ts
git commit -m "feat(api): add search query DTO"
```

---

### Task 3: Backend — SearchService

**Files:**
- Create: `apps/api/src/search/search.service.ts`

**Context — how access control works in existing services:**

Trips controller (`trips.controller.ts:99-104`):
```typescript
async findAll(@GetAuthContext() auth, @Query() filters) {
  return this.tripsService.findAll(filters, auth, this.tripAccessService)
}
```
`TripsService.findAll()` calls `tripAccessService.getAccessibleTripIds(auth)` internally — returns `'all'` for admins or `string[]` of accessible IDs.

Contacts controller (`contacts.controller.ts:81-93`):
```typescript
async findAll(@GetAuthContext() auth, @Query() filters) {
  const result = await this.contactsService.findAll(filters, auth.agencyId, auth.userId)
  const filteredData = await this.contactAccessService.applyAccessControlToMany(result.data, auth)
  return { ...result, data: filteredData }
}
```
`ContactsService.findAll()` takes `(filters, agencyId, userId)`. Then `contactAccessService.applyAccessControlToMany()` post-processes to enforce share-based visibility.

- [ ] **Step 1: Create SearchService**

```typescript
// apps/api/src/search/search.service.ts
import { Injectable } from '@nestjs/common'
import { TripsService } from '../trips/trips.service'
import { TripAccessService } from '../trips/trip-access.service'
import { ContactsService } from '../contacts/contacts.service'
import { ContactAccessService } from '../contacts/contact-access.service'
import type { AuthContext } from '../auth/auth.types'
import type {
  SearchResponseDto,
  TripSearchResult,
  ContactSearchResult,
  SearchResultGroup,
} from '@tailfire/shared-types'

@Injectable()
export class SearchService {
  constructor(
    private readonly tripsService: TripsService,
    private readonly tripAccessService: TripAccessService,
    private readonly contactsService: ContactsService,
    private readonly contactAccessService: ContactAccessService,
  ) {}

  async search(q: string, limit: number, auth: AuthContext): Promise<SearchResponseDto> {
    const [tripsResult, contactsResult] = await Promise.allSettled([
      this.searchTrips(q, limit, auth),
      this.searchContacts(q, limit, auth),
    ])

    return {
      trips: tripsResult.status === 'fulfilled'
        ? tripsResult.value
        : { items: [], hasMore: false },
      contacts: contactsResult.status === 'fulfilled'
        ? contactsResult.value
        : { items: [], hasMore: false },
    }
  }

  private async searchTrips(
    q: string,
    limit: number,
    auth: AuthContext,
  ): Promise<SearchResultGroup<TripSearchResult>> {
    // Use the same pattern as trips.controller.ts:
    // Pass tripAccessService to findAll() so it resolves accessible trip IDs
    const result = await this.tripsService.findAll(
      { search: q, limit: limit + 1, page: 1 },
      auth,
      this.tripAccessService,
    )

    const hasMore = result.data.length > limit
    const items: TripSearchResult[] = result.data.slice(0, limit).map((trip) => ({
      id: trip.id,
      type: 'trip' as const,
      title: trip.name,
      subtitle: trip.referenceNumber || undefined,
      status: trip.status,
      url: `/trips/${trip.id}`,
      referenceNumber: trip.referenceNumber || undefined,
      startDate: trip.startDate || undefined,
      endDate: trip.endDate || undefined,
    }))

    return { items, hasMore }
  }

  private async searchContacts(
    q: string,
    limit: number,
    auth: AuthContext,
  ): Promise<SearchResultGroup<ContactSearchResult>> {
    // Use the same pattern as contacts.controller.ts:
    // 1. Call findAll() with agencyId + userId
    // 2. Post-process with contactAccessService.applyAccessControlToMany()
    const result = await this.contactsService.findAll(
      { search: q, limit: limit + 1, page: 1 },
      auth.agencyId,
      auth.userId,
    )

    const accessControlled = await this.contactAccessService.applyAccessControlToMany(
      result.data,
      auth,
    )

    // Note: hasMore may be inaccurate for non-admin users because
    // applyAccessControlToMany() can filter out some of the limit+1 results.
    // This matches the existing controller behavior and is acceptable for v1.
    const hasMore = accessControlled.length > limit
    const items: ContactSearchResult[] = accessControlled.slice(0, limit).map((contact) => ({
      id: contact.id,
      type: 'contact' as const,
      title: [contact.firstName, contact.lastName].filter(Boolean).join(' '),
      subtitle: contact.email || undefined,
      url: `/contacts/${contact.id}`,
      email: contact.email || undefined,
      phone: contact.phone || undefined,
    }))

    return { items, hasMore }
  }
}
```

**Key decisions:**
- Trips: pass `this.tripAccessService` to `findAll()` — same as the controller does
- Contacts: call `findAll()` then `applyAccessControlToMany()` — same as the controller does
- `limit + 1` pattern: fetch one extra, check if `data.length > limit`, then trim. Note: `findAll()` still runs its internal count query — a v2 optimization would add dedicated `searchSummary()` methods that skip the count
- Each domain wrapped in `Promise.allSettled()` for error isolation
- Map full DTOs to slim projections — only fields needed for display

- [ ] **Step 2: Verify the AuthContext import resolves**

Run: `grep -r "export.*AuthContext" apps/api/src/auth/`
Expected: Confirms `AuthContext` is exported from `apps/api/src/auth/auth.types.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/search/search.service.ts
git commit -m "feat(api): add SearchService with trip and contact search"
```

---

### Task 4: Backend — SearchController

**Files:**
- Create: `apps/api/src/search/search.controller.ts`

- [ ] **Step 1: Create SearchController**

```typescript
// apps/api/src/search/search.controller.ts
import { Controller, Get, Query } from '@nestjs/common'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { SearchService } from './search.service'
import { SearchQueryDto } from './dto/search.dto'
import type { SearchResponseDto } from '@tailfire/shared-types'

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @GetAuthContext() auth: AuthContext,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.searchService.search(query.q, query.limit ?? 5, auth)
  }
}
```

**Important:** No `@UseGuards(JwtAuthGuard)` needed — the JWT guard is registered globally via Passport's `defaultStrategy: 'jwt'` in `AuthModule`. This matches `TripsController` and `ContactsController` which have no explicit guard decorator.

Check the exact import path for `GetAuthContext` by looking at existing controllers:
Run: `head -20 apps/api/src/trips/trips.controller.ts` to verify import paths.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/search/search.controller.ts
git commit -m "feat(api): add SearchController with GET /search endpoint"
```

---

### Task 5: Backend — SearchModule + Registration

**Files:**
- Create: `apps/api/src/search/search.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create SearchModule**

```typescript
// apps/api/src/search/search.module.ts
import { Module } from '@nestjs/common'
import { TripsModule } from '../trips/trips.module'
import { ContactsModule } from '../contacts/contacts.module'
import { SearchController } from './search.controller'
import { SearchService } from './search.service'

@Module({
  imports: [TripsModule, ContactsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
```

`TripsModule` exports `TripsService` and `TripAccessService` (lines 167-169 of `trips.module.ts`).
`ContactsModule` exports `ContactsService` and `ContactAccessService` (lines 53-58 of `contacts.module.ts`).

- [ ] **Step 2: Register in app.module.ts**

Add import at the top of `apps/api/src/app.module.ts`:
```typescript
import { SearchModule } from './search/search.module'
```

Add `SearchModule` to the `imports` array in `@Module({})`, after the feature modules section (after line ~139 where other feature modules are listed).

- [ ] **Step 3: Verify the API starts**

Run: `cd apps/api && pnpm build`
Expected: Clean build with no circular dependency or missing provider errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/search/search.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): register SearchModule in app module"
```

---

### Task 6: Backend — Manual API Test

- [ ] **Step 1: Start the dev server**

Run: `turbo dev` (from project root, in tmux pane 2)

- [ ] **Step 2: Get an auth token**

Use the existing login flow or the test script at `/tmp/get_token.py` to get a JWT token.

- [ ] **Step 3: Test the search endpoint**

```bash
curl -s "http://localhost:3101/api/v1/search?q=test" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: JSON response with `trips` and `contacts` groups, each with `items` array and `hasMore` boolean.

```bash
# Test with short query (should fail validation)
curl -s "http://localhost:3101/api/v1/search?q=a" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: 400 Bad Request — query too short (min 2 chars).

```bash
# Test without auth
curl -s "http://localhost:3101/api/v1/search?q=test" | jq .
```

Expected: 401 Unauthorized.

- [ ] **Step 4: Commit (no changes — verification only)**

---

### Task 7: Frontend — useSearch Hook

**Files:**
- Create: `apps/admin/src/hooks/use-search.ts`

- [ ] **Step 1: Create the search hook**

```typescript
// apps/admin/src/hooks/use-search.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useDebounce } from '@/hooks/use-debounce'
import type { SearchResponseDto } from '@tailfire/shared-types/api'

export function useSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300)

  return useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () =>
      api.get<SearchResponseDto>(
        `/search?q=${encodeURIComponent(debouncedQuery)}`
      ),
    enabled: debouncedQuery.length >= 2,
  })
}
```

**Pattern notes:**
- `useDebounce` is at `apps/admin/src/hooks/use-debounce.ts` — signature: `useDebounce<T>(value: T, delay: number): T`
- `api.get` is the shared API client at `@/lib/api`
- Query key `['search', debouncedQuery]` ensures cache per query string
- `enabled: debouncedQuery.length >= 2` prevents firing for short queries

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/use-search.ts
git commit -m "feat(admin): add useSearch hook with debounced query"
```

---

### Task 8: Frontend — SuperSearchDialog Component

**Files:**
- Create: `apps/admin/src/components/layout/super-search-dialog.tsx`

**Context — cmdk pattern from `supplier-combobox.tsx:159`:**
```tsx
<Command shouldFilter={false}>
  <CommandInput placeholder="Search..." value={search} onValueChange={setSearch} />
  <CommandList>
    <CommandEmpty>No results.</CommandEmpty>
    <CommandGroup heading="Suppliers">
      {items.map(item => <CommandItem key={item.id} ...>...</CommandItem>)}
    </CommandGroup>
  </CommandList>
</Command>
```

**Important:** Do NOT use `<CommandDialog>` — it wraps `<Command>` internally and does not expose `shouldFilter`. Instead, render `<Dialog>` + `<Command shouldFilter={false}>` directly.

- [ ] **Step 1: Create SuperSearchDialog**

```tsx
// apps/admin/src/components/layout/super-search-dialog.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plane, Users } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { useSearch } from '@/hooks/use-search'
import { formatDate } from '@/lib/utils'
import { getTripStatusVariant } from '@/lib/trip-status-constants'
import type { TripSearchResult, ContactSearchResult } from '@tailfire/shared-types/api'

interface SuperSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SuperSearchDialog({ open, onOpenChange }: SuperSearchDialogProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const { data, isLoading } = useSearch(query)

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange])

  const handleSelect = useCallback(
    (url: string) => {
      router.push(url)
      onOpenChange(false)
    },
    [router, onOpenChange],
  )

  // Gate result rendering on query length — prevents stale cached results
  // from showing when the user clears or shortens the input below 2 chars
  const isSearchActive = query.length >= 2
  const trips = isSearchActive ? data?.trips : undefined
  const contacts = isSearchActive ? data?.contacts : undefined
  const hasResults = (trips?.items.length ?? 0) > 0 || (contacts?.items.length ?? 0) > 0
  const showEmpty = isSearchActive && !isLoading && !hasResults

  // Import the centralized trip status badge helper instead of a local map.
  // Check `apps/admin/src/lib/trip-status-constants.ts` for the current
  // `getTripStatusVariant()` or equivalent helper. The canonical statuses are:
  // inbound, planning, active, travelling, travelled, cancelled.
  // Use whatever helper that file exports — do NOT hardcode a local status map.

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-lg" aria-describedby={undefined}>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          <CommandInput
            placeholder="Search trips, contacts..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[400px]">
            {isLoading && query.length >= 2 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
              </div>
            )}

            {showEmpty && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}

            {/* Trips group */}
            {trips && trips.items.length > 0 && (
              <CommandGroup heading="Trips">
                {trips.items.map((trip: TripSearchResult) => (
                  <CommandItem
                    key={trip.id}
                    value={`trip-${trip.id}`}
                    onSelect={() => handleSelect(trip.url)}
                    className="cursor-pointer"
                  >
                    <Plane className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{trip.title}</span>
                        {trip.status && (
                          <Badge variant={getTripStatusVariant(trip.status)} className="shrink-0 text-xs">
                            {trip.status.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {trip.referenceNumber && (
                          <span className="text-xs text-muted-foreground">{trip.referenceNumber}</span>
                        )}
                        {trip.startDate && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(trip.startDate)}
                            {trip.endDate && ` - ${formatDate(trip.endDate)}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
                {trips.hasMore && (
                  <CommandItem
                    value="view-all-trips"
                    onSelect={() => handleSelect('/trips')}
                    className="cursor-pointer justify-center text-muted-foreground"
                  >
                    <span className="text-xs">View all trip results</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}

            {/* Separator between groups */}
            {trips && trips.items.length > 0 && contacts && contacts.items.length > 0 && (
              <CommandSeparator />
            )}

            {/* Contacts group */}
            {contacts && contacts.items.length > 0 && (
              <CommandGroup heading="Contacts">
                {contacts.items.map((contact: ContactSearchResult) => (
                  <CommandItem
                    key={contact.id}
                    value={`contact-${contact.id}`}
                    onSelect={() => handleSelect(contact.url)}
                    className="cursor-pointer"
                  >
                    <Users className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{contact.title}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {contact.email && (
                          <span className="text-xs text-muted-foreground truncate">{contact.email}</span>
                        )}
                        {contact.phone && (
                          <span className="text-xs text-muted-foreground">{contact.phone}</span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
                {contacts.hasMore && (
                  <CommandItem
                    value="view-all-contacts"
                    onSelect={() => handleSelect('/contacts')}
                    className="cursor-pointer justify-center text-muted-foreground"
                  >
                    <span className="text-xs">View all contact results</span>
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

**Key decisions:**
- `Dialog + Command shouldFilter={false}` — NOT `CommandDialog` (which doesn't expose `shouldFilter`)
- CSS classes on `<Command>` match `CommandDialog`'s styling from `command.tsx:30`
- `CommandList` max-height increased to `400px` for more results
- `value={`trip-${trip.id}`}` prevents cmdk key collisions between entity types
- `statusVariant()` matches the pattern from `add-trip-to-group-dialog.tsx:166-177`
- Loading spinner only shown when `query.length >= 2` (search is active)
- "View all" items shown only when `hasMore === true`

- [ ] **Step 2: Verify the component builds**

Run: `cd apps/admin && pnpm build` (or check for TypeScript errors in the IDE)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/layout/super-search-dialog.tsx
git commit -m "feat(admin): add SuperSearchDialog command palette component"
```

---

### Task 9: Frontend — Wire TopNav Search Button

**Files:**
- Modify: `apps/admin/src/components/layout/top-nav.tsx`

- [ ] **Step 1: Read the current file**

Read `apps/admin/src/components/layout/top-nav.tsx` to get the latest state. Key areas:
- Line 2: imports
- Line 45-46: existing state declarations
- Lines 149-160: the search button (currently a plain `<Button>` with no handler)

- [ ] **Step 2: Add imports and state**

Add import at the top (after existing imports):
```typescript
import { SuperSearchDialog } from '@/components/layout/super-search-dialog'
```

Add state inside `TopNav()` function (after line 46, near other state):
```typescript
const [searchOpen, setSearchOpen] = useState(false)
```

- [ ] **Step 3: Wire the search button**

Replace the search button (lines 149-160) with:
```tsx
{/* Search */}
<Button
  variant="outline"
  size="sm"
  className="h-8 w-64 justify-start text-sm text-ash-500 border-ash-200"
  onClick={() => setSearchOpen(true)}
>
  <Search className="mr-2 h-4 w-4" />
  Search
  <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-ash-200 bg-ash-50 px-1.5 font-mono text-[10px] font-medium text-ash-600">
    <span className="text-xs">⌘</span>K
  </kbd>
</Button>
```

The only change is adding `onClick={() => setSearchOpen(true)}`.

- [ ] **Step 4: Render the dialog**

Add the dialog render right before the closing `</header>` tag (after `<BugReportDialog .../>`, around line 244):

```tsx
<SuperSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
```

- [ ] **Step 5: Verify the component renders**

Start the dev server with `turbo dev`. Navigate to the admin app at `http://localhost:3100`. Click the search button — the command palette should open. Press `Cmd+K` — it should toggle. Type 2+ characters — results should appear (or "No results found" if no matches).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/layout/top-nav.tsx
git commit -m "feat(admin): wire search button and Cmd+K to SuperSearchDialog"
```

---

### Task 10: End-to-End Verification

- [ ] **Step 1: Start full dev server**

Run `turbo dev` from the project root in tmux pane 2.

- [ ] **Step 2: Test in browser**

1. Navigate to `http://localhost:3100`
2. Click the search button — dialog opens
3. Press `Escape` — dialog closes
4. Press `Cmd+K` — dialog opens
5. Type "a" — no search fires (too short)
6. Type "al" — search fires after 300ms, results appear
7. Verify trip results show: name, reference number, status badge, dates
8. Verify contact results show: name, email, phone
9. Click a trip result — navigates to `/trips/:id`, dialog closes
10. Press `Cmd+K`, search again, click a contact — navigates to `/contacts/:id`
11. Search for something with many results — verify "View all" links appear
12. Click "View all trip results" — navigates to `/trips`

- [ ] **Step 3: Test access control**

1. Log in as a non-admin agent
2. Search — verify only trips/contacts the agent has access to appear
3. Log in as admin
4. Search the same term — verify all matching trips/contacts appear

- [ ] **Step 4: Test edge cases**

1. Type very fast — verify debounce prevents excessive API calls (check Network tab)
2. Search for a term that matches nothing — verify "No results found" appears
3. Search, then quickly clear the input — verify no stale results flash
4. Open dialog, type, close dialog, reopen — verify input is cleared

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix(admin): address Super Search edge cases from testing"
```
