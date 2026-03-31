# OTA Trip Request Pipeline + Collaborator Access — Design Specification

**Date:** 2026-03-31
**Status:** Draft
**Author:** Claude + Alex Guertin

---

## Overview

Design a unified pipeline that turns OTA consumer actions (flight searches, hotel bookings, cruise inquiries, tour selections) into real Tailfire inbound trips — with proper owner resolution, auto-built activities, advisor notifications, and a general-purpose collaborator access system for multi-advisor scenarios.

The architecture is designed in three phases, specced together so each phase builds on the last without rework:

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Trip Request Pipeline + Collaborator Access | Build now |
| **Phase 2** | Consumer Trip Builder (multi-component basket) | Build later |
| **Phase 3** | Dream Board Rendering (Pinterest-style vision boards) | Build later |

**Core principle:** The OTA trip request and the Tailfire trip are the **same model but different databases**. The OTA side stores consumer dreams in a simple schema. On submit, the system promotes the request into a real Tailfire trip with full normalized activities. Published trips flow the other direction — advisor → client portal.

```
OTA (consumer dreams) → submit → Tailfire (advisor works) → publish → Client Portal (client reviews)
```

---

## 1. OTA Trip Request Schema

### `ota_trip_requests` Table

A single table that stores consumer-assembled trip requests. Each request can contain one or many components (a flight, a hotel + flight combo, a full vacation itinerary). Data is stored as JSONB for simplicity on the consumer side.

```sql
CREATE TABLE ota_trip_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Consumer identity
  contact_email       TEXT NOT NULL,
  contact_name        TEXT,
  contact_phone       TEXT,

  -- Attribution (resolved on submit)
  advisor_slug        TEXT,               -- From referral/microsite
  referral_session_id TEXT,               -- From ota_referrals
  source              TEXT DEFAULT 'ota', -- ota | ai_concierge | client_portal

  -- Trip overview
  title               TEXT,               -- Consumer-given name: "Cancun Getaway"
  start_date          DATE,
  end_date            DATE,
  travelers           INTEGER DEFAULT 1,

  -- Components (the trip contents)
  components          JSONB NOT NULL DEFAULT '[]',

  -- Status
  status              TEXT NOT NULL DEFAULT 'draft',
  -- draft     = consumer is still building
  -- submitted = consumer submitted, awaiting promotion
  -- promoted  = converted to Tailfire trip
  -- expired   = never submitted, TTL cleanup

  -- Promotion tracking
  promoted_trip_id    UUID,               -- FK to Tailfire trips.id after promotion
  promoted_at         TIMESTAMPTZ,
  promoted_by         TEXT,               -- 'system' | 'admin:{userId}'

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ          -- TTL for draft cleanup (30 days)
);

CREATE INDEX idx_ota_trip_requests_email ON ota_trip_requests (contact_email);
CREATE INDEX idx_ota_trip_requests_status ON ota_trip_requests (status);
CREATE INDEX idx_ota_trip_requests_advisor ON ota_trip_requests (advisor_slug);
```

### Component JSONB Structure

Each component in the `components` array follows this shape:

```jsonc
{
  "id": "uuid",              // Client-generated UUID
  "type": "flight",          // flight | hotel | cruise | tour | package | custom
  "addedAt": "ISO8601",

  // Booking data (used during promotion to create Tailfire activities)
  "data": {
    // Shape varies by type — see Section 1a
  },

  // Display data (used for vision board rendering)
  "display": {
    "heroImage": "https://...",
    "title": "Ottawa → Cancun",
    "subtitle": "Nonstop · Porter · Apr 15",
    "price": "$244",
    "badges": ["Nonstop", "4h 30m"],
    "notes": ""               // Consumer notes: "window seat please"
  }
}
```

### 1a. Component Data Shapes by Type

**Flight:**
```jsonc
{
  "segments": [
    {
      "airline": "PD",
      "airlineName": "Porter Airlines",
      "flightNumber": "PD767",
      "origin": "YOW",
      "destination": "CUN",
      "departureAt": "2026-04-15T07:00:00",
      "arrivalAt": "2026-04-15T10:30:00",
      "duration": "PT4H30M",
      "cabin": "ECONOMY",
      "aircraft": "E195"
    }
  ],
  "price": { "total": 244.32, "perTraveler": 244.32, "currency": "CAD" },
  "fareFamily": "STANDARD",
  "baggageAllowance": { "checked": 0, "cabin": 1 },
  "amadeusOfferId": "1"
}
```

