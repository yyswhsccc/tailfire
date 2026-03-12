# Group Bookings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance `trip_groups` to support real group bookings with pricing rollup, cancellation cascade, notes, documents, and media.

**Architecture:** Extend existing `trip_groups` table with a `type` discriminator and booking-specific fields. Add `tripGroupId` support to notes. Create dedicated `trip_group_documents` and `trip_group_media` tables. Pricing rollup computed on-the-fly via SQL aggregation. Group cancellation delegates to existing `cancelTrip()` per member trip.

**Tech Stack:** Drizzle ORM, NestJS, Next.js (React), class-validator, TanStack Query

---

### Task 1: Database Migration — Enhance trip_groups and add supporting tables

**Files:**
- Create: `packages/database/src/migrations/20260308120000_group_bookings.sql`
- Modify: `packages/database/src/migrations/meta/_journal.json`

**Step 1: Create the migration file**

```sql
-- Group Bookings Enhancement
-- Adds type discriminator, booking-specific fields, group documents/media tables,
-- and tripGroupId support on notes.

-- 1. Enum types
DO $$ BEGIN
  CREATE TYPE trip_group_type AS ENUM ('folder', 'group_booking');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trip_group_status AS ENUM ('planning', 'confirmed', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Enhance trip_groups table
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS type trip_group_type NOT NULL DEFAULT 'folder';
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS group_number VARCHAR(100);
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS primary_supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS destination VARCHAR(500);
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE trip_groups ADD COLUMN IF NOT EXISTS status trip_group_status;

-- 3. Index on trips.trip_group_id (was missing)
CREATE INDEX IF NOT EXISTS idx_trips_trip_group_id ON trips(trip_group_id) WHERE trip_group_id IS NOT NULL;

-- 4. Partial unique for group bookings: no duplicate group_number per agency
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_groups_agency_group_number
  ON trip_groups(agency_id, group_number)
  WHERE type = 'group_booking' AND group_number IS NOT NULL;

-- 5. Add tripGroupId to notes
ALTER TABLE notes ADD COLUMN IF NOT EXISTS trip_group_id UUID REFERENCES trip_groups(id) ON DELETE CASCADE;

-- Update check constraint: exactly one of tripId, contactId, tripGroupId
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_entity_check;
ALTER TABLE notes ADD CONSTRAINT notes_entity_check CHECK (
  (CASE WHEN trip_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN trip_group_id IS NOT NULL THEN 1 ELSE 0 END) = 1
);

CREATE INDEX IF NOT EXISTS idx_notes_trip_group_pinned_created
  ON notes(trip_group_id, is_pinned, created_at)
  WHERE trip_group_id IS NOT NULL;

-- 6. trip_group_documents table
CREATE TABLE IF NOT EXISTS trip_group_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_group_id UUID NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  document_type VARCHAR(100),
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID
);
CREATE INDEX IF NOT EXISTS idx_trip_group_documents_group ON trip_group_documents(trip_group_id);

-- 7. trip_group_media table
CREATE TABLE IF NOT EXISTS trip_group_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_group_id UUID NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  media_type VARCHAR(50) NOT NULL DEFAULT 'image',
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER,
  caption TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID
);
CREATE INDEX IF NOT EXISTS idx_trip_group_media_group ON trip_group_media(trip_group_id);
```

**Step 2: Register in journal**

Add to `packages/database/src/migrations/meta/_journal.json` after the last entry (idx 147):

```json
{
  "idx": 148,
  "version": "7",
  "when": 1773028800000,
  "tag": "20260308120000_group_bookings",
  "breakpoints": true
}
```

**Step 3: Run migration locally**

Run: `cd apps/api && pnpm db:migrate`
Expected: Migration applies successfully, no errors.

**Step 4: Commit**

```bash
git add packages/database/src/migrations/20260308120000_group_bookings.sql packages/database/src/migrations/meta/_journal.json
git commit -m "feat: add group bookings migration (trip_groups enhancement, documents, media, notes)"
```

---

