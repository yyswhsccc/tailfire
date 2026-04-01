# Consumer Trip Builder + Dream Board — Design Specification

**Date:** 2026-04-01
**Status:** Draft
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
A Zustand store (`useTripBasket`) persists the current draft trip across all OTA pages. The store syncs to the backend `ota_trip_requests` table via API calls.

### Lifecycle

1. **No basket** — Consumer browses anonymously. "Add to Trip" buttons visible but no active trip.
2. **First add** — Consumer clicks "Add to Trip" on any search result card. System auto-creates an `ota_trip_requests` row with `status: 'draft'`. Trip title auto-generated from the first component's destination (e.g., "Cancun Trip" from a CUN flight). No prompt, no friction.
3. **Subsequent adds** — If one draft exists, component goes straight in. If multiple drafts exist, show a dropdown picker: "Add to [Cancun Trip] / [Italy Adventure] / [New Trip]".
4. **Identity capture** — Consumer remains anonymous until they access the dream board or the AI captures their email. Then CRM lookup + soft account creation.
5. **Submit** — Consumer reviews, confirms details, submits. Triggers Phase 1 promotion pipeline.
6. **Expiry** — Drafts expire after 30 days (`expires_at` field, already implemented).

### Session Tracking
- Anonymous users tracked via `ota_basket_id` cookie (stores the `ota_trip_requests.id`)
- Cookie set on first "Add to Trip" action
- Cookie expires after 30 days (matches draft TTL)
- If consumer logs in or provides email, the draft is linked to their contact

### "Add to Trip" Button
Appears on:
- Flight result cards (flight search page)
- Hotel result cards (hotel search page)
- Cruise sailing cards (cruise search page)
- Tour cards (tour search page)
- AI concierge suggestion cards (draggable)
- Deal cards (deals page)

Button states:
- **No basket** → "Add to Trip" (creates draft on click)
- **Active basket** → "Add to Trip" with checkmark animation on success
- **Already in basket** → "Added ✓" (disabled, with "Remove" on hover)
- **Multiple drafts** → Opens picker dropdown on click

---

## 2. AI Concierge Integration

### Trip Awareness
The AI concierge receives the current trip basket contents as context:
- Number of components, types, destinations, dates, total estimate
- What's missing (e.g., "has flights but no hotel")
- Consumer's stated preferences from conversation

### Identity Capture
The AI naturally asks for name and email during conversation:
- "I'd love to help you plan this! What's your name?"
- "I can save your trip progress — what's your email?"

When the consumer provides their email:
1. **CRM lookup** — Check if email exists in Tailfire contacts
   - **Exists with owner** → Link trip to existing contact. Notify assigned advisor.
   - **Exists, no owner** → Link to existing contact. Trip stays unassigned.
   - **Not found** → Create new contact (`type: 'lead'`, `status: 'prospecting'`). Soft account.
2. **Update trip request** — Set `contact_email`, `contact_name` on the `ota_trip_requests` row
3. **Enable dream board** — Consumer can now access `/my-trip/:id`

### AI Suggestions
The AI can suggest components that appear as cards in the chat:
- Each suggestion card is draggable (desktop) or has an "Add" button (mobile)
- Suggestions follow the same component JSONB shape with `data` + `display` fields
- AI suggestions include `display.heroImage` for visual richness
- Clicking "Add" or dragging onto the board calls the same `addComponent` action as search results

---

## 3. Dream Board Page

### URL
`/my-trip/:id` — requires identity (email captured via AI or manual entry).

A shareable read-only version at `/my-trip/:id?share=TOKEN` — accessible without login.

### Layout

**Desktop:**
- Board fills the main content area as a masonry grid
- AI panel slides out from the right when opened (toggle button in header)
- Board resizes to accommodate the AI panel (not overlay)
- When AI panel is open: board ~60%, AI panel ~40%
- When AI panel is closed: board 100%