**Hotel:**
```jsonc
{
  "propertyName": "Hyatt Ziva Cancun",
  "propertyCode": "CUNHZ",
  "provider": "amadeus",
  "checkIn": "2026-04-15",
  "checkOut": "2026-04-22",
  "roomType": "Ocean View King",
  "roomCount": 1,
  "guestCount": 2,
  "price": { "total": 2450, "perNight": 350, "currency": "CAD" },
  "imageUrl": "https://...",
  "address": "Blvd. Kukulcan Km 9.5, Cancun"
}
```

**Cruise:**
```jsonc
{
  "sailingId": "uuid",         // From catalog
  "shipName": "Celebrity Beyond",
  "cruiseLine": "Celebrity Cruises",
  "itineraryName": "7-Night Eastern Caribbean",
  "departurePort": "Fort Lauderdale",
  "departureDate": "2026-04-20",
  "returnDate": "2026-04-27",
  "cabinCategory": "Balcony",
  "price": { "total": 3200, "perPerson": 1600, "currency": "CAD" },
  "imageUrl": "https://...",
  "ports": ["CocoCay", "San Juan", "St. Thomas"]
}
```

**Tour:**
```jsonc
{
  "tourName": "Cosmos Highlights of Italy",
  "provider": "globus",
  "tourCode": "2610",
  "startDate": "2026-05-10",
  "endDate": "2026-05-20",
  "departureCity": "Rome",
  "price": { "total": 2800, "perPerson": 1400, "currency": "CAD" },
  "imageUrl": "https://...",
  "highlights": ["Colosseum", "Amalfi Coast", "Florence"]
}
```

**Custom / Freeform:**
```jsonc
{
  "description": "I'd love a villa on the Amalfi Coast for 5 nights",
  "category": "accommodation",  // accommodation | activity | transport | other
  "estimatedBudget": 5000,
  "currency": "CAD"
}
```

---

## 2. Owner Resolution

When an OTA trip request is submitted, the system resolves who should own the resulting Tailfire trip. The priority chain:

### Priority Order (highest to lowest)

1. **CRM Ownership** — The consumer's email matches an existing contact that already has an `ownerId`. That advisor wins. Always.

2. **Referral / Microsite** — The request has an `advisor_slug` (from URL `?advisor=john-smith` or microsite visit). The advisor profile is resolved and becomes the owner.

3. **Client Portal Auth** — The consumer was logged into the client portal when submitting. Their contact's `ownerId` is used. (Same as CRM ownership, but explicitly called out for the authenticated flow.)

4. **Group Membership** — The consumer is booking into a group trip that belongs to an advisor. The group owner gets **collaborator access** (not ownership). If the consumer has no CRM owner, the group owner becomes the trip owner.

5. **Unassigned** — No match. The trip is created as `inbound` with `ownerId = NULL`, `agencyId` = default agency. It appears in the agency queue for an admin to claim or assign.

### Resolution Algorithm

```
resolve_owner(request):
  contact = find_contact_by_email(request.contact_email)

  if contact AND contact.ownerId:
    return { ownerId: contact.ownerId, agencyId: contact.agencyId, attribution: 'crm_existing' }

  if request.advisor_slug:
    advisor = find_advisor_by_slug(request.advisor_slug)
    if advisor:
      return { ownerId: advisor.userId, agencyId: advisor.agencyId, attribution: 'referral' }

  if request.source == 'client_portal' AND contact AND contact.ownerId:
    return { ownerId: contact.ownerId, agencyId: contact.agencyId, attribution: 'client_portal' }

  if request.group_trip_id:
    group_trip = find_trip(request.group_trip_id)
    if group_trip AND group_trip.ownerId AND NOT contact.ownerId:
      return { ownerId: group_trip.ownerId, agencyId: group_trip.agencyId, attribution: 'group' }
    // If contact has CRM owner, group owner gets collaborator access instead (handled in promotion)

  return { ownerId: null, agencyId: DEFAULT_AGENCY_ID, attribution: 'unassigned' }
```