### Task 2: Drizzle Schema — Update trip_groups, notes, and add new tables

**Files:**
- Modify: `packages/database/src/schema/trips.schema.ts` (tripGroups table + relations)
- Modify: `packages/database/src/schema/notes.schema.ts` (add tripGroupId + update check)
- Create: `packages/database/src/schema/trip-group-documents.schema.ts`
- Create: `packages/database/src/schema/trip-group-media.schema.ts`
- Modify: `packages/database/src/schema/index.ts` (export new schemas)

**Step 1: Update tripGroups table in `trips.schema.ts`**

Add imports at top:
```typescript
import { pgEnum } from 'drizzle-orm/pg-core'
```

Add enums before the `tripGroups` table definition (before line ~197):
```typescript
export const tripGroupTypeEnum = pgEnum('trip_group_type', ['folder', 'group_booking'])
export const tripGroupStatusEnum = pgEnum('trip_group_status', ['planning', 'confirmed', 'completed', 'cancelled'])
```

Add new columns to the `tripGroups` table (after `createdBy`):
```typescript
type: tripGroupTypeEnum('type').notNull().default('folder'),
groupNumber: varchar('group_number', { length: 100 }),
primarySupplierId: uuid('primary_supplier_id').references(() => suppliers.id),
destination: varchar('destination', { length: 500 }),
startDate: date('start_date', { mode: 'string' }),
endDate: date('end_date', { mode: 'string' }),
status: tripGroupStatusEnum('status'),
```

Update `tripGroupsRelations` to add supplier relation:
```typescript
export const tripGroupsRelations = relations(tripGroups, ({ many, one }) => ({
  trips: many(trips),
  primarySupplier: one(suppliers, {
    fields: [tripGroups.primarySupplierId],
    references: [suppliers.id],
  }),
}))
```

**Step 2: Update notes schema in `notes.schema.ts`**

Add import:
```typescript
import { tripGroups } from './trips.schema'
```

Add column to notes table (after `contactId`):
```typescript
tripGroupId: uuid('trip_group_id').references(() => tripGroups.id, { onDelete: 'cascade' }),
```

Update check constraint:
```typescript
check(
  'notes_entity_check',
  sql`(CASE WHEN trip_id IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN trip_group_id IS NOT NULL THEN 1 ELSE 0 END) = 1`
),
```

Add index for tripGroupId:
```typescript
index('idx_notes_trip_group_pinned_created')
  .on(table.tripGroupId, table.isPinned, table.createdAt)
  .where(sql`${table.tripGroupId} IS NOT NULL`),
```

Add relation:
```typescript
tripGroup: one(tripGroups, {
  fields: [notes.tripGroupId],
  references: [tripGroups.id],
}),
```

**Step 3: Create `trip-group-documents.schema.ts`**

```typescript
import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tripGroups } from './trips.schema'

export const tripGroupDocuments = pgTable(
  'trip_group_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripGroupId: uuid('trip_group_id')
      .notNull()
      .references(() => tripGroups.id, { onDelete: 'cascade' }),
    documentType: varchar('document_type', { length: 100 }),
    fileUrl: text('file_url').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileSize: integer('file_size'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: uuid('uploaded_by'),
  },
  (table) => [
    index('idx_trip_group_documents_group').on(table.tripGroupId),
  ]
)

export const tripGroupDocumentsRelations = relations(tripGroupDocuments, ({ one }) => ({
  tripGroup: one(tripGroups, {
    fields: [tripGroupDocuments.tripGroupId],
    references: [tripGroups.id],
  }),
}))

export type TripGroupDocument = typeof tripGroupDocuments.$inferSelect
export type NewTripGroupDocument = typeof tripGroupDocuments.$inferInsert
```

**Step 4: Create `trip-group-media.schema.ts`**

