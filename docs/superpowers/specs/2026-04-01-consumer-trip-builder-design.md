# Consumer Trip Builder + Dream Board — Design Specification

**Date:** 2026-04-01
**Status:** Draft (Codex-validated, rev 2)
**Author:** Claude + Alex Guertin
**Phase:** 2 of 3 (builds on Phase 1: OTA Trip Request Pipeline)

---

## Overview

Build a consumer-facing trip builder that lets OTA visitors assemble multi-component trips (flights, hotels, cruises, tours) through three interconnected interfaces: search pages, an AI concierge, and a visual dream board. The dream board is a Pinterest-style masonry grid of image-rich cards that serves as both a trip planner and a visual inspiration tool.

**Core principle:** The AI concierge IS the trip builder. The basket lives inside the chat experience. The dream board, the AI panel, and the search pages are three views of the same trip — the `ota_trip_requests` row with its JSONB components array.

```
Search Pages ──→ "Add to Trip" ──→ ota_trip_requests.components[]
AI Concierge ──→ suggests + drags ──→ ota_trip_requests.components[]
Dream Board  ──→ visual view + manage ──→ ota_trip_requests.components[]
                                              ↓ (submit)
                                     Tailfire inbound trip (Phase 1 pipeline)
```

---

## 1. Trip Basket

### State Management
A Zustand store (`useTripBasket`) persists the current draft trip across all OTA pages. The store syncs to the backend `ota_trip_requests` table via Next.js API proxy routes. Follows the same store pattern as `flight-search-store.ts`.

### Lifecycle

1. **No basket** — Consumer browses anonymously. "Add to Trip" buttons visible but no active trip.
2. **First add** — Consumer clicks "Add to Trip" on any search result card. System auto-creates an `ota_trip_requests` row with `status: 'draft'` and `contact_email: NULL` (email is nullable for drafts). Trip title auto-generated from the first component's destination (e.g., "Cancun Trip" from a CUN flight). No prompt, no friction.
3. **Subsequent adds** — If one draft exists, component goes straight in. If multiple drafts exist, show a dropdown picker: "Add to [Cancun Trip] / [Italy Adventure] / [New Trip]".
4. **Identity capture** — Consumer remains anonymous until they access the dream board or the AI captures their email. Then CRM lookup + soft account creation. Email becomes required.
5. **Submit** — Consumer reviews, confirms details, submits. Email is validated as required at this point. Triggers Phase 1 promotion pipeline.
6. **Expiry** — Drafts expire after 30 days (`expires_at` field, already implemented).

### Session Tracking
- Reuse the existing `ota_session` cookie (already set by `middleware.ts` for every visitor) as the anonymous session key
- Add `session_id` column to `ota_trip_requests` to link anonymous drafts to the session
- Lookup active drafts: `WHERE session_id = :otaSession AND status = 'draft'`
- When consumer provides email, link all session drafts to the contact
- No new cookies needed — the session cookie is already in place

### Schema Change for Anonymous Drafts
`contact_email` must become nullable for draft rows:
```sql
ALTER TABLE ota_trip_requests ALTER COLUMN contact_email DROP NOT NULL;
```
- Drafts: `contact_email` can be NULL (anonymous)
- Submit validation: `contact_email` required before promotion
- Drizzle schema: change `.notNull()` to allow null on `contactEmail`

### "Add to Trip" Button
Appears on:
- Flight result cards, Hotel result cards, Cruise sailing cards, Tour cards
- AI concierge suggestion cards (draggable)
- Deal cards (deals page)

Button states:
- **No basket** → "Add to Trip" (creates draft on click)
- **Active basket** → "Add to Trip" with checkmark animation on success
- **Already in basket** → "Added ✓" (disabled, with "Remove" on hover)
- **Multiple drafts** → Opens picker dropdown on click

---

## 2. AI Concierge Integration