---

## 3. Trip Promotion (OTA → Tailfire)

When a trip request is submitted (`status: 'submitted'`), the promotion service:

### 3a. Create or Update Contact

1. Look up contact by email (agency-scoped first, global fallback)
2. If not found: create with `contactType: 'lead'`, `contactStatus: 'prospecting'`
3. Set `ownerId` and `agencyId` from resolution
4. Set name, phone if blank on existing contact
5. Link referral conversion if `referral_session_id` provided

### 3b. Create Tailfire Trip

```typescript
{
  primaryContactId: contact.id,
  ownerId: resolved.ownerId,        // null for unassigned
  agencyId: resolved.agencyId,
  tripStatus: 'inbound',            // Always inbound — advisor reviews first
  tripType: inferred from components, // leisure (default), group if group context
  startDate: earliest component date,
  endDate: latest component date,
  notes: consumer's special requests / freeform text,
  source: 'ota',                     // New field to track origin
}
```

### 3c. Create Activities from Components

For each component in the JSONB array, create the corresponding Tailfire activity:

**Flight → flight activity:**
- Create itinerary day for departure date
- Create activity (`activityType: 'flight'`, `proposalStatus: 'draft'`, `bookingStatus: 'unbooked'`)
- Create `flight_details` with departure/arrival data
- Create `flight_segments` for each segment
- Create `activity_pricing` with the fare

**Hotel → lodging activity:**
- Create itinerary day for check-in date
- Create activity (`activityType: 'lodging'`)
- Set name, dates, location, confirmation details
- Create `activity_pricing` with room rate

**Cruise → cruise activity:**
- Create activity (`activityType: 'cruise'` or `'custom_cruise'`)
- Set sailing details, cabin category, ports
- Create `activity_pricing` with cruise fare

**Tour → tour activity:**
- Create activity (`activityType: 'tour'` or `'custom_tour'`)
- Set tour details, dates, departure city
- Create `activity_pricing` with tour price

**Custom → custom activity:**
- Create activity (`activityType: 'custom'`)
- Set description in notes field
- Create `activity_pricing` with estimated budget if provided

### 3d. Update Request Status

```typescript
ota_trip_requests.status = 'promoted'
ota_trip_requests.promoted_trip_id = trip.id
ota_trip_requests.promoted_at = now()
ota_trip_requests.promoted_by = 'system'
```

### 3e. Handle Group Booking Conflicts

If the consumer belongs to Advisor A but is booking into Advisor B's group:
1. Trip owner = Advisor B (group context)
2. Create collaborator share: Advisor A gets scoped access to this trip (see Section 5)
3. Contact ownership unchanged — Advisor A still owns the contact

---

## 4. Notifications

### On Trip Promotion

**If assigned (owner resolved):**
- Send notification to the assigned advisor
- Category: `'assignment'`
- Channels: email + push + platform (per advisor preferences)
- Title: "New trip request from {contactName}"
- Body: "{componentCount} components · {destination} · {dates}"
- Action URL: `/trips/{tripId}`

**If unassigned:**
- Send notification to all admin users in the agency
- Category: `'assignment'`
- Title: "New unassigned trip request"
- Body: "{contactName} · {componentCount} components · Needs assignment"
- Action URL: `/trips/{tripId}`

### On Collaborator Access Granted

- Send notification to the collaborator
- Category: `'collaboration'`
- Title: "You've been added to {tripName}"
- Body: "{ownerName} shared {contactName}'s trip with you"
- Action URL: `/trips/{tripId}`

---

## 5. Collaborator Access System

A general-purpose sharing mechanism for contacts and trips. Supports: group bookings, vacation coverage, team collaboration, admin oversight.

### 5a. `trip_collaborators` Table

