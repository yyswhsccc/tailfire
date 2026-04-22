# Unified Consumer Identity & Client Portal

**Goal:** Build a shared identity system and consumer portal that connects the OTA, Client Portal, and Tailfire into a synergetic platform — where consumers discover and dream on the OTA, manage their trips and documents in the portal, and every interaction flows back to the agent's CRM as prospecting intelligence.

**Business value:** Consumer browsing patterns and purchase signals visible to agents BEFORE the consumer becomes a client. Passport and document collection happens in the portal — no more chasing clients for paperwork. The three apps form a unified pipeline: OTA (discover) → Portal (plan, book, travel) → Tailfire (manage, fulfill).

---

## 1. The Three-App Architecture

```
OTA (discover, dream)  →  Client Portal (save, plan, book, travel)  →  Tailfire (manage, fulfill)
     │                           │                                           │
     └── browsing signals ───────┴── documents, payments ───────────────────┘
                    All flow back to the Contact Profile
```

- **OTA** (`phoenixvoyages.ca`) — Public storefront. Browse destinations, cruises, flights, hotels, tours. AI concierge. Dream board. Anonymous-first.
- **Client Portal** (`my.phoenixvoyages.ca`) — Authenticated consumer hub. Saved dream boards, trip proposals, itineraries, documents, passports/visas, payments, messaging. Pre-booking AND post-booking.
- **Tailfire CRM** (`tailfire.phoenixvoyages.ca`) — Agent back office. Contact profiles enriched with consumer browsing signals, AI conversation summaries, dream board snapshots. Agent pushes proposals, forms, documents to the portal.

All three apps share the same Supabase project and the same database.

---

## 2. Progressive Identity — The Identity Ladder

Consumers climb an identity ladder naturally through their interactions. No forced sign-up walls.

### Level 0: Anonymous
- OTA browsing, AI chat, searching
- Tracked by `ota_session` cookie (UUID, 30 days)
- Browsing signals: real-time page views + searches keyed by session

### Level 1: Email Captured
- **Triggers:** Save dream board, AI captures email, submit trip request
- Contact created in Tailfire CRM (`contactType = 'lead'`, `contactStatus = 'prospecting'`)
- Session signals retroactively linked to the contact via `sessionId → contactId` backfill
- Dream board persisted server-side, linked to contact
- Magic link email sent: "Access your saved trip ideas →"

### Level 2: Authenticated (Magic Link)
- **Triggers:** Consumer clicks magic link or "Sign in" on OTA/portal
- Supabase auth user created, `client_portal_users` record created
- `contacts.portalUserId` linked
- Full portal access: saved boards, account settings, traveler profiles, document uploads

### Level 3: Active Client
- **Triggers:** Agent promotes trip request → real trip in Tailfire
- `contactType` upgrades from `'lead'` to `'client'`
- Portal shows: trip proposals, itineraries, documents, payments, messaging
- Agent push notifications active

### Authentication Method
- **Now:** Magic link for first sign-up (just email, zero friction), optional password set in portal settings
- **Later (Phase 6):** Add Google/Apple social login

### Domain & Cookie Setup
- OTA: `phoenixvoyages.ca` (production), `ota-dev.phoenixvoyages.ca` (preview)
- Portal: `my.phoenixvoyages.ca` (production), `my-dev.phoenixvoyages.ca` (preview)
- Supabase auth cookies scoped to `.phoenixvoyages.ca` → valid across both apps
- "Sign In" link in OTA nav → routes to `my.phoenixvoyages.ca/login`
- Logo in portal nav → links back to `phoenixvoyages.ca`

---

## 3. Prospecting Intelligence Pipeline

How browsing signals and AI conversations flow from the OTA back to the Tailfire contact profile.

### Stream 1: Real-time signals (page views + searches)

Every entity page view and search action on the OTA gets recorded immediately.

```typescript
// Example event
{
  sessionId: "abc-123",
  contactId: null,           // backfilled when identity links
  event: "page_view",
  entityType: "destination",
  entitySlug: "santorini-greece",
  entityName: "Santorini",
  createdAt: "2026-04-22T14:30:00Z"
}
```

Before the consumer has an account, signals are keyed by `ota_session`. Once email is captured or account created, all signals for that session retroactively link to the `contactId`.

**Agent sees in Tailfire:** Activity feed on the contact profile — "Viewed Santorini 3 times this week", "Searched Caribbean cruises for November". Summarized into purchase signals, not raw click logs.

### Stream 2: AI conversation summaries (on action)

When a board is saved or a trip request is submitted, the AI conversation gets summarized into a structured insight.