```typescript
import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tripGroups } from './trips.schema'
import { mediaTypeEnum } from './activity-media.schema'

export const tripGroupMedia = pgTable(
  'trip_group_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripGroupId: uuid('trip_group_id')
      .notNull()
      .references(() => tripGroups.id, { onDelete: 'cascade' }),
    mediaType: mediaTypeEnum('media_type').notNull(),
    fileUrl: text('file_url').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileSize: integer('file_size'),
    caption: text('caption'),
    orderIndex: integer('order_index').notNull().default(0),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: uuid('uploaded_by'),
  },
  (table) => [
    index('idx_trip_group_media_group').on(table.tripGroupId),
  ]
)

export const tripGroupMediaRelations = relations(tripGroupMedia, ({ one }) => ({
  tripGroup: one(tripGroups, {
    fields: [tripGroupMedia.tripGroupId],
    references: [tripGroups.id],
  }),
}))

export type TripGroupMedia = typeof tripGroupMedia.$inferSelect
export type NewTripGroupMedia = typeof tripGroupMedia.$inferInsert
```

**Step 5: Export from `packages/database/src/schema/index.ts`**

Add lines:
```typescript
export * from './trip-group-documents.schema'
export * from './trip-group-media.schema'
```

**Step 6: Verify build**

Run: `cd packages/database && pnpm build` (or `pnpm typecheck` from root)
Expected: No type errors.

**Step 7: Commit**

```bash
git add packages/database/src/schema/
git commit -m "feat: update Drizzle schemas for group bookings (trip_groups, notes, documents, media)"
```

---

### Task 3: Shared Types — Update TripGroupDto and Notes types

**Files:**
- Modify: `packages/shared-types/src/api/trips.types.ts`
- Modify: `packages/shared-types/src/api/notes.types.ts`

**Step 1: Update TripGroupDto in `trips.types.ts`**

Replace the existing `TripGroupDto` (line ~567) with:
```typescript
export type TripGroupType = 'folder' | 'group_booking'
export type TripGroupStatus = 'planning' | 'confirmed' | 'completed' | 'cancelled'

export interface TripGroupDto {
  id: string
  agencyId: string
  name: string
  description: string | null
  type: TripGroupType
  groupNumber: string | null
  primarySupplierId: string | null
  destination: string | null
  startDate: string | null
  endDate: string | null
  status: TripGroupStatus | null
  tripCount?: number
  createdAt: string
  updatedAt: string
}

export interface UpdateTripGroupApiDto {
  name?: string
  description?: string
  type?: TripGroupType
  groupNumber?: string
  primarySupplierId?: string | null
  destination?: string
  startDate?: string | null
  endDate?: string | null
  status?: TripGroupStatus
}

export interface TripGroupTripDto {
  id: string
  name: string
  status: string
  startDate: string | null
}

export interface TripGroupSummaryDto {
  groupId: string
  totalPackagePriceCents: number
  totalCommissionProjectedCents: number
  totalCommissionReceivedCents: number
  totalBalanceCents: number
  currency: string
  tripSummaries: TripGroupTripSummaryDto[]
}

export interface TripGroupTripSummaryDto {
  tripId: string
  tripName: string
  status: string
  packagePriceCents: number
  commissionProjectedCents: number
  commissionReceivedCents: number
  balanceCents: number
  paymentStatus: 'paid' | 'partial' | 'outstanding' | 'none'
}

export interface TripGroupDocumentDto {
  id: string
  tripGroupId: string
  documentType: string | null
  fileUrl: string
  fileName: string
  fileSize: number | null
  uploadedAt: string
}

export interface TripGroupMediaDto {
  id: string
  tripGroupId: string
  mediaType: string
  fileUrl: string
  fileName: string
  fileSize: number | null
  caption: string | null
  orderIndex: number
  uploadedAt: string
}
```

**Step 2: Update notes types in `notes.types.ts`**

Add `tripGroupId` to `CreateNoteDto`, `NoteFilterDto`, and `NoteResponseDto`:

