# Consumer Trip Builder — Backend Foundation (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Phase 1 OTA trip request backend to support anonymous drafts, session tracking, single-component append/remove, board ordering, share tokens, inspiration image sourcing, and identity linking — everything the dream board frontend needs.

**Architecture:** Extends `ota_trip_requests` with new columns (session_id, share_token, board_order, inspiration, contact_id, date_flexibility, travel_style). Makes email nullable for anonymous drafts. Adds 9 new API endpoints for basket operations. Reuses existing Unsplash and SerpAPI services for inspiration images.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, existing Unsplash + SerpAPI services

**Spec:** `docs/superpowers/specs/2026-04-01-consumer-trip-builder-design.md`

**Depends on:** Phase 1 (OTA Trip Request Pipeline) — already implemented on preview

---

## File Structure

```
packages/database/src/
├── schema/
│   └── ota-trip-requests.schema.ts     # MODIFY — add new columns, make email nullable
├── migrations/
│   └── 20260401120000_extend_ota_trip_requests.sql  # NEW

apps/api/src/ota/
├── dto/
│   └── create-trip-request.dto.ts      # MODIFY — email optional, add new DTOs
│   └── trip-request-identity.dto.ts    # NEW — identity linking DTO
│   └── trip-request-share.dto.ts       # NEW — share token DTO
│   └── board-order.dto.ts             # NEW — board ordering DTO
├── ota-trip-requests.service.ts        # MODIFY — add new methods
├── ota-trip-requests.controller.ts     # MODIFY — add new endpoints
├── trip-inspiration.service.ts         # NEW — fetch inspiration images
├── ota.module.ts                       # MODIFY — register new service

apps/ota/src/
├── app/api/trip-requests/
│   └── route.ts                        # NEW — create draft proxy
│   └── [id]/route.ts                   # NEW — get request proxy
│   └── [id]/components/add/route.ts    # NEW — append component proxy
│   └── [id]/components/[cid]/route.ts  # NEW — remove component proxy
│   └── [id]/board-order/route.ts       # NEW — update board order proxy
│   └── [id]/submit/route.ts            # NEW — submit proxy
│   └── [id]/share/route.ts             # NEW — manage share token proxy
│   └── [id]/identity/route.ts          # NEW — link identity proxy
│   └── [id]/inspiration/route.ts       # NEW — fetch inspiration proxy
│   └── by-session/[sid]/route.ts       # NEW — lookup by session proxy
│   └── shared/[token]/route.ts         # NEW — public shared view proxy
```

---

### Task 1: Schema Extension — New Columns + Email Nullable

**Files:**
- Create: `packages/database/src/migrations/20260401120000_extend_ota_trip_requests.sql`
- Modify: `packages/database/src/schema/ota-trip-requests.schema.ts`
- Modify: `packages/database/src/migrations/meta/_journal.json`

- [ ] **Step 1: Create migration**

```sql
-- packages/database/src/migrations/20260401120000_extend_ota_trip_requests.sql

-- Make email nullable for anonymous drafts
ALTER TABLE ota_trip_requests ALTER COLUMN contact_email DROP NOT NULL;

-- New columns for Phase 2
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS share_token varchar(64);
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS date_flexibility boolean DEFAULT false;
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS travel_style varchar(20);
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS inspiration jsonb DEFAULT '[]'::jsonb;
ALTER TABLE ota_trip_requests ADD COLUMN IF NOT EXISTS board_order jsonb DEFAULT '[]'::jsonb;

-- Indexes for new columns
CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_trip_requests_share_token
  ON ota_trip_requests (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ota_trip_requests_session
  ON ota_trip_requests (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ota_trip_requests_contact
  ON ota_trip_requests (contact_id) WHERE contact_id IS NOT NULL;
```

- [ ] **Step 2: Update Drizzle schema**

In `packages/database/src/schema/ota-trip-requests.schema.ts`:

1. Change `contactEmail` from `.notNull()` to allow null:
```typescript
contactEmail: text('contact_email'),  // Nullable for anonymous drafts
```

