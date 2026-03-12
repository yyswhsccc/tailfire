# Group Bookings Design

## Context

TES (TraveleSolutions) has a "GROUP / NO CONTRACT" trip type where one umbrella trip contains multiple reservations — each reservation is an independent family/couple with their own bookings, travelers, and payments. All reservations typically share a destination, primary supplier, and travel dates, but individual trips may have unique add-ons (transfers, excursions, insurance).

Two GROUP trips exist in the TES dataset:
- **New Years Family and Friends** (#3123644): 7 reservations, $51,597
- **Max and Chelsea Wedding** (#3348744): 11 reservations, $49,761

Tailfire currently has `trip_groups` as a simple organizational folder. This design enhances it to support real group bookings.

## Data Model

### Enhanced `trip_groups` table

New fields added to existing table:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `type` | enum: `folder`, `group_booking` | `folder` | Distinguish org folders from group bookings |
| `group_number` | varchar(100) | null | Master booking number (e.g., "146543505") |
| `primary_supplier_id` | UUID FK → suppliers | null | Shared tour operator |
| `destination` | varchar(500) | null | Shared destination |
| `start_date` | date | null | Group travel start |
| `end_date` | date | null | Group travel end |
| `status` | enum: `planning`, `confirmed`, `completed`, `cancelled` | null | Group-level status (null for folders) |

Existing `folder` type groups continue working exactly as today. New fields are nullable and only relevant for `group_booking` type. Status is nullable — `null` for folders, set for group_bookings.

### New `trip_group_documents` table

| Field | Type | Purpose |
|---|---|---|
| `id` | UUID PK | |
| `trip_group_id` | UUID FK → trip_groups | Parent group |
| `file_name` | varchar(500) | Original file name |
| `file_path` | varchar(1000) | Storage path |
| `file_size` | integer | Size in bytes |
| `mime_type` | varchar(100) | MIME type |
| `uploaded_by` | UUID FK → users | Uploader |
| `created_at` | timestamptz | Upload time |

### New `trip_group_media` table

| Field | Type | Purpose |
|---|---|---|
| `id` | UUID PK | |
| `trip_group_id` | UUID FK → trip_groups | Parent group |
| `url` | varchar(1000) | Public URL |
| `file_name` | varchar(500) | Original file name |
| `file_path` | varchar(1000) | Storage path |
| `file_size` | integer | Size in bytes |
| `mime_type` | varchar(100) | MIME type |
| `uploaded_by` | UUID FK → users | Uploader |
| `created_at` | timestamptz | Upload time |

### Notes: Add `trip_group_id` support

Add `trip_group_id` (nullable UUID FK → trip_groups) to `notes` table. Update the existing check constraint `notes_entity_check` to allow exactly one of: `tripId`, `contactId`, or `tripGroupId`.

### Indexes and Constraints

- **Index** on `trips.trip_group_id` (currently missing)
- **Partial unique** on `(agency_id, group_number) WHERE type = 'group_booking'` — prevents duplicate group numbers within an agency
- **Index** on `trip_groups.type` for filtered queries
- **Index** on `trip_group_documents.trip_group_id`
- **Index** on `trip_group_media.trip_group_id`

### Relationships

- `trip_groups.primary_supplier_id` → `suppliers.id` (nullable FK)
- `trips.trip_group_id` → `trip_groups.id` (existing FK, unchanged)
- `notes.trip_group_id` → `trip_groups.id` (new nullable FK)
- `trip_group_documents.trip_group_id` → `trip_groups.id`
- `trip_group_media.trip_group_id` → `trip_groups.id`

## Features

### 1. Group Booking Detail Page (`/trips/groups/:id`)

**Header section:**
- Group name, status badge
- Master booking number, primary supplier link
- Destination, travel dates
- Edit inline

**Pricing rollup card (computed on-the-fly):**
- Total package price (sum across all trips)
- Total commission projected
- Total commission received
- Total balance outstanding

**Family cards (trip list):**
- Each trip displayed as a card
- Shows: family name, package price, payment status (paid/partial/outstanding), trip status
- Click to navigate to individual trip
- "Remove from group" action per card
- "Add trip to group" button to pull existing trips in

**Traveler roster tab:**
- Consolidated list of all travelers across all trips
- Shows which trip/family each traveler belongs to

**Notes tab:**
- Notes linked via `trip_group_id`
- Standard notes CRUD

**Documents tab:**
- Contract uploads via `trip_group_documents`
- Media files via `trip_group_media`

### 2. Group Cancellation Cascade

When a group_booking status is set to `cancelled`:
- Calls existing `cancelTrip()` service method for each member trip (preserves automation cancellation, audit events, transition validation)
- Trips that cannot be cancelled (e.g., already completed) are skipped and reported in the response
- Each trip cancellation is logged as an audit event
- The group cancellation itself is logged
- Confirmation dialog shows count of affected trips before proceeding
- Response includes list of successfully cancelled trips and any skipped trips with reasons

### 3. Pull/Push Trips

**Pull (add to group):**
- From group detail page, search/browse existing trips
- Assign trip to group (sets `trip_group_id`)
- Logged as audit event

**Push (remove from group):**
- From group detail page, remove a trip
- Sets `trip_group_id = null`
- Trip continues to exist independently
- Logged as audit event

### 4. TES Extraction Fix

For trips where `GroupNumber` is set and `ReservationCount > 0`:
- Generate deterministic reservation keys: `{TripID}-R{reservationIndex}` (e.g., `3123644-R1`, `3123644-R2`)
- Propagate reservation key across all extracted artifacts (trips, bookings, payments, commission) so ledger mappings remain consistent
- Create each reservation as an independent trip with full bookings, travelers, activities
- Create a `trip_group` of type `group_booking` with shared metadata (group number, destination, dates, primary supplier)
- Link all reservation-trips via `trip_group_id`

## API Endpoints

### New endpoints:
| Method | Path | Purpose |
|---|---|---|
| GET | `/trips/groups/:id/summary` | Pricing rollup, traveler count, payment status per trip |
| PATCH | `/trips/groups/:id/status` | Update group status (with cascade for cancellation) |
| POST | `/trips/groups/:id/trips` | Add existing trip(s) to group |
| DELETE | `/trips/groups/:id/trips/:tripId` | Remove trip from group |

### Enhanced endpoints:
| Method | Path | Change |
|---|---|---|
| POST | `/trips/groups` | Accept new fields: type, group_number, supplier, dates, status |
| PATCH | `/trips/groups/:id` | Accept new fields |
| GET | `/trips/groups` | Return type field, filter by type |
| GET | `/trips/groups/:id/trips` | Return enriched data: pricing, payment status per trip |

### Patterns to follow:
- Keep `/trips/groups` namespace (already present in controller)
- Update shared types (`TripGroupDto`) and admin hooks/UI contracts
- Update audit sanitizer for new trip_group fields

## Migration

```sql
-- Add group_booking enum types
CREATE TYPE trip_group_type AS ENUM ('folder', 'group_booking');
CREATE TYPE trip_group_status AS ENUM ('planning', 'confirmed', 'completed', 'cancelled');

-- Add new columns to trip_groups
ALTER TABLE trip_groups ADD COLUMN type trip_group_type NOT NULL DEFAULT 'folder';
ALTER TABLE trip_groups ADD COLUMN group_number VARCHAR(100);
ALTER TABLE trip_groups ADD COLUMN primary_supplier_id UUID REFERENCES suppliers(id);
ALTER TABLE trip_groups ADD COLUMN destination VARCHAR(500);
ALTER TABLE trip_groups ADD COLUMN start_date DATE;
ALTER TABLE trip_groups ADD COLUMN end_date DATE;
ALTER TABLE trip_groups ADD COLUMN status trip_group_status;  -- nullable, null for folders

-- Add index on trips.trip_group_id (currently missing)
CREATE INDEX idx_trips_trip_group_id ON trips(trip_group_id) WHERE trip_group_id IS NOT NULL;

-- Partial unique constraint for group bookings
CREATE UNIQUE INDEX idx_trip_groups_agency_group_number
  ON trip_groups(agency_id, group_number)
  WHERE type = 'group_booking' AND group_number IS NOT NULL;

-- Add trip_group_id to notes
ALTER TABLE notes ADD COLUMN trip_group_id UUID REFERENCES trip_groups(id) ON DELETE CASCADE;
-- Update check constraint: exactly one of tripId, contactId, tripGroupId
ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_entity_check;
ALTER TABLE notes ADD CONSTRAINT notes_entity_check CHECK (
  (CASE WHEN trip_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN trip_group_id IS NOT NULL THEN 1 ELSE 0 END) = 1
);

-- trip_group_documents table
CREATE TABLE trip_group_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_group_id UUID NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_group_documents_group ON trip_group_documents(trip_group_id);

-- trip_group_media table
CREATE TABLE trip_group_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_group_id UUID NOT NULL REFERENCES trip_groups(id) ON DELETE CASCADE,
  url VARCHAR(1000),
  file_name VARCHAR(500) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trip_group_media_group ON trip_group_media(trip_group_id);
```

## Validation Notes (Codex Review)

Validated against current codebase on 2026-03-08. Key adjustments from review:
1. Status made nullable (was `DEFAULT 'planning'` which leaked into folder groups)
2. Group cancellation uses existing `cancelTrip()` service per member (not direct status update)
3. Notes updated with `tripGroupId` column + check constraint revision
4. Dedicated `trip_group_documents` and `trip_group_media` tables added
5. Missing indexes added (trips.trip_group_id, partial unique on group_number)
6. TES extraction specifies deterministic reservation keys for mapping consistency