### Extending Existing Chat Transport
The current AI chat uses `apps/ota/src/app/api/chat/route.ts` with tools defined in `apps/ota/src/lib/ai/tools.ts`. The existing `captureContact` tool posts to `/ota/leads`. Phase 2 extends this:

**New AI Tool: `manageTripBasket`**
- Actions: `add_component`, `remove_component`, `get_basket`, `set_title`
- Wired to the same `ota_trip_requests` API endpoints via `serviceFetch`
- When AI adds a component, it appears on the dream board in real-time

**New AI Tool: `captureIdentity`**
- Replaces/extends `captureContact` for the trip context
- When consumer gives email in chat: CRM lookup → create/link contact → link trip request
- Sets `contact_email`, `contact_name`, `contact_id` on the draft
- Returns confirmation: "Great, I've saved your trip! You can view your dream board at..."
- Calls `PATCH /ota/trip-requests/:id/identity` (new endpoint)

### Trip Awareness
The chat route passes current basket contents as system context:
- Append to system prompt: "The user has a trip with N components: [flight YOW→CUN $244, hotel Hyatt Ziva 7 nights]"
- Enables contextual suggestions: "I see you're going to Cancun — want me to find a hotel near the beach?"

### AI Panel Layout
The AI panel is NOT the existing floating chat widget. It's a new layout mode:

**Desktop:**
- Board page has a toggle button: "✦ AI" in the header
- Clicking opens the AI panel from the right (slides in)
- Board resizes from 100% to ~60% width, AI panel takes ~40%
- AI panel has full chat interface with draggable suggestion cards
- Closing the panel restores the board to full width

**Mobile (combined approach):**
- **Top**: Compact AI suggestion bar — one suggestion at a time, horizontally swipeable, "Add" button on each
- **Middle**: Full-width masonry board (scrollable)
- **Bottom**: Chat input bar — "Ask AI anything..."
- **Expand**: Tapping chat input slides up a bottom sheet (reuse `Sheet` from `@/components/ui/sheet`) with full AI conversation + draggable suggestions
- Bottom sheet states: collapsed (input bar only), half-screen, full-screen

---

## 3. Dream Board Page

### URL and Access Control
- **Authenticated view**: `/my-trip/[id]` — requires identity (email captured via AI or manual entry)
- **Shared view**: `/my-trip/[id]?token=SHARE_TOKEN` — read-only, no login required
- **Access rule**: A draft can be accessed if:
  - The `ota_session` cookie matches `session_id` on the request (anonymous creator)
  - The authenticated contact matches `contact_id` on the request
  - A valid `share_token` is provided (read-only)
- Single URL shape — no separate `/share` route. Token in query param determines read-only mode.

### Layout

**Desktop:**
- Board fills the main content area as a masonry grid
- AI panel slides out from right when toggled (board resizes, not overlays)
- When AI panel open: board ~60%, AI panel ~40%
- When AI panel closed: board 100%

**Mobile:**
- Top bar + mobile menu (standard OTA nav)
- Compact AI suggestion bar below nav
- Full-width masonry board (main content, scrollable)
- Chat input bar at bottom (fixed)
- Bottom sheet for expanded AI (slides up from chat input)

### Card Types

**Functional Cards** (interactive — editable, removable, with pricing):
- Flight: destination city photo (enrichment/Unsplash), route, airline, times, price
- Hotel: property photo, name, dates, room type, price
- Cruise: ship photo (catalog), ship, itinerary, dates, cabin, price
- Tour: tour photo (provider/Unsplash), name, dates, highlights, price

Each functional card has: hero image with gradient overlay, type badge, price badge, title + details, tap to expand/edit, long-press for remove/edit notes/reorder.

**Inspiration Cards** (non-interactive — pure visual filler):
- Destination-relevant imagery for visual texture
- Sources: Unsplash API, SerpAPI/TripAdvisor, enrichment cache
- Auto-generated when destination detected (from flights, hotels, cruise ports)
- Image-only cards with optional subtle caption
- Clicking does nothing (future: map to suggested experiences)
- 2-4 per destination