2. Add new columns after `specialRequests`:
```typescript
// Session tracking (anonymous basket)
sessionId: text('session_id'),

// Share token for read-only links
shareToken: varchar('share_token', { length: 64 }),

// Submit flow fields
dateFlexibility: boolean('date_flexibility').default(false),
travelStyle: varchar('travel_style', { length: 20 }),

// Linked contact after identity capture
contactId: uuid('contact_id'),

// Inspiration cards (separate from promotable components)
inspiration: jsonb('inspiration').default([]),

// Board display order (interleaved components + inspiration)
boardOrder: jsonb('board_order').default([]),
```

3. Add new indexes in the table options:
```typescript
sessionIdx: index('idx_ota_trip_requests_session').on(table.sessionId),
shareTokenIdx: index('idx_ota_trip_requests_share_token').on(table.shareToken),
contactIdx: index('idx_ota_trip_requests_contact').on(table.contactId),
```

- [ ] **Step 3: Register migration in journal**

Add entry to `packages/database/src/migrations/meta/_journal.json` as idx 184.

- [ ] **Step 4: Run migration**

```bash
cd apps/api && pnpm db:migrate
```

- [ ] **Step 5: Verify**

```bash
psql "$DATABASE_URL" -c "\d ota_trip_requests" | grep -E "session_id|share_token|contact_id|inspiration|board_order|date_flexibility|travel_style"
psql "$DATABASE_URL" -c "SELECT is_nullable FROM information_schema.columns WHERE table_name='ota_trip_requests' AND column_name='contact_email'"
```

Expected: 7 new columns visible, contact_email shows `YES` for nullable.

- [ ] **Step 6: Commit**

```bash
git add packages/database/ && git commit -m "feat: extend ota_trip_requests for Phase 2 — session, share, inspiration, board order"
```

---

### Task 2: Update DTOs + Service for Anonymous Drafts and New Fields

**Files:**
- Modify: `apps/api/src/ota/dto/create-trip-request.dto.ts`
- Create: `apps/api/src/ota/dto/trip-request-identity.dto.ts`
- Create: `apps/api/src/ota/dto/board-order.dto.ts`
- Modify: `apps/api/src/ota/ota-trip-requests.service.ts`

- [ ] **Step 1: Make email optional in CreateTripRequestDto**

In `apps/api/src/ota/dto/create-trip-request.dto.ts`, change:
```typescript
@IsEmail()
email: string
```
To:
```typescript
@IsOptional()
@IsEmail()
email?: string
```

Add new optional field for session:
```typescript
@IsOptional()
@IsString()
sessionId?: string
```

- [ ] **Step 2: Create identity DTO**

```typescript
// apps/api/src/ota/dto/trip-request-identity.dto.ts
import { IsEmail, IsOptional, IsString } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class LinkIdentityDto {
  @ApiProperty()
  @IsEmail()
  email: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string
}
```

- [ ] **Step 3: Create board order DTO**

```typescript
// apps/api/src/ota/dto/board-order.dto.ts
import { IsArray, ValidateNested, IsString, IsIn } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'

class BoardOrderItemDto {
  @ApiProperty({ enum: ['component', 'inspiration'] })
  @IsIn(['component', 'inspiration'])
  type: 'component' | 'inspiration'

  @ApiProperty()
  @IsString()
  id: string
}

export class UpdateBoardOrderDto {
  @ApiProperty({ type: [BoardOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BoardOrderItemDto)
  boardOrder: BoardOrderItemDto[]
}
```

- [ ] **Step 4: Add new service methods**

In `apps/api/src/ota/ota-trip-requests.service.ts`, add these methods:

**`findBySession(sessionId: string)`** — find active drafts for a session:
```typescript
async findBySession(sessionId: string): Promise<OtaTripRequest[]> {
  return this.db.client
    .select()
    .from(otaTripRequests)
    .where(and(
      eq(otaTripRequests.sessionId, sessionId),
      eq(otaTripRequests.status, 'draft'),
    ))
}
```