```typescript
export interface CreateNoteDto {
  content: string
  tripId?: string
  contactId?: string
  tripGroupId?: string
  isPinned?: boolean
}

export interface NoteFilterDto extends BaseFilterDto {
  tripId?: string
  contactId?: string
  tripGroupId?: string
}

export interface NoteResponseDto {
  id: string
  agencyId: string
  content: string
  tripId?: string
  contactId?: string
  tripGroupId?: string
  isPinned: boolean
  createdBy: string
  createdByUser: NoteUserDto
  updatedBy?: string
  updatedByUser?: NoteUserDto
  createdAt: string
  updatedAt: string
}
```

**Step 3: Commit**

```bash
git add packages/shared-types/src/api/trips.types.ts packages/shared-types/src/api/notes.types.ts
git commit -m "feat: update shared types for group bookings and notes tripGroupId"
```

---

### Task 4: API — Enhanced trip group service methods

**Files:**
- Modify: `apps/api/src/trips/trips.service.ts` (update group CRUD, add summary, add status/cascade, add/remove trips)
- Modify: `apps/api/src/trips/trips.controller.ts` (new endpoints)
- Modify: `apps/api/src/activity-logs/audit-sanitizer.ts` (whitelist new fields)

**Step 1: Update `listTripGroups` to include new fields**

In `trips.service.ts`, update the select in `listTripGroups()` (line ~3467) to include `type`, `groupNumber`, `primarySupplierId`, `destination`, `startDate`, `endDate`, `status`. Accept optional `type` filter parameter.