**Storage:** Inspiration cards stored in a separate `inspiration` JSONB field on `ota_trip_requests` — NOT in the `components[]` array. This keeps the components array clean for bookable items only, avoiding conflicts with the Phase 1 DTO validation and promotion pipeline which only accepts flight/hotel/cruise/tour types.

### Drag and Drop
- Reorder cards within the board (drag to rearrange)
- Drag from AI suggestion cards onto the board (desktop)
- "Add" button on suggestions (mobile)
- Drop zone indicator when dragging (dashed border placeholder)
- No existing DnD library in OTA — install `@dnd-kit/core` + `@dnd-kit/sortable`

### Manual Add Buttons
In the board header or floating action menu:
- "+ Add Flight" → navigates to `/search/flights?tripId=xxx`
- "+ Add Hotel" → navigates to `/search/hotels?tripId=xxx`
- "+ Add Cruise" → navigates to `/search/cruises?tripId=xxx`
- "+ Add Tour" → navigates to `/search/tours?tripId=xxx`
- "+ Add Note" → adds a freeform text card (stored in `components[]` as type `note`)

When navigating to search pages from the board, `tripId` query param ensures "Add to Trip" auto-targets the correct trip.

---

## 4. Submit Flow

### Review Screen
Triggered by "Submit Trip" button on the board:

1. **Trip Summary** — All functional components listed with images, titles, prices. Approximate total with disclaimer: "Prices are approximate and will be confirmed by your advisor." Inspiration cards NOT shown.

2. **Confirm Details** — Travelers count (editable), departure dates (pre-filled), date flexibility toggle ("My dates are flexible"), travel style dropdown (relaxed / adventure / luxury / budget / family-friendly — validated as enum).

3. **Contact Info** — Name, email, phone (pre-filled if AI captured, editable). All required.

4. **Special Requests** — Freeform comment box.

5. **Share Option** — "Share with travel companions" — generates a read-only link using `share_token`.

6. **Submit** — Validates email is set, triggers Phase 1 promotion pipeline. Confirmation screen with "Talk to AI Concierge" / "Browse more trips" options.

### Share Feature
- Generates a `share_token` (random 64-char string, unique + indexed) on the `ota_trip_requests` row
- Shareable URL: `/my-trip/:id?token=SHARE_TOKEN`
- Read-only: same dream board layout but no editing, no AI panel, no submit
- Consumer can regenerate or revoke the token
- Follows same pattern as `trips.shareToken` in existing codebase

---

## 5. Data Model

### Schema Changes to `ota_trip_requests`

```sql
-- Make email nullable for anonymous drafts
ALTER TABLE ota_trip_requests ALTER COLUMN contact_email DROP NOT NULL;

-- New columns
ALTER TABLE ota_trip_requests
  ADD COLUMN IF NOT EXISTS session_id TEXT,           -- Links to ota_session cookie for anonymous tracking
  ADD COLUMN IF NOT EXISTS share_token VARCHAR(64),   -- For shareable read-only links
  ADD COLUMN IF NOT EXISTS date_flexibility BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS travel_style VARCHAR(20),  -- relaxed|adventure|luxury|budget|family
  ADD COLUMN IF NOT EXISTS contact_id UUID,           -- Linked contact after identity capture
  ADD COLUMN IF NOT EXISTS inspiration JSONB DEFAULT '[]'; -- Inspiration cards (separate from components)

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_trip_requests_share_token
  ON ota_trip_requests (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ota_trip_requests_session
  ON ota_trip_requests (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ota_trip_requests_contact
  ON ota_trip_requests (contact_id) WHERE contact_id IS NOT NULL;
```

Update Drizzle schema to match (add all new columns + make `contactEmail` nullable).