**`findByShareToken(token: string)`** — find a request by share token:
```typescript
async findByShareToken(token: string): Promise<OtaTripRequest | null> {
  const [result] = await this.db.client
    .select()
    .from(otaTripRequests)
    .where(eq(otaTripRequests.shareToken, token))
    .limit(1)
  return result ?? null
}
```

**`addComponent(id: string, component: any)`** — append a single component:
```typescript
async addComponent(id: string, component: any): Promise<OtaTripRequest> {
  const request = await this.findById(id)
  if (request.status !== 'draft') throw new BadRequestException('Can only modify draft requests')

  const components = [...(request.components as any[]), component]
  const [updated] = await this.db.client
    .update(otaTripRequests)
    .set({ components, updatedAt: new Date() })
    .where(eq(otaTripRequests.id, id))
    .returning()
  return updated!
}
```

**`removeComponent(id: string, componentId: string)`** — remove by component ID:
```typescript
async removeComponent(id: string, componentId: string): Promise<OtaTripRequest> {
  const request = await this.findById(id)
  if (request.status !== 'draft') throw new BadRequestException('Can only modify draft requests')

  const components = (request.components as any[]).filter((c: any) => c.id !== componentId)
  const boardOrder = (request.boardOrder as any[] || []).filter((item: any) =>
    !(item.type === 'component' && item.id === componentId)
  )
  const [updated] = await this.db.client
    .update(otaTripRequests)
    .set({ components, boardOrder, updatedAt: new Date() })
    .where(eq(otaTripRequests.id, id))
    .returning()
  return updated!
}
```

**`updateBoardOrder(id: string, boardOrder: any[])`**:
```typescript
async updateBoardOrder(id: string, boardOrder: any[]): Promise<OtaTripRequest> {
  const request = await this.findById(id)
  if (request.status !== 'draft') throw new BadRequestException('Can only modify draft requests')

  const [updated] = await this.db.client
    .update(otaTripRequests)
    .set({ boardOrder, updatedAt: new Date() })
    .where(eq(otaTripRequests.id, id))
    .returning()
  return updated!
}
```

**`generateShareToken(id: string)`**:
```typescript
async generateShareToken(id: string): Promise<string> {
  const request = await this.findById(id)
  if (request.shareToken) return request.shareToken

  const token = crypto.randomBytes(32).toString('hex') // 64 chars
  await this.db.client
    .update(otaTripRequests)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(eq(otaTripRequests.id, id))
  return token
}
```

**`revokeShareToken(id: string)`**:
```typescript
async revokeShareToken(id: string): Promise<void> {
  await this.db.client
    .update(otaTripRequests)
    .set({ shareToken: null, updatedAt: new Date() })
    .where(eq(otaTripRequests.id, id))
}
```

**`linkIdentity(id: string, dto: LinkIdentityDto)`** — CRM lookup + link contact:
```typescript
async linkIdentity(id: string, dto: LinkIdentityDto): Promise<{
  contactId: string
  isExisting: boolean
  advisorName?: string
}> {
  // Use captureLead to find or create contact
  const leadResult = await this.leadsService.captureLead({
    email: dto.email,
    name: dto.name,
    phone: dto.phone,
  })

  await this.db.client
    .update(otaTripRequests)
    .set({
      contactEmail: dto.email,
      contactName: dto.name ?? null,
      contactPhone: dto.phone ?? null,
      contactId: leadResult.contact.id,
      updatedAt: new Date(),
    })
    .where(eq(otaTripRequests.id, id))

  return {
    contactId: leadResult.contact.id,
    isExisting: leadResult.attribution === 'crm_existing',
    advisorName: leadResult.advisorName,
  }
}
```

**`updateInspiration(id: string, cards: any[])`**:
```typescript
async updateInspiration(id: string, cards: any[]): Promise<void> {
  await this.db.client
    .update(otaTripRequests)
    .set({ inspiration: cards, updatedAt: new Date() })
    .where(eq(otaTripRequests.id, id))
}
```