```typescript
async listTripGroups(agencyId: string, type?: string) {
  const conditions = [eq(this.db.schema.tripGroups.agencyId, agencyId)]
  if (type) {
    conditions.push(eq(this.db.schema.tripGroups.type, type as any))
  }

  const groups = await this.db.client
    .select({
      id: this.db.schema.tripGroups.id,
      agencyId: this.db.schema.tripGroups.agencyId,
      name: this.db.schema.tripGroups.name,
      description: this.db.schema.tripGroups.description,
      type: this.db.schema.tripGroups.type,
      groupNumber: this.db.schema.tripGroups.groupNumber,
      primarySupplierId: this.db.schema.tripGroups.primarySupplierId,
      destination: this.db.schema.tripGroups.destination,
      startDate: this.db.schema.tripGroups.startDate,
      endDate: this.db.schema.tripGroups.endDate,
      status: this.db.schema.tripGroups.status,
      createdAt: this.db.schema.tripGroups.createdAt,
      updatedAt: this.db.schema.tripGroups.updatedAt,
      tripCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${this.db.schema.trips}
        WHERE ${this.db.schema.trips.tripGroupId} = ${this.db.schema.tripGroups.id}
      )`,
    })
    .from(this.db.schema.tripGroups)
    .where(and(...conditions))

  return groups
}
```

**Step 2: Update `createTripGroup` to accept full dto**

```typescript
async createTripGroup(
  data: { name: string; type?: string; groupNumber?: string; primarySupplierId?: string; destination?: string; startDate?: string; endDate?: string; status?: string },
  agencyId: string,
  actorId: string,
) {
  const [group] = await this.db.client
    .insert(this.db.schema.tripGroups)
    .values({
      name: data.name,
      agencyId,
      createdBy: actorId,
      type: (data.type as any) || 'folder',
      groupNumber: data.groupNumber,
      primarySupplierId: data.primarySupplierId,
      destination: data.destination,
      startDate: data.startDate,
      endDate: data.endDate,
      status: (data.status as any) || (data.type === 'group_booking' ? 'planning' : undefined),
    })
    .returning()

  return group
}
```

**Step 3: Update `updateTripGroup` to accept new fields**

Update `data` parameter type to include `groupNumber`, `primarySupplierId`, `destination`, `startDate`, `endDate`, `status`, `type`.

**Step 4: Add `getGroupSummary` method**

New method that computes pricing rollup across all trips in a group using SQL aggregation:

```typescript
async getGroupSummary(groupId: string, agencyId: string): Promise<TripGroupSummaryDto> {
  // Verify group exists and belongs to agency
  const [group] = await this.db.client
    .select()
    .from(this.db.schema.tripGroups)
    .where(and(
      eq(this.db.schema.tripGroups.id, groupId),
      eq(this.db.schema.tripGroups.agencyId, agencyId),
    ))
    .limit(1)

  if (!group) throw new NotFoundException(`Trip group ${groupId} not found`)

  // Get per-trip financial summaries using existing financial summary patterns
  const trips = await this.db.client
    .select({
      id: this.db.schema.trips.id,
      name: this.db.schema.trips.name,
      status: this.db.schema.trips.status,
    })
    .from(this.db.schema.trips)
    .where(and(
      eq(this.db.schema.trips.tripGroupId, groupId),
      eq(this.db.schema.trips.agencyId, agencyId),
    ))

  // Aggregate pricing across all trips in one query
  const pricingRows = await this.db.client.execute(sql`
    SELECT
      t.id as trip_id,
      t.name as trip_name,
      t.status,
      COALESCE(SUM(ap.total_price_cents), 0)::int as package_price_cents,
      COALESCE(SUM(ap.commission_amount_cents), 0)::int as commission_projected_cents,
      COALESCE(SUM(ap.commission_received_cents), 0)::int as commission_received_cents
    FROM trips t
    LEFT JOIN itineraries i ON i.trip_id = t.id
    LEFT JOIN itinerary_days id ON id.itinerary_id = i.id
    LEFT JOIN itinerary_activities ia ON ia.itinerary_day_id = id.id
    LEFT JOIN activity_pricing ap ON ap.activity_id = ia.id
    WHERE t.trip_group_id = ${groupId}
      AND t.agency_id = ${agencyId}
    GROUP BY t.id, t.name, t.status
  `)

  // Build response (implementation details omitted — map rows to TripGroupSummaryDto)
  // ...
}
```

**Step 5: Add `cancelGroupTrips` method**

```typescript
async cancelGroupTrips(
  groupId: string,
  reason: string,
  agencyId: string,
  actorId: string,
): Promise<{ cancelled: string[]; skipped: { tripId: string; reason: string }[] }> {
  // Verify group
  const [group] = await this.db.client.select().from(this.db.schema.tripGroups)
    .where(and(eq(this.db.schema.tripGroups.id, groupId), eq(this.db.schema.tripGroups.agencyId, agencyId)))
    .limit(1)
  if (!group) throw new NotFoundException(`Trip group ${groupId} not found`)

  // Get all non-terminal trips in group
  const trips = await this.db.client.select()
    .from(this.db.schema.trips)
    .where(and(eq(this.db.schema.trips.tripGroupId, groupId), eq(this.db.schema.trips.agencyId, agencyId)))

  const cancelled: string[] = []
  const skipped: { tripId: string; reason: string }[] = []

  for (const trip of trips) {
    if (!canTransitionTripStatus(trip.status as TripStatus, 'cancelled')) {
      skipped.push({ tripId: trip.id, reason: getTransitionErrorMessage(trip.status as TripStatus, 'cancelled') })
      continue
    }
    try {
      await this.cancelTrip(trip.id, { reason: `Group cancellation: ${reason}` }, actorId)
      cancelled.push(trip.id)
    } catch (e) {
      skipped.push({ tripId: trip.id, reason: (e as Error).message })
    }
  }

  // Update group status to cancelled
  await this.db.client.update(this.db.schema.tripGroups)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(this.db.schema.tripGroups.id, groupId))

  this.eventEmitter.emit('audit.updated',
    new AuditEvent('trip_group', group.id, 'updated', group.id, actorId, group.name))

  return { cancelled, skipped }
}
```

**Step 6: Add `addTripsToGroup` and `removeTripFromGroup` methods**

```typescript
async addTripsToGroup(groupId: string, tripIds: string[], agencyId: string, actorId: string) {
  const [group] = await this.db.client.select().from(this.db.schema.tripGroups)
    .where(and(eq(this.db.schema.tripGroups.id, groupId), eq(this.db.schema.tripGroups.agencyId, agencyId)))
    .limit(1)
  if (!group) throw new NotFoundException(`Trip group ${groupId} not found`)

  for (const tripId of tripIds) {
    await this.db.client.update(this.db.schema.trips)
      .set({ tripGroupId: groupId, updatedAt: new Date() })
      .where(and(eq(this.db.schema.trips.id, tripId), eq(this.db.schema.trips.agencyId, agencyId)))

    this.eventEmitter.emit('audit.status_changed',
      new AuditEvent('trip', tripId, 'moved_to_group', tripId, actorId, group.name))
  }
}