**Mobile (combined A+C approach):**
- **Top**: Compact AI suggestion bar — one suggestion at a time, horizontally swipeable, "Add" button on each
- **Middle**: Full-width masonry board (scrollable)
- **Bottom**: Chat input bar (like iMessage) — "Ask AI anything..."
- **Expand**: Tapping chat input slides up a bottom sheet with full AI conversation history + draggable suggestion cards
- Bottom sheet has 3 states: collapsed (just input bar), half-screen, full-screen
- Standard top bar and mobile menu sit above everything

### Card Types

**Functional Cards** (interactive — editable, removable, with pricing):

| Type | Hero Image Source | Content |
|------|------------------|---------|
| Flight | Destination city photo (enrichment/Unsplash) | Route, airline, times, price |
| Hotel | Property photo (provider/Unsplash) | Property name, dates, room type, price |
| Cruise | Ship photo (catalog) | Ship, itinerary, dates, cabin, price |
| Tour | Tour photo (provider/Unsplash) | Tour name, dates, highlights, price |

Each functional card has:
- Hero image with gradient overlay for text readability
- Component type badge (top-left)
- Price badge (top-right)
- Title + key details as overlay text
- Tap/click to expand details or edit
- Long-press/right-click for: Remove, Edit notes, Move (reorder)

**Inspiration Cards** (non-interactive — pure visual filler):

Destination-relevant imagery that creates visual texture on the board:
- Sourced from: Unsplash API, SerpAPI/TripAdvisor destination photos, our enrichment cache
- Auto-generated when a destination is detected in the trip (from flight destinations, hotel locations, cruise ports)
- Display as image-only cards with optional subtle caption ("Cancun beaches", "Mayan ruins")
- Clicking does nothing (future: map to suggested experiences)
- Mixed into the masonry grid between functional cards
- 2-4 inspiration cards per destination, pulled on trip creation/destination add
- Component type in JSONB: `{ type: 'inspiration', data: { destination, imageUrl, caption, source } }`

### Drag and Drop
- Reorder cards within the board (drag to rearrange)
- Drag from AI suggestion cards onto the board (desktop: horizontal drag from panel, mobile: "Add" button)
- Drop zone indicator when dragging (dashed border placeholder)
- Uses the same drag-and-drop pattern as the Tailfire admin itinerary builder

### Manual Add Buttons
Top of the board or in a floating action menu:
- "+ Add Flight" → navigates to `/search/flights` with trip context
- "+ Add Hotel" → navigates to `/search/hotels` with trip context
- "+ Add Cruise" → navigates to `/search/cruises` with trip context
- "+ Add Tour" → navigates to `/search/tours` with trip context
- "+ Add Note" → adds a freeform text card to the board

When navigating to search pages from the board, the active trip ID is passed as a query param (`?tripId=xxx`) so "Add to Trip" on search results auto-targets the correct trip.

---

## 4. Submit Flow

### Review Screen
Triggered by "Submit Trip" button on the board. Shows:

1. **Trip Summary**
   - All functional components listed with images, titles, prices
   - Approximate total with disclaimer: "Prices are approximate and will be confirmed by your advisor"
   - Inspiration cards NOT shown in summary (they're visual filler, not bookable)

2. **Confirm Details**
   - Number of travelers (pre-filled from trip, editable)
   - Departure dates (pre-filled from earliest component date)
   - Date flexibility toggle: "My dates are flexible" (yes/no)
   - Preferred travel style: dropdown (relaxed / adventure / luxury / budget / family-friendly)

3. **Contact Info**
   - Name, email, phone (pre-filled if AI captured, editable)
   - Required fields validated before submit

4. **Special Requests**
   - Freeform comment box: "Anything else your advisor should know?"
   - Placeholder: "Celebrating an anniversary, need wheelchair access, flexible on dates..."

5. **Share Option**
   - "Share with travel companions" — generates a read-only shareable link
   - Can share before or instead of submitting

6. **Submit Button**
   - "Submit to Advisor" → triggers Phase 1 promotion pipeline
   - Confirmation screen: "Your dream trip has been submitted! An advisor will review and reach out within 2 hours."
   - Options on confirmation: "Talk to AI Concierge" / "Browse more trips"

### Share Feature
- Generates a `shareToken` on the `ota_trip_requests` row
- Shareable URL: `/my-trip/:id?share=TOKEN`
- Read-only view: same dream board layout but no editing, no AI panel, no submit
- Anyone with the link can view (no login required)
- Consumer can regenerate or revoke the share token

---

## 5. Data Model

### Existing (no changes needed)
- `ota_trip_requests` table — already has components JSONB, status lifecycle, promotion tracking
- Phase 1 promotion pipeline — already converts submitted requests to Tailfire trips

### New Fields on `ota_trip_requests`

```sql
ALTER TABLE ota_trip_requests
  ADD COLUMN IF NOT EXISTS share_token TEXT,
  ADD COLUMN IF NOT EXISTS date_flexibility BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS travel_style TEXT,
  ADD COLUMN IF NOT EXISTS contact_id UUID;  -- Linked contact after identity capture
```

### Component JSONB — Inspiration Card Shape

```jsonc
{
  "id": "uuid",
  "type": "inspiration",
  "addedAt": "ISO8601",
  "data": {
    "destination": "Cancun",
    "imageUrl": "https://images.unsplash.com/...",
    "caption": "Crystal clear cenotes",
    "source": "unsplash",          // unsplash | serpapi | enrichment
    "sourceId": "unsplash-photo-id" // For attribution
  },
  "display": {
    "heroImage": "https://images.unsplash.com/...",
    "caption": "Crystal clear cenotes"
  }
}
```

### Cookie
- Name: `ota_basket_id`
- Value: `ota_trip_requests.id` (UUID)
- Expires: 30 days
- Path: `/`
- SameSite: Lax

---

## 6. API Endpoints

### New OTA Endpoints (OtaServiceKeyGuard)

```
GET  /ota/trip-requests/active
  → Returns the consumer's active draft(s) by email or cookie session
  → Used by the basket store to hydrate on page load

POST /ota/trip-requests/:id/components
  Body: { component: TripRequestComponentDto }
  → Appends a single component to the JSONB array
  → Returns: { requestId, componentCount }

DELETE /ota/trip-requests/:id/components/:componentId
  → Removes a component from the JSONB array by component.id
  → Returns: { requestId, componentCount }

PATCH /ota/trip-requests/:id/components/reorder
  Body: { componentIds: string[] }
  → Reorders the components array to match the provided order

POST /ota/trip-requests/:id/share
  → Generates or returns existing shareToken
  → Returns: { shareToken, shareUrl }

DELETE /ota/trip-requests/:id/share
  → Revokes the share token

GET /ota/trip-requests/:id/share/:token
  → Returns read-only trip request (for shared link viewers)
  → No auth required

POST /ota/trip-requests/:id/inspiration
  Body: { destination: string }
  → Fetches and adds 2-4 inspiration cards for the destination
  → Sources: Unsplash API, SerpAPI, enrichment cache
  → Returns: { cards: InspirationCard[] }

PATCH /ota/trip-requests/:id/identity
  Body: { email, name?, phone? }
  → Links the trip request to a contact (CRM lookup + create)
  → Sets contact_email, contact_name, contact_id
  → Returns: { contactId, isExisting, advisorName? }
```

### Existing Endpoints (reused from Phase 1)
```
POST /ota/trip-requests              — Create draft (already built)
PUT  /ota/trip-requests/:id/components — Update full components array (already built)
POST /ota/trip-requests/:id/submit   — Submit + promote (already built)
GET  /ota/trip-requests/:id          — Get request details (already built)
```

---

## 7. Frontend Components

### Zustand Store: `useTripBasket`

```typescript
interface TripBasketState {
  requestId: string | null
  title: string | null
  components: TripRequestComponent[]
  inspirationCards: TripRequestComponent[]
  isLoading: boolean

  // Actions
  hydrate: () => Promise<void>         // Load from cookie/API on mount
  addComponent: (component) => Promise<void>
  removeComponent: (componentId) => Promise<void>
  reorderComponents: (ids) => Promise<void>
  setTitle: (title) => Promise<void>
  createDraft: (firstComponent) => Promise<string>  // Returns requestId
}
```

### New Pages
- `/my-trip/[id]/page.tsx` — Dream board page (requires identity)
- `/my-trip/[id]/share/page.tsx` — Read-only shared board (public)

### New Components (`apps/ota/src/components/trip-builder/`)
- `trip-basket-provider.tsx` — Context provider, hydrates from cookie on mount
- `add-to-trip-button.tsx` — Reusable button for search result cards
- `trip-picker-dropdown.tsx` — Multi-draft picker when consumer has multiple trips
- `dream-board.tsx` — Masonry grid container with drag-and-drop
- `board-card.tsx` — Single card (functional or inspiration) with hero image
- `board-add-menu.tsx` — Manual add buttons (+ Flight, + Hotel, etc.)
- `ai-suggestion-bar.tsx` — Mobile compact suggestion bar (top)
- `ai-chat-input.tsx` — Mobile chat input (bottom)
- `ai-panel.tsx` — Desktop slide-out AI panel
- `ai-suggestion-card.tsx` — Draggable suggestion card in AI panel
- `submit-review.tsx` — Submit flow review/confirm screen
- `share-button.tsx` — Generate and copy share link

### Modified Components
- `apps/ota/src/components/search/flight-result-card.tsx` — Add "Add to Trip" button
- `apps/ota/src/components/flights/flight-card.tsx` — Add "Add to Trip" button
- `apps/ota/src/components/chat/chat-widget.tsx` — Wire to trip basket context
- `apps/ota/src/components/layout/nav.tsx` — Trip indicator (component count badge)

---

## 8. Image Sourcing for Inspiration Cards

### Sources (in priority order)
1. **Enrichment cache** — Destination photos already cached from SerpAPI/TripAdvisor enrichment
2. **Unsplash API** — Search by destination name, pick top 4 landscape photos
3. **SerpAPI Images** — Google Images search for "{destination} travel" if Unsplash insufficient

### Attribution
- Unsplash requires attribution (photographer name + link) — store in `data.sourceId`
- Display attribution on card hover or in an info overlay
- SerpAPI/Google Images — display source URL

### Caching
- Cache inspiration images per destination in `OtaSearchCacheService` (24-hour TTL)
- Store as component in the trip's JSONB array (persisted with the trip)

---

## 9. Phase 3 Hooks (Not Built, But Prepared For)

The dream board architecture supports Phase 3 (full visual rendering) without changes:
- Functional cards already have `display.heroImage` fields
- Inspiration cards are already in the components array
- The masonry grid component can be reused for the published trip dream board
- The share feature provides the read-only rendering path
- The advisor's published trip snapshot can generate the same card shapes

---

## 10. Scope Summary

### Build Now (Phase 2)

| Feature | Description |
|---------|-------------|
| Trip basket Zustand store | Persistent draft trip across OTA pages |
| "Add to Trip" button | On all search result cards |
| Auto-create draft | First add creates trip, auto-titled from destination |
| Multi-draft picker | Choose which trip to add to |
| Cookie session tracking | Anonymous basket persistence |
| Dream board page | Masonry grid with hero image cards |
| Functional cards | Flight, hotel, cruise, tour with images and pricing |
| Inspiration cards | Destination imagery filler from Unsplash/SerpAPI |
| Drag and drop | Reorder cards, drag from AI panel |
| Manual add buttons | + Flight, + Hotel, + Cruise, + Tour, + Note |
| AI panel (desktop) | Slide-out panel, board resizes |
| AI mobile layout | Compact bar top + chat input bottom + expandable sheet |
| AI trip awareness | Context of current basket in AI prompts |
| AI identity capture | Name + email → CRM lookup → link contact |
| Submit flow | Review + confirm details + special requests |
| Share feature | Shareable read-only link for travel companions |
| Inspiration image sourcing | Unsplash + SerpAPI + enrichment cache |

### Deferred to Phase 3
- Published trip → dream board rendering on client portal
- Inspiration cards linked to bookable experiences
- Real-time advisor ↔ consumer collaboration
- Map view of trip components
- Timeline/calendar view of the trip
- Social sharing with rich previews (OG images)