Also update the `create()` method to accept `sessionId` and make email optional:
- Change `contactEmail: dto.email` to `contactEmail: dto.email ?? null`
- Add `sessionId: dto.sessionId ?? null`

Also update `submit()` to validate email before allowing submission:
```typescript
if (!request.contactEmail) {
  throw new BadRequestException('Email is required to submit a trip request. Please provide your email first.')
}
```

- [ ] **Step 5: Inject OtaLeadsService into OtaTripRequestsService**

The `linkIdentity` method needs `OtaLeadsService`. Add to constructor:
```typescript
constructor(
  private readonly db: DatabaseService,
  private readonly leadsService: OtaLeadsService,
) {}
```

- [ ] **Step 6: Verify TypeScript**

```bash
pnpm --filter @tailfire/api exec tsc --noEmit 2>&1 | grep -v softvoyage | grep "error TS" | head -10
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/ota/dto/ apps/api/src/ota/ota-trip-requests.service.ts
git commit -m "feat: trip request service — anonymous drafts, components, share, identity, board order"
```

---

### Task 3: Inspiration Image Service

**Files:**
- Create: `apps/api/src/ota/trip-inspiration.service.ts`
- Modify: `apps/api/src/ota/ota.module.ts`

Uses existing UnsplashService for destination imagery. Falls back to enrichment cache.

- [ ] **Step 1: Create the service**

```typescript
// apps/api/src/ota/trip-inspiration.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { UnsplashService } from '../unsplash/unsplash.service'
import { OtaSearchCacheService } from './ota-search-cache.service'
import * as crypto from 'crypto'

export interface InspirationCard {
  id: string
  destination: string
  imageUrl: string
  caption: string
  source: 'unsplash' | 'enrichment'
  sourceId?: string
  attribution?: string
}

@Injectable()
export class TripInspirationService {
  private readonly logger = new Logger(TripInspirationService.name)

  constructor(
    private readonly unsplash: UnsplashService,
    private readonly cache: OtaSearchCacheService,
  ) {}

  async getInspirationCards(destination: string, count = 4): Promise<InspirationCard[]> {
    const cacheKey = `inspiration:${destination.toLowerCase()}`
    const cached = this.cache.get<InspirationCard[]>(cacheKey)
    if (cached) return cached

    try {
      const results = await this.unsplash.searchPhotos(`${destination} travel landscape`, 1, count)
      const cards: InspirationCard[] = (results?.results || []).slice(0, count).map((photo: any) => ({
        id: `insp-${crypto.randomUUID().slice(0, 8)}`,
        destination,
        imageUrl: photo.urls?.regular || photo.urls?.small || '',
        caption: photo.alt_description || photo.description || destination,
        source: 'unsplash' as const,
        sourceId: photo.id,
        attribution: photo.user?.name ? `Photo by ${photo.user.name}` : undefined,
      }))

      if (cards.length > 0) {
        this.cache.set(cacheKey, cards, 86400) // 24h cache
      }

      this.logger.log(`Fetched ${cards.length} inspiration cards for ${destination}`)
      return cards
    } catch (error: any) {
      this.logger.warn(`Failed to fetch inspiration for ${destination}: ${error.message}`)
      return []
    }
  }
}
```

- [ ] **Step 2: Register in OtaModule**

Add `TripInspirationService` to providers. Ensure `UnsplashModule` is imported (or UnsplashService is available globally).

- [ ] **Step 3: Verify**

```bash
pnpm --filter @tailfire/api exec tsc --noEmit 2>&1 | grep -v softvoyage | grep "error TS" | head -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/ota/trip-inspiration.service.ts apps/api/src/ota/ota.module.ts
git commit -m "feat: inspiration image service using Unsplash for dream board"
```

---

### Task 4: New Controller Endpoints

**Files:**
- Modify: `apps/api/src/ota/ota-trip-requests.controller.ts`

Add 9 new endpoints to the existing controller.

- [ ] **Step 1: Add all new endpoints**