async removeTripFromGroup(groupId: string, tripId: string, agencyId: string, actorId: string) {
  const [group] = await this.db.client.select().from(this.db.schema.tripGroups)
    .where(and(eq(this.db.schema.tripGroups.id, groupId), eq(this.db.schema.tripGroups.agencyId, agencyId)))
    .limit(1)
  if (!group) throw new NotFoundException(`Trip group ${groupId} not found`)

  await this.db.client.update(this.db.schema.trips)
    .set({ tripGroupId: null, updatedAt: new Date() })
    .where(and(eq(this.db.schema.trips.id, tripId), eq(this.db.schema.trips.tripGroupId, groupId)))

  this.eventEmitter.emit('audit.status_changed',
    new AuditEvent('trip', tripId, 'removed_from_group', tripId, actorId, group.name))
}
```

**Step 7: Update controller with new endpoints**

In `trips.controller.ts`, add after the existing group endpoints:

```typescript
@Get('groups/:groupId/summary')
async getGroupSummary(
  @GetAuthContext() auth: AuthContext,
  @Param('groupId') groupId: string,
) {
  return this.tripsService.getGroupSummary(groupId, auth.agencyId)
}

@Patch('groups/:groupId/status')
async updateGroupStatus(
  @GetAuthContext() auth: AuthContext,
  @Param('groupId') groupId: string,
  @Body() body: { status: string; reason?: string },
) {
  if (body.status === 'cancelled') {
    return this.tripsService.cancelGroupTrips(groupId, body.reason || '', auth.agencyId, auth.userId)
  }
  return this.tripsService.updateTripGroup(groupId, { status: body.status }, auth.agencyId, auth.userId)
}

@Post('groups/:groupId/trips')
async addTripsToGroup(
  @GetAuthContext() auth: AuthContext,
  @Param('groupId') groupId: string,
  @Body() body: { tripIds: string[] },
) {
  return this.tripsService.addTripsToGroup(groupId, body.tripIds, auth.agencyId, auth.userId)
}