```sql
CREATE TABLE trip_collaborators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES user_profiles(id),
  agency_id     UUID NOT NULL REFERENCES agencies(id),

  -- Permission level
  role          TEXT NOT NULL DEFAULT 'editor',
  -- viewer   = read-only access to trip and its activities
  -- editor   = read/write on trip activities and components
  -- manager  = editor + can add/remove other collaborators

  -- Scope (optional, for group booking context)
  scoped_contact_id  UUID REFERENCES contacts(id),
  -- If set: collaborator can only see/edit activities linked to this traveler
  -- If null: full trip access

  -- Context
  reason        TEXT,                   -- 'group_booking' | 'vacation_coverage' | 'team_collaboration' | 'admin'
  granted_by    UUID REFERENCES user_profiles(id),

  -- Validity
  starts_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,            -- Null = permanent, set for vacation coverage

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(trip_id, user_id)              -- One role per user per trip
);

CREATE INDEX idx_trip_collaborators_trip ON trip_collaborators (trip_id);
CREATE INDEX idx_trip_collaborators_user ON trip_collaborators (user_id);
```

### 5b. `contact_shares` Table

```sql
CREATE TABLE contact_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES user_profiles(id),
  agency_id     UUID NOT NULL REFERENCES agencies(id),

  -- Permission level
  role          TEXT NOT NULL DEFAULT 'viewer',
  -- viewer   = read contact info (name, email, phone, passport)
  -- editor   = read + update contact fields

  -- Context
  reason        TEXT,                   -- 'group_booking' | 'vacation_coverage' | 'admin'
  granted_by    UUID REFERENCES user_profiles(id),

  -- Validity
  starts_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(contact_id, user_id)
);

CREATE INDEX idx_contact_shares_contact ON contact_shares (contact_id);
CREATE INDEX idx_contact_shares_user ON contact_shares (user_id);
```

### 5c. Permission Rules

**Trip Access:** A user can access a trip if:
- `trips.ownerId = userId` (owner)
- `trip_collaborators` has a row for `(tripId, userId)` that is currently valid (`starts_at <= now AND (expires_at IS NULL OR expires_at > now)`)
- User is an admin in the same agency

**Contact Access:** A user can access a contact if:
- `contacts.ownerId = userId` (owner)
- `contact_shares` has a row for `(contactId, userId)` that is currently valid
- User is an admin in the same agency

**Scoped Collaborator (Group Booking):**
- When `scoped_contact_id` is set on `trip_collaborators`, the collaborator can only see activities where the traveler is linked to that contact
- The collaborator can see the contact's info via auto-created `contact_shares` row

### 5d. Auto-Created Shares for Group Bookings