```typescript
// Add to ota-trip-requests.controller.ts

// IMPORTANT: Declare this BEFORE the /:id route to avoid route collision
@Get('by-session/:sessionId')
@ApiOperation({ summary: 'Find active drafts by session ID' })
async findBySession(@Param('sessionId') sessionId: string) {
  return this.tripRequests.findBySession(sessionId)
}

@Get('shared/:token')
@ApiOperation({ summary: 'Get trip request by share token (public)' })
async findByShareToken(@Param('token') token: string) {
  const request = await this.tripRequests.findByShareToken(token)
  if (!request) throw new NotFoundException('Shared trip not found')
  // Strip sensitive fields for shared view
  const { contactPhone, contactEmail, resolvedOwnerId, resolvedAgencyId, ...safeRequest } = request as any
  return safeRequest
}

@Post(':id/components/add')
@ApiOperation({ summary: 'Add a single component to the trip request' })
async addComponent(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() body: { component: TripRequestComponentDto },
) {
  const request = await this.tripRequests.addComponent(id, body.component)
  return { requestId: request.id, componentCount: (request.components as any[]).length }
}

@Delete(':id/components/:componentId')
@ApiOperation({ summary: 'Remove a component from the trip request' })
@HttpCode(HttpStatus.OK)
async removeComponent(
  @Param('id', ParseUUIDPipe) id: string,
  @Param('componentId') componentId: string,
) {
  const request = await this.tripRequests.removeComponent(id, componentId)
  return { requestId: request.id, componentCount: (request.components as any[]).length }
}

@Patch(':id/board-order')
@ApiOperation({ summary: 'Update board display order' })
async updateBoardOrder(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateBoardOrderDto,
) {
  const request = await this.tripRequests.updateBoardOrder(id, dto.boardOrder)
  return { requestId: request.id }
}

@Post(':id/share')
@ApiOperation({ summary: 'Generate or get share token' })
async generateShareToken(@Param('id', ParseUUIDPipe) id: string) {
  const token = await this.tripRequests.generateShareToken(id)
  return { shareToken: token, shareUrl: `/my-trip/${id}?token=${token}` }
}

@Delete(':id/share')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: 'Revoke share token' })
async revokeShareToken(@Param('id', ParseUUIDPipe) id: string) {
  await this.tripRequests.revokeShareToken(id)
  return { message: 'Share token revoked' }
}

@Patch(':id/identity')
@ApiOperation({ summary: 'Link identity (CRM lookup + contact creation)' })
async linkIdentity(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: LinkIdentityDto,
) {
  return this.tripRequests.linkIdentity(id, dto)
}

@Post(':id/inspiration')
@ApiOperation({ summary: 'Fetch inspiration images for a destination' })
async fetchInspiration(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() body: { destination: string },
) {
  const cards = await this.inspirationService.getInspirationCards(body.destination)
  const request = await this.tripRequests.findById(id)
  const existing = (request.inspiration as any[]) || []
  const merged = [...existing, ...cards]
  await this.tripRequests.updateInspiration(id, merged)
  return { cards }
}
```

Add `TripInspirationService` to the controller constructor injection.

Add imports for `LinkIdentityDto`, `UpdateBoardOrderDto`, `TripRequestComponentDto`, `Delete`, `Patch`, `HttpCode`, `HttpStatus`, `ParseUUIDPipe`, `NotFoundException`.

- [ ] **Step 2: Ensure route ordering**

Move `findBySession` and `findByShareToken` ABOVE the `findById` route (`:id`) to prevent route collision. NestJS matches routes top-down.

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm --filter @tailfire/api exec tsc --noEmit 2>&1 | grep -v softvoyage | grep "error TS" | head -10
```

- [ ] **Step 4: Test endpoints**

```bash
# Create anonymous draft
curl -s -X POST http://localhost:3101/api/v1/ota/trip-requests \
  -H "Content-Type: application/json" \
  -H "x-ota-service-key: $OTA_KEY" \
  -d '{"sessionId":"test-session","components":[]}'