@Delete('groups/:groupId/trips/:tripId')
@HttpCode(HttpStatus.NO_CONTENT)
async removeTripFromGroup(
  @GetAuthContext() auth: AuthContext,
  @Param('groupId') groupId: string,
  @Param('tripId') tripId: string,
) {
  return this.tripsService.removeTripFromGroup(groupId, tripId, auth.agencyId, auth.userId)
}
```

Also update existing `listTripGroups` to accept `@Query('type') type?: string` and `createTripGroup` to accept the full body.

**Step 8: Update audit sanitizer**

In `audit-sanitizer.ts`, update `trip_group` entry (line 64):
```typescript
trip_group: ['name', 'description', 'type', 'groupNumber', 'destination', 'startDate', 'endDate', 'status'],
```

**Step 9: Verify build**

Run: `pnpm typecheck` from root
Expected: No type errors.

**Step 10: Commit**

```bash
git add apps/api/src/trips/ apps/api/src/activity-logs/audit-sanitizer.ts
git commit -m "feat: add group booking API endpoints (summary, cancellation cascade, add/remove trips)"
```

---

### Task 5: API — Notes tripGroupId support

**Files:**
- Modify: `apps/api/src/notes/dto/create-note.dto.ts`
- Modify: `apps/api/src/notes/notes.service.ts`

**Step 1: Update CreateNoteDto**

Add `tripGroupId` field:
```typescript
@IsOptional()
@IsUUID()
@ValidateIf((o) => !o.tripId && !o.contactId)
tripGroupId?: string
```

Update the existing `@ValidateIf` decorators:
- `tripId`: `@ValidateIf((o) => !o.contactId && !o.tripGroupId)`
- `contactId`: `@ValidateIf((o) => !o.tripId && !o.tripGroupId)`

**Step 2: Update notes service validation**

In `create()` method (line 34-43 of `notes.service.ts`), replace with:
```typescript
const entityCount = [dto.tripId, dto.contactId, dto.tripGroupId].filter(Boolean).length
if (entityCount === 0) {
  throw new BadRequestException('One of tripId, contactId, or tripGroupId must be provided')
}
if (entityCount > 1) {
  throw new BadRequestException('Only one of tripId, contactId, or tripGroupId can be provided')
}
```

Add `tripGroupId` to the insert values (line ~50):
```typescript
tripGroupId: dto.tripGroupId,
```

**Step 3: Update `mapToResponse` to include `tripGroupId`**

In `mapToResponse()`, add:
```typescript
tripGroupId: note.tripGroupId ?? undefined,
```

**Step 4: Update `findAll` filters**

Add filter condition for `tripGroupId`:
```typescript
if (filters.tripGroupId) {
  conditions.push(eq(this.db.schema.notes.tripGroupId, filters.tripGroupId))
}
```

**Step 5: Commit**

```bash
git add apps/api/src/notes/
git commit -m "feat: add tripGroupId support to notes (DTO, service, filters)"
```

---

### Task 6: API — Group documents and media endpoints

**Files:**
- Create: `apps/api/src/trips/trip-group-storage.controller.ts` (or add to trips.controller.ts)
- Modify: `apps/api/src/trips/trips.service.ts` (add document/media CRUD methods)
- Modify: `apps/api/src/trips/trips.module.ts` (register controller if separate)

**Step 1: Add document CRUD methods to trips.service.ts**

```typescript
async listGroupDocuments(groupId: string, agencyId: string) {
  // Verify group belongs to agency, then select from trip_group_documents
}

async uploadGroupDocument(groupId: string, fileUrl: string, fileName: string, fileSize: number, agencyId: string, actorId: string) {
  // Insert into trip_group_documents, emit audit event
}

async deleteGroupDocument(groupId: string, documentId: string, agencyId: string, actorId: string) {
  // Delete from trip_group_documents, delete from storage, emit audit event
}
```

**Step 2: Add media CRUD methods to trips.service.ts**

```typescript
async listGroupMedia(groupId: string, agencyId: string) { /* ... */ }
async uploadGroupMedia(groupId: string, fileUrl: string, fileName: string, fileSize: number, agencyId: string, actorId: string) { /* ... */ }
async deleteGroupMedia(groupId: string, mediaId: string, agencyId: string, actorId: string) { /* ... */ }
```

**Step 3: Add controller endpoints**

Following the same pattern as trip-media.controller.ts, add endpoints to trips.controller.ts:

```typescript
// GET /trips/groups/:groupId/documents
// POST /trips/groups/:groupId/documents (FileInterceptor)
// DELETE /trips/groups/:groupId/documents/:documentId

// GET /trips/groups/:groupId/media
// POST /trips/groups/:groupId/media (FileInterceptor)
// DELETE /trips/groups/:groupId/media/:mediaId
```

**Step 4: Commit**

```bash
git add apps/api/src/trips/
git commit -m "feat: add group documents and media endpoints"
```

---

### Task 7: Admin UI — Trip group hooks and API integration

**Files:**
- Modify: `apps/admin/src/hooks/use-trips.ts` (update hooks, add new hooks)

**Step 1: Update existing hooks**

Update `useTripGroups()` return type to `TripGroupDto[]` (with new fields).
Update `useCreateTripGroup()` to accept full `CreateTripGroupApiDto`.
Update `useUpdateTripGroup()` to accept `UpdateTripGroupApiDto`.

**Step 2: Add new hooks**

```typescript
export function useGroupSummary(groupId: string | null) {
  return useQuery({
    queryKey: [...tripGroupKeys.all, 'summary', groupId],
    queryFn: () => api.get<TripGroupSummaryDto>(`/trips/groups/${groupId}/summary`),
    enabled: !!groupId,
  })
}