### `travel_style` Enum Values
Validated in DTO as: `'relaxed' | 'adventure' | 'luxury' | 'budget' | 'family'`

### Promotion Service Update
When `contact_id` is set on the trip request, promotion should use it directly instead of re-looking up the contact by email. Falls back to email lookup if `contact_id` is null.

---

## 6. API Endpoints

### New Backend Endpoints (OtaServiceKeyGuard)

```
GET  /ota/trip-requests/by-session/:sessionId
  → Returns active draft(s) for this session (anonymous basket hydration)
  → Declared BEFORE /:id route to avoid route collision

POST /ota/trip-requests/:id/components/add
  Body: { component: TripRequestComponentDto }
  → Appends a single component to the JSONB array
  → Returns: { requestId, componentCount }

DELETE /ota/trip-requests/:id/components/:componentId
  → Removes a component from the JSONB array
  → Returns: { requestId, componentCount }

PATCH /ota/trip-requests/:id/components/reorder
  Body: { componentIds: string[] }
  → Reorders the components array

POST /ota/trip-requests/:id/share
  → Generates or returns existing shareToken
  → Returns: { shareToken, shareUrl }

DELETE /ota/trip-requests/:id/share
  → Revokes the share token

GET /ota/trip-requests/shared/:token
  → Returns read-only trip request for shared link viewers
  → No auth required (public)

POST /ota/trip-requests/:id/inspiration
  Body: { destination: string }
  → Fetches 2-4 inspiration images and stores in inspiration JSONB
  → Returns: { cards: InspirationCard[] }

PATCH /ota/trip-requests/:id/identity
  Body: { email, name?, phone? }
  → CRM lookup → create/link contact → set contact_email, contact_name, contact_id
  → Returns: { contactId, isExisting, advisorName? }
```

### New Next.js Proxy Routes (OTA frontend)
All basket actions go through Next.js API routes (same pattern as `/api/flights/*`):

```
apps/ota/src/app/api/trip-requests/
├── route.ts                        # POST — create draft
├── [id]/route.ts                   # GET — get request details
├── [id]/components/add/route.ts    # POST — append component
├── [id]/components/[cid]/route.ts  # DELETE — remove component
├── [id]/components/reorder/route.ts # PATCH — reorder
├── [id]/submit/route.ts            # POST — submit + promote
├── [id]/share/route.ts             # POST/DELETE — manage share token
├── [id]/identity/route.ts          # PATCH — link identity
├── [id]/inspiration/route.ts       # POST — fetch inspiration images
├── by-session/[sid]/route.ts       # GET — lookup by session
└── shared/[token]/route.ts         # GET — public shared view
```

### Existing Endpoints (reused from Phase 1)
```
POST /ota/trip-requests              — Create draft (update: email now optional)
PUT  /ota/trip-requests/:id/components — Replace full components array
POST /ota/trip-requests/:id/submit   — Submit + promote
GET  /ota/trip-requests/:id          — Get request details
```

---

## 7. Frontend Components

### Zustand Store: `useTripBasket`
```typescript
interface TripBasketState {
  requestId: string | null
  title: string | null
  components: TripRequestComponent[]
  inspiration: InspirationCard[]
  isLoading: boolean
  isIdentified: boolean  // Has email been provided?

  hydrate: () => Promise<void>         // Load from session cookie
  addComponent: (component) => Promise<void>
  removeComponent: (componentId) => Promise<void>
  reorderComponents: (ids) => Promise<void>
  setTitle: (title) => Promise<void>
  createDraft: (firstComponent) => Promise<string>
  linkIdentity: (email, name?, phone?) => Promise<void>
}
```

### New Pages
- `/my-trip/[id]/page.tsx` — Dream board page (access-controlled)