```typescript
{
  contactId: "xyz-789",
  type: "ai_conversation_summary",
  summary: "Discussed honeymoon options for November. Interested in Caribbean
            and Mediterranean. Couple, mid-range budget. Saved 1 Royal Caribbean sailing.",
  facts: { destination: "Caribbean", dates: "Nov 2026", travelers: "couple",
           budget: "mid-range", style: "honeymoon" },
  messageCount: 12,
  toolsUsed: ["lookupDestination", "searchCruises", "manageTripBasket"]
}
```

**How generated:** `extractConversationFacts()` (already built) provides structured facts. Summary text generated by a lightweight LLM call (Claude Haiku) with the conversation as input.

### What agents see in Tailfire

New **"Consumer Insights"** section on the contact profile:
- **Activity heatmap** — which destinations/cruise lines they've viewed most
- **Purchase signals** — "High intent: searched Caribbean cruises 3 times, saved 1 to board"
- **AI conversation summaries** — each session's digest with extracted facts
- **Dream board snapshot** — what's currently on their board
- **Timeline** — chronological feed of all activity

---

## 4. Shared UI Architecture

### Brand Consistency
Both OTA and Client Portal use the same Phoenix Voyages brand:
- Dark nav header (#1A1A1A) with gold accent (#C59746)
- Phoenix Voyages gold phoenix bird logo
- Same fonts (Geist Sans/Mono), same card styles, same interactions
- Both import from `packages/ui-public`

### Navigation

**OTA nav:** Logo + browse categories (Offers, Cruises, Destinations, Flights, Hotels, Tours, Advisors) + "Talk to AI" button + "Sign In" link

**Portal nav:** Logo + account sections (My Board, My Trips, Messages, Documents, Payments) + "Browse Trips ↗" link back to OTA + user avatar/dropdown

### Shared UI Package — `packages/ui-public`

```
packages/ui-public/
├── components/nav/     ← Dark nav bar (OTA vs Portal mode prop)
├── components/cards/   ← ImageCardFrame, product cards, board cards
├── components/auth/    ← Email capture modal, magic link, sign-in form
├── theme/              ← Colors, fonts, design tokens
├── hooks/              ← useConsumerAuth, useConsumerSession
```

---

## 5. Client Portal — Page Architecture

The rebuilt `apps/client` is the consumer's personal travel hub across the full trip lifecycle.

### Pages

```
my.phoenixvoyages.ca/
├── /                        → Dashboard (personalized, adaptive to journey stage)
├── /board                   → Dream Board (saved from OTA, drag-drop, Pinterest-style)
├── /board/[id]              → Specific board (consumers can have multiple)
├── /trips                   → My Trips (requested, booked, traveling, past)
├── /trips/[id]              → Trip Detail (itinerary, bookings, documents)
├── /trips/[id]/proposal     → Agent's proposal (review + approve)
├── /trips/[id]/itinerary    → Day-by-day itinerary (traveling mode)
├── /messages                → Messages with advisor
├── /documents               → Travel Documents hub
├── /documents/passports     → Passport management (upload, OCR, expiry tracking)
├── /documents/visas         → Visa tracking (status, requirements by destination)
├── /documents/trip/[id]     → Trip-specific docs (contracts, receipts, confirmations)
├── /payments                → Payment history + upcoming payments
├── /travelers               → Traveler profiles (personal info, preferences, TSA)
├── /settings                → Account settings, password, preferences
├── /login                   → Magic link + password sign-in
└── /invite/[token]          → Accept invite from agent (first-time setup)
```

### Dashboard — Adaptive to Journey Stage

**Prospect (no trips):** Dream board preview, "Continue exploring" → OTA, travel preferences prompt.

**Planning (trip requested):** Trip request status, dream board, message thread with advisor.

**Booked (trip confirmed):** Countdown to trip, key dates (final payment, check-in), documents to review, outstanding payments, traveler profiles to complete.

**Traveling (during trip):** Today's itinerary, booking confirmations, emergency contacts, flight status.

**Returned (post-trip):** Trip summary, review prompt, "Plan your next trip" → OTA.

### Documents Section

Full document hub synced with Tailfire:

- **Passports** — Upload scan/photo, OCR extracts name + number + expiry, flags upcoming expirations, syncs to contact passport fields in Tailfire CRM
- **Visas** — Track visa status per destination, upload documents, agent marks requirements as met
- **Insurance** — Upload travel insurance docs
- **Trip documents** — Contracts, invoices, booking confirmations pushed from agent via Tailfire

Everything uploaded syncs to the contact record in Tailfire + stored in R2 (existing storage system). Agent sees documents immediately in the CRM.

---

## 6. Data Flows

### Five primary flows

| Flow | Trigger | Data | Destination |
|------|---------|------|-------------|
| **Real-time signals** | Every OTA page view + search | Event log (entity, type, timestamp) | `consumer_activity` → Tailfire contact insights |
| **AI summaries** | Board save, trip submit | Conversation digest + structured facts | `consumer_insights` → Tailfire contact timeline |
| **Board persistence** | Consumer saves board or creates account | Board components, inspiration cards | `ota_trip_requests` → Portal board view + Tailfire snapshot |
| **Document upload** | Consumer uploads passport/visa/doc in portal | File → R2 storage, metadata → contact fields | R2 + `contacts` passport fields → Tailfire CRM sees immediately |
| **Agent push** | Agent creates proposal/form/doc in Tailfire | Trip proposal, documents, forms | Portal notification → consumer sees in portal + gets email |

### Identity-keyed backfill

When a consumer goes from anonymous (Level 0) to email captured (Level 1):
1. All `consumer_activity` rows with their `sessionId` get `contactId` backfilled
2. Dream board (`ota_trip_requests`) gets `contactId` linked
3. Any AI conversation summaries from the session get attached to the contact
4. Agent immediately sees the full browsing history on the contact profile — retroactively

---

## 7. Database Changes

### New table: `consumer_activity`

Append-only event log for browsing signals.

```sql
consumer_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id),
  event TEXT NOT NULL,                    -- 'page_view', 'search', 'ai_chat_start', 'board_save'
  entity_type TEXT,                       -- 'destination', 'ship', 'cruise_line', etc.
  entity_slug TEXT,
  entity_name TEXT,
  search_query JSONB,                    -- { destination, dates, cruiseLine, resultCount }
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

Indexes: `session_id`, `contact_id`, `created_at`.

### New table: `consumer_insights`

AI conversation summaries and purchase signals attached to contacts.

```sql
consumer_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  type TEXT NOT NULL,                    -- 'ai_conversation_summary', 'purchase_signal', 'browsing_pattern'
  summary TEXT,                          -- human-readable digest
  facts JSONB,                           -- structured extracted facts
  metadata JSONB,                        -- messageCount, toolsUsed, sessionDuration
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

### Extended: `client_portal_users`

Add one field:
- `auth_method TEXT DEFAULT 'magic_link'` — tracks 'magic_link', 'password', 'google', 'apple'

### No changes needed to:
- `contacts` — existing passport fields, `portalUserId`, `contactType`/`contactStatus` lifecycle enums, `portalInvitedAt`/`portalActivatedAt` all already exist
- `ota_trip_requests` — existing `sessionId`, `contactId`, `components`, `status` fields cover dream board persistence
- `ota_referrals` — existing attribution system works as-is

---

## 8. Implementation Phasing

Each phase delivers working value independently.

### Phase 1: Progressive Identity + Auth Foundation
- Supabase auth for consumers (magic link flow)
- Email capture modal on OTA (save board / submit trip triggers it)
- `client_portal_users` creation on email capture
- Shared auth cookies across `.phoenixvoyages.ca`
- Portal shell: login page, dashboard skeleton, dark nav with Phoenix Voyages brand
- Shared `packages/ui-public` nav component (OTA + Portal mode)

### Phase 2: Dream Board Persistence + Portal Core
- Dream board migrates from anonymous session to authenticated storage on account creation
- Portal pages: dashboard, `/board`, `/settings`, `/travelers`
- Traveler profile management (syncs to contact in Tailfire)
- "Sign In" / "My Account" in OTA nav → portal

### Phase 3: Prospecting Intelligence Pipeline
- `consumer_activity` table + real-time event capture from OTA
- Session-to-contact backfill when identity links
- AI conversation summarization on board save / trip submit
- Tailfire CRM: "Consumer Insights" section on contact profile
- Purchase signal aggregation

### Phase 4: Documents + Passport Management
- Portal `/documents` section (passports, visas, insurance, trip docs)
- Passport upload with OCR (extract name, number, expiry)
- R2 storage integration (existing)
- Sync to contact passport fields in Tailfire
- Agent-pushed documents appear in portal

### Phase 5: Full Portal Experience
- Portal: `/trips`, `/trips/[id]`, `/trips/[id]/proposal`, `/trips/[id]/itinerary`
- `/messages` — messaging with advisor
- `/payments` — payment history + upcoming
- Agent push: Tailfire proposal → portal notification → consumer reviews
- Traveling mode: day-by-day itinerary, booking details

### Phase 6: Visual Polish + Social Login
- Phoenix Voyages golden hour brand polish across portal
- Dashboard adaptive states (prospect → planning → booked → traveling → returned)
- Mobile-responsive polish
- Social login (Google/Apple)

---

## Scope

### Build now (Phases 1-2)
- Progressive identity system (magic link)
- Consumer auth across OTA + Portal
- Portal shell with nav, login, dashboard, board, settings, travelers
- Dream board persistence
- Shared UI package extension

### Build next (Phases 3-4)
- Browsing signal pipeline
- AI conversation summaries
- Consumer insights on Tailfire contact profile
- Document/passport management in portal

### Build later (Phases 5-6)
- Full trip experience in portal (proposals, itineraries, payments, messaging)
- Agent push flow
- Social login
- Brand polish