When the promotion detects a group conflict (consumer's CRM advisor differs from group owner):

1. Create `trip_collaborators` row:
   - `trip_id`: the group trip
   - `user_id`: the consumer's CRM advisor (e.g., Marie)
   - `role`: 'editor'
   - `scoped_contact_id`: the consumer's contact (e.g., Jane)
   - `reason`: 'group_booking'

2. Create `contact_shares` row:
   - `contact_id`: the consumer (Jane)
   - `user_id`: the group owner (Steve)
   - `role`: 'viewer'
   - `reason`: 'group_booking'

This gives:
- Steve (group owner): manages the group trip, can view Jane's contact info
- Marie (Jane's advisor): can see/edit Jane's activities within Steve's group trip

### 5e. Admin Claim / Assign

For unassigned trips (`ownerId = NULL`):

**Claim:** Admin sets themselves as `trips.ownerId`. Trip moves from agency queue to their personal list.

**Assign:** Admin sets another advisor as `trips.ownerId`. Notification sent to the assigned advisor.

Both operations also set `contacts.ownerId` if the contact was previously unassigned.

---

## 6. API Endpoints

### OTA Endpoints (public, OtaServiceKeyGuard)

```
POST /ota/trip-requests
  Body: { email, name, phone, advisorSlug?, referralSessionId?, title?, startDate?, endDate?, travelers?, components[] }
  → Creates ota_trip_requests with status 'draft'
  → Returns: { requestId }

PUT /ota/trip-requests/:id/components
  Body: { components[] }
  → Updates the components JSONB array
  → Returns: { requestId, componentCount }

POST /ota/trip-requests/:id/submit
  → Transitions status draft → submitted
  → Triggers promotion pipeline (async)
  → Returns: { requestId, message: "Your trip request has been submitted..." }

GET /ota/trip-requests/:id
  → Returns request details (for consumer to review their submission)
```

### Admin Endpoints (JWT auth)

```
POST /trips/:id/claim
  → Admin claims an unassigned inbound trip
  → Sets ownerId = currentUser, updates contact

POST /trips/:id/assign
  Body: { advisorId }
  → Admin assigns trip to a specific advisor
  → Sends notification to advisor

POST /trips/:id/collaborators
  Body: { userId, role, scopedContactId?, reason, expiresAt? }
  → Adds a collaborator to the trip
  → Sends notification

DELETE /trips/:id/collaborators/:collaboratorId
  → Removes a collaborator

POST /contacts/:id/shares
  Body: { userId, role, reason, expiresAt? }
  → Shares a contact with another advisor

DELETE /contacts/:id/shares/:shareId
  → Removes a contact share

GET /trips/:id/collaborators
  → Lists all collaborators on a trip

GET /contacts/:id/shares
  → Lists all shares on a contact
```

---

## 7. Phase 2 Vision: Consumer Trip Builder

*Not built in Phase 1, but the architecture supports it.*

The consumer trip builder lets users assemble multi-component trips before submitting:

- Persistent trip basket stored in `ota_trip_requests` with `status: 'draft'`
- "Add to Trip" button on flight cards, hotel results, cruise sailings, tour listings
- Trip summary sidebar/drawer showing all added components
- Ability to remove components, add notes, reorder
- Consumer can have multiple draft trips
- Session tracked via cookie or client portal auth
- Draft expires after 30 days (`expires_at` field)

The `ota_trip_requests` table already supports this — components are a JSONB array that can grow incrementally.

---

## 8. Phase 3 Vision: Dream Board Rendering

*Not built in Phase 1, but the data model supports it.*

### Consumer → Advisor (Submit)
The vision board is a rich visual rendering of the `ota_trip_requests.components` array. Each component's `display` fields (heroImage, title, subtitle, badges) power a Pinterest/mymind-style masonry grid. The consumer curates their dream trip visually, then submits.

### Advisor → Client (Publish)
The published trip feature renders a Tailfire trip as a dream board on the client portal. This is the reverse flow — the advisor's structured itinerary becomes a visual proposal. Same rendering engine, different data source:

- Submit: reads from `ota_trip_requests.components[].display`
- Publish: reads from Tailfire trip activities, generating display data from the structured fields + destination imagery

Both flows use the same board component — the only difference is the data source.

---

## 9. Migration Plan

### New Tables
- `ota_trip_requests` (OTA database — same DB for now, own schema later)
- `trip_collaborators` (Tailfire database)
- `contact_shares` (Tailfire database)

### Modified Tables
- `trips` — Add `source` column (`TEXT`, default `'admin'`, values: `'admin'` | `'ota'` | `'import'`)
- No changes to existing activity/component tables (promotion creates standard activities)

### No Breaking Changes
- Existing OTA lead capture continues to work
- Existing trip creation is unaffected
- New tables are additive

---

## 10. Scope Summary

### Phase 1 (Build Now)

| Feature | Description |
|---------|-------------|
| `ota_trip_requests` table + API | Store consumer trip requests with components JSONB |
| Owner resolution service | CRM > referral > client portal > group > unassigned |
| Trip promotion service | Convert request → Tailfire inbound trip with activities |
| Component promoters | Flight, hotel, cruise, tour, custom → Tailfire activities |
| Notifications | Advisor assignment, admin queue, collaborator access |
| `trip_collaborators` table + API | General-purpose trip sharing with roles and scoping |
| `contact_shares` table + API | General-purpose contact sharing with roles |
| Admin claim/assign | Admin can claim or assign unassigned trips |
| Group conflict handling | Auto-create collaborator shares for cross-advisor bookings |

### Phase 2 (Build Later)
- Consumer trip builder UI (multi-component basket)
- "Add to Trip" on search result cards
- Trip summary sidebar/drawer
- Draft management (multiple drafts, expiry)

### Phase 3 (Build Later)
- Dream board visual rendering (Pinterest/mymind style)
- Published trip → dream board on client portal
- AI concierge integration with vision board
- Shared board links for social sharing

### Deferred
- Round-robin auto-assignment (currently admin manual)
- Consumer accounts / authentication on OTA
- Payment collection through OTA
- Real-time advisor ↔ consumer collaboration on drafts