# Add component
curl -s -X POST http://localhost:3101/api/v1/ota/trip-requests/{id}/components/add \
  -H "Content-Type: application/json" \
  -H "x-ota-service-key: $OTA_KEY" \
  -d '{"component":{"id":"f1","type":"flight","data":{"segments":[]},"display":{"title":"Test"}}}'

# Find by session
curl -s http://localhost:3101/api/v1/ota/trip-requests/by-session/test-session \
  -H "x-ota-service-key: $OTA_KEY"

# Generate share token
curl -s -X POST http://localhost:3101/api/v1/ota/trip-requests/{id}/share \
  -H "x-ota-service-key: $OTA_KEY"

# Link identity
curl -s -X PATCH http://localhost:3101/api/v1/ota/trip-requests/{id}/identity \
  -H "Content-Type: application/json" \
  -H "x-ota-service-key: $OTA_KEY" \
  -d '{"email":"test@example.com","name":"Test"}'
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ota/ota-trip-requests.controller.ts
git commit -m "feat: 9 new trip request endpoints — session, components, share, identity, inspiration, board order"
```

---

### Task 5: Next.js API Proxy Routes

**Files:**
- Create: 11 proxy route files under `apps/ota/src/app/api/trip-requests/`

All proxy routes follow the same pattern as existing `/api/flights/*` routes: receive request from client, forward to backend via `serviceFetch`, return response.

- [ ] **Step 1: Create all proxy routes**

Each route is a thin proxy that forwards to the backend API with `serviceFetch` (which adds the `x-ota-service-key` header).

Create these files:

1. `apps/ota/src/app/api/trip-requests/route.ts` — POST create draft
2. `apps/ota/src/app/api/trip-requests/[id]/route.ts` — GET request details
3. `apps/ota/src/app/api/trip-requests/[id]/components/add/route.ts` — POST append component
4. `apps/ota/src/app/api/trip-requests/[id]/components/[cid]/route.ts` — DELETE remove component
5. `apps/ota/src/app/api/trip-requests/[id]/board-order/route.ts` — PATCH update board order
6. `apps/ota/src/app/api/trip-requests/[id]/submit/route.ts` — POST submit + promote
7. `apps/ota/src/app/api/trip-requests/[id]/share/route.ts` — POST generate / DELETE revoke
8. `apps/ota/src/app/api/trip-requests/[id]/identity/route.ts` — PATCH link identity
9. `apps/ota/src/app/api/trip-requests/[id]/inspiration/route.ts` — POST fetch inspiration
10. `apps/ota/src/app/api/trip-requests/by-session/[sid]/route.ts` — GET by session
11. `apps/ota/src/app/api/trip-requests/shared/[token]/route.ts` — GET shared view (NO auth)

Each follows this pattern:
```typescript
import { NextResponse } from "next/server";
import { serviceFetch } from "@/lib/api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const data = await serviceFetch(`/ota/trip-requests/${id}/components/add`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 502 });
  }
}
```

For the shared view (route 11), use `publicFetch` instead of `serviceFetch` since it's a public endpoint.

- [ ] **Step 2: Verify OTA TypeScript**

```bash
pnpm --filter @tailfire/ota exec tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/app/api/trip-requests/
git commit -m "feat: 11 Next.js proxy routes for trip request basket operations"
```

---

## Post-Plan Notes

**What this plan builds:**
- Anonymous draft creation (email nullable, session-tracked)
- Single-component add/remove (basket operations)
- Board ordering (interleaved components + inspiration)
- Share tokens (generate, revoke, public access)
- Identity linking (CRM lookup, contact creation)
- Inspiration image sourcing (Unsplash)
- All proxy routes for frontend consumption

**What the next plans build:**
- **Plan B:** Zustand trip basket store, "Add to Trip" button, cookie hydration
- **Plan C:** Dream board page, masonry grid, cards, drag-and-drop
- **Plan D:** AI integration (new tools, trip awareness, panel layout)
- **Plan E:** Submit flow, review screen, share UI