export function useUpdateGroupStatus() {
  return useMutation({
    mutationFn: ({ groupId, status, reason }: { groupId: string; status: string; reason?: string }) =>
      api.patch(`/trips/groups/${groupId}/status`, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

export function useAddTripsToGroup() {
  return useMutation({
    mutationFn: ({ groupId, tripIds }: { groupId: string; tripIds: string[] }) =>
      api.post(`/trips/groups/${groupId}/trips`, { tripIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

export function useRemoveTripFromGroup() {
  return useMutation({
    mutationFn: ({ groupId, tripId }: { groupId: string; tripId: string }) =>
      api.delete(`/trips/groups/${groupId}/trips/${tripId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripGroupKeys.all })
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() })
    },
  })
}

export function useGroupDocuments(groupId: string | null) { /* GET */ }
export function useUploadGroupDocument() { /* POST with FormData */ }
export function useDeleteGroupDocument() { /* DELETE */ }
export function useGroupMedia(groupId: string | null) { /* GET */ }
export function useUploadGroupMedia() { /* POST with FormData */ }
export function useDeleteGroupMedia() { /* DELETE */ }
```

**Step 3: Commit**

```bash
git add apps/admin/src/hooks/use-trips.ts
git commit -m "feat: add admin hooks for group booking summary, status, documents, media"
```

---

### Task 8: Admin UI — Group Booking Detail Page

**Files:**
- Create: `apps/admin/src/app/trips/groups/[groupId]/page.tsx`
- Create: `apps/admin/src/components/trips/GroupBookingDetail.tsx` (or inline)
- Modify: `apps/admin/src/components/trips/MoveToGroupDialog.tsx` (link to group detail)

**Step 1: Create the group detail page**

Route: `/trips/groups/[groupId]`

Page sections:
1. **Header**: Group name (editable inline), status badge, group number, supplier link, destination, dates
2. **Pricing rollup card**: Uses `useGroupSummary()` hook — total package, commission projected/received, balance
3. **Family cards**: Uses `useTripsByGroup()` — each trip as a card with name, price, payment status, trip status. Click navigates to `/trips/${tripId}`. "Remove from group" button per card. "Add trip" button.
4. **Tabs**: Notes (reuse existing `NotesList` component with `tripGroupId` filter), Documents (upload/list/delete), Media (upload/list/delete)

**Step 2: Add group cancellation dialog**

When status dropdown changes to "cancelled", show confirmation dialog:
- "This will cancel X trips in this group. Trips that cannot be cancelled will be skipped."
- Text input for cancellation reason
- Confirm/Cancel buttons
- On confirm, call `useUpdateGroupStatus({ groupId, status: 'cancelled', reason })`
- Show results (cancelled count, skipped count with reasons)

**Step 3: Add link from MoveToGroupDialog**

In `MoveToGroupDialog.tsx`, when a group is of type `group_booking`, show a link icon that navigates to `/trips/groups/${groupId}`.

**Step 4: Add navigation from trips list**

In the trips filter panel, when a group filter is active and the group is type `group_booking`, show a "View Group" link.

**Step 5: Commit**

```bash
git add apps/admin/src/app/trips/groups/ apps/admin/src/components/trips/
git commit -m "feat: add Group Booking detail page with pricing rollup, family cards, notes, documents"
```

---

### Task 9: Verify end-to-end locally

**Step 1: Start dev server**

Run: `turbo dev` (should already be running in pane 2)

**Step 2: Run migration**

Run: `cd apps/api && pnpm db:migrate`

**Step 3: Create a group booking via API**

```bash
curl -X POST http://localhost:3101/api/v1/trips/groups \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Group Booking","type":"group_booking","destination":"Mexico","status":"planning"}'
```

**Step 4: Add trips to group, get summary, test cancellation**

Test each endpoint manually or via the admin UI.

**Step 5: Verify group detail page renders**

Navigate to `http://localhost:3100/trips/groups/{groupId}` and verify all sections load.

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration issues from end-to-end testing"
```