### New Components (`apps/ota/src/components/trip-builder/`)
- `trip-basket-provider.tsx` — Context provider, hydrates from `ota_session` cookie
- `add-to-trip-button.tsx` — Reusable button for search result cards
- `trip-picker-dropdown.tsx` — Multi-draft picker
- `dream-board.tsx` — Masonry grid with `@dnd-kit/sortable`
- `board-card.tsx` — Single card (functional or inspiration) with hero image
- `board-add-menu.tsx` — Manual add buttons (+ Flight, + Hotel, etc.)
- `ai-suggestion-bar.tsx` — Mobile compact bar (top)
- `ai-chat-input.tsx` — Mobile chat input (bottom)
- `ai-board-panel.tsx` — Desktop slide-out AI panel (new, not the existing chat widget)
- `ai-suggestion-card.tsx` — Draggable suggestion card
- `submit-review.tsx` — Submit flow with review/confirm/share
- `share-button.tsx` — Generate and copy share link

### Modified Components
- Search result cards — Add "Add to Trip" button
- `apps/ota/src/lib/ai/tools.ts` — Add `manageTripBasket` and `captureIdentity` tools
- `apps/ota/src/app/api/chat/route.ts` — Pass basket context in system prompt
- `apps/ota/src/components/layout/nav.tsx` — Trip indicator badge (component count)

---

## 8. Image Sourcing for Inspiration Cards

### Sources (priority order)
1. Enrichment cache — Destination photos from SerpAPI/TripAdvisor
2. Unsplash API — Search by destination name, top 4 landscape photos
3. SerpAPI Images — Google Images for "{destination} travel" as fallback

### Attribution
- Unsplash: photographer name + link in `data.sourceId`
- Display attribution on card hover

### Caching
- Cache per destination in `OtaSearchCacheService` (24-hour TTL)
- Persisted in the trip's `inspiration` JSONB field

---

## 9. Implementation Prerequisites

Before Phase 2 implementation, these Phase 1 changes are needed:

1. **Make `contact_email` nullable** on `ota_trip_requests` schema + migration
2. **Add `session_id` column** for anonymous session tracking
3. **Re-apply extended sharing fields** to `trip_shares` and `contact_shares` Drizzle schemas (reverted by linter — columns exist in DB but not in schema)
4. **Re-apply `source` column** to `trips` Drizzle schema + DTO (same linter revert issue)
5. **Add submit validation** — enforce email required before promotion

---

## 10. Scope Summary

### Build Now (Phase 2)

| Feature | Description |
|---------|-------------|
| Trip basket Zustand store | Persistent draft trip across OTA pages |
| "Add to Trip" button | On all search result cards |
| Auto-create draft | First add creates trip (anonymous), auto-titled |
| Multi-draft picker | Choose which trip to add to |
| Session tracking | Reuse `ota_session` cookie for anonymous baskets |
| Dream board page | Masonry grid with `@dnd-kit`, hero image cards |
| Functional cards | Flight, hotel, cruise, tour with images and pricing |
| Inspiration cards | Destination imagery filler (separate JSONB field) |
| Drag and drop | Reorder cards, drag from AI panel |
| Manual add buttons | + Flight, + Hotel, + Cruise, + Tour, + Note |
| AI panel (desktop) | Slide-out panel, board resizes |
| AI mobile layout | Compact bar top + chat input bottom + expandable sheet |
| AI tools | `manageTripBasket` + `captureIdentity` extending existing chat |
| AI trip awareness | Basket context in system prompt |
| Identity capture | Email → CRM lookup → link contact |
| Submit flow | Review + confirm details + disclaimer + share |
| Share feature | Token-based read-only link (reuse existing pattern) |
| Next.js proxy routes | All basket actions through `/api/trip-requests/*` |
| Access control | Session-based for anonymous, contact-based for identified, token for shared |

### Deferred to Phase 3
- Published trip → dream board on client portal
- Inspiration cards linked to bookable experiences
- Real-time advisor ↔ consumer collaboration
- Map/timeline/calendar views
- Social sharing with OG images
