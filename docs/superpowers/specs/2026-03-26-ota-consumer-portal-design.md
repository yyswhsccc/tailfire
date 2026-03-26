# OTA Consumer Portal — Design Specification

**Date:** 2026-03-26
**Status:** Draft
**Author:** Claude + Alex Guertin

## Overview

A consumer-facing Online Travel Agency (OTA) where customers can browse travel products, interact with an AI concierge, and connect with Travel Advisors. The OTA leverages existing Tailfire API capabilities (Amadeus, Traveltek, Globus), the TravelLeaders Network advisor profiles, and an AI-powered discovery experience.

**Business model:** Hybrid self-serve + agent-assisted. Consumers can search and discover travel products. For API-backed products (cruises, flights, hotels), self-serve booking will be added in Phase 2. Tours and assembled packages route to an advisor. Phoenix Voyages is rarely the merchant of record — suppliers process payments.

**Phase 1 (MVP) scope:**
- Search & browse all product types
- AI Concierge (conversational travel assistant)
- Agent handoff (route to advisor)
- Soft lead capture (AI captures email/name, creates Contact in Tailfire CRM)
- Advisor micro-sites (TLN-synced profiles, curated deals, published trip templates)
- Deals & landing pages (rebuilt from WordPress, fed by existing VPS scraper)

**Deferred to Phase 2:**
- Self-serve booking with supplier payment flows
- Consumer authentication / accounts
- My Trips / Client Portal integration
- All-inclusives catalog (scraping/importing package providers)

---

## 1. Application Architecture

**App:** `apps/ota` — Next.js 15.x (App Router), deployed on Vercel. Upgrade to Next.js 16 is a separate decision and not in scope for this spec.
**API:** `apps/api` — NestJS, existing, deployed on Railway
**Relationship:** OTA is a standalone Next.js app in the monorepo. It communicates with the NestJS API via HTTP. No shared runtime — only shared packages (`@tailfire/shared-types`, `@tailfire/ui-public`, `@tailfire/trip-proposal-ui`).

### Route Structure

```
app/
├── (marketing)/                        # Public marketing pages
│   ├── page.tsx                        # Homepage — hero, value prop, search entry, AI CTA
│   ├── about/page.tsx                  # About Phoenix Voyages
│   ├── contact/page.tsx                # Contact form
│   ├── terms/page.tsx                  # Terms of service
│   └── privacy/page.tsx               # Privacy policy
│
├── deals/                              # Deals landing pages
│   ├── page.tsx                        # All deals listing (filterable)
│   └── [slug]/page.tsx                 # Individual deal page
│
├── search/                             # Product search pages
│   ├── flights/page.tsx                # Amadeus flight search
│   ├── hotels/page.tsx                 # Amadeus hotel search
│   ├── cars/page.tsx                   # DEFERRED to Phase 2 (no Amadeus car provider exists)
│   ├── cruises/page.tsx                # Traveltek cruise search
│   ├── tours/page.tsx                  # Globus tour catalog browse
│   └── all-inclusives/page.tsx         # Softvoyage iframe embed
│
├── advisor/                            # Advisor micro-sites
│   └── [slug]/                         # Dynamic advisor pages
│       ├── page.tsx                    # Profile (TLN-synced), specialties, AI CTA
│       ├── deals/page.tsx              # Advisor-curated deals
│       └── trips/page.tsx              # Published trip templates
│           └── [tripSlug]/page.tsx     # Individual trip showcase
│
├── advisors/page.tsx                   # Advisor directory (search/filter)
│
├── api/                                # OTA-side API routes
│   ├── chat/route.ts                   # AI Concierge endpoint
│   └── lead/route.ts                   # Lead capture endpoint
│
└── layout.tsx                          # Root layout — nav, footer, AI concierge widget
```

### Data Flow

- **Server Components** fetch from `apps/api` (NestJS) for search results, advisor data, deals, tours
- **AI Concierge** is a client-side chat widget (`useChat` from `@ai-sdk/react`) that talks to `app/api/chat/route.ts`, which uses AI SDK tools to call the NestJS API
- **Referral tracking:** `?ref=advisor-slug` or landing on `/advisor/[slug]` sets a cookie; all lead captures include the referring advisor

### Rendering Strategies

| Route | Strategy | Rationale |
|-------|----------|-----------|
| Homepage, About, Terms, Privacy | SSG | Static content, maximum performance |
| Deals listing, Deal pages | ISR (revalidate on publish) | Changes when deals are added/updated |
| Search results | SSR with Streaming | Fresh per-query, Suspense for progressive loading |
| Advisor micro-sites | ISR (revalidate on profile update) | Semi-static, changes when advisor edits profile |
| Advisor trip showcases | ISR (revalidate on publish/unpublish) | Changes when advisor publishes/unpublishes trips |
| Advisor directory | ISR | Changes when advisors are added/removed |

---

## 2. AI Concierge

### Tech Stack

- AI SDK v6 `streamText` + `useChat` (client)
- AI Gateway with OIDC auth — `model: 'anthropic/claude-sonnet-4.6'`
- AI Elements for message rendering (`<Message>`, `<MessageResponse>`)
- Tools that call the NestJS API (server-to-server)

### Tools

| Tool | API Source | Data Quality | Consumer Action |
|------|-----------|-------------|-----------------|
| `searchFlights` | Amadeus | Real-time | "Inquire" (Phase 1), Book (Phase 2) |
| `searchHotels` | Amadeus | Real-time | "Inquire" (Phase 1), Book (Phase 2) |
| `searchCars` | DEFERRED — no Amadeus car provider exists | — | Phase 2 |
| `searchCruises` | cruise-repository (DB catalog) + FusionAPI (live pricing/availability) | Real-time pricing | "Inquire" (Phase 1), FusionAPI booking (Phase 2) |
| `browseTours` | Globus catalog (DB) | Catalog data | "Request Quote from Advisor" |
| `assemblePackage` | Amadeus flights + hotels | Estimated pricing | "Connect with Advisor to finalize" |
| `lookupDestination` | DB + enrichment APIs | Library data | Informational |
| `captureContact` | Tailfire CRM | Lead creation | Soft capture during conversation |
| `requestAdvisor` | Lead routing | Agent handoff | Connect to human advisor |

### Conversation Behavior

- **Persistent widget:** Floating chat button on all pages (bottom-right), expands to side panel. Full-screen on mobile.
- **Session persistence:** Conversation stored in localStorage, persists across page navigations within session.
- **Advisor context:** On advisor micro-site pages, the system prompt includes the advisor's name, specialties, and destinations. Lead capture auto-assigns to that advisor.
- **Referral awareness:** The referral cookie value is passed as context to the AI so it knows which advisor (if any) is associated with the session.
- **All-inclusive handling:** AI assembles a pseudo-package (flight + hotel from Amadeus), labels it as "estimated package price," and escalates to an advisor for actual booking. Can also suggest the Softvoyage widget for pre-built packages.

### Server Route

`app/api/chat/route.ts`:
- Receives `UIMessage[]` from `useChat`
- `convertToModelMessages()` → `streamText()` with tools → `toUIMessageStreamResponse()`
- Tools make authenticated server-to-server calls to `api.tailfire.ca`
- Reads referral cookie from request context for attribution

---

## 3. Advisor Micro-Sites

### TLN Profile Sync

Advisors enter their TravelLeaders Network profile URL in the Tailfire admin (e.g., `https://www.travelleaders.com/agent/388887`). Tailfire scrapes the TLN page and populates the advisor's OTA profile.

**Data available from TLN profiles:**

| Field | Source |
|-------|--------|
| Name, Title | TLN |
| Photo | TLN (direct image URL via agent ID) |
| Bio | TLN (full rich text) |
| Specialties | TLN (e.g., "Cruises", "LGBTQ+ Travel") |
| Certifications | TLN |
| Languages | TLN |
| Destinations | TLN |
| Reviews | TLN (rating + text + author) |

**Sync flow:**
1. Agent enters TLN URL in admin settings
2. API scrapes TLN page, extracts structured data
3. Data stored in `advisor_profiles` (synced fields are read-only)
4. Periodic re-sync via cron job or manual trigger
5. Agent manages OTA-specific additions in admin (deals, published trips, social links)

**Single source of truth:** TLN is authoritative for profile content. Agent maintains ONE profile (TLN), gets TWO presences (TLN + OTA micro-site).

### Published Trip Templates

Advisors can publish trip templates from the Tailfire Library to their micro-site:

1. Advisor creates a Trip in Tailfire, builds the itinerary
2. Saves as Template (existing Library feature)
3. Goes to Library → selects template → "Publish to My OTA Profile"
4. Trip appears on `/advisor/[slug]/trips/[tripSlug]`

**Publish types (flexible, not just "hosted"):**

| Type | Badge | Use Case |
|------|-------|----------|
| `hosted` | "Hosted by [Name]" | Group trips the advisor is organizing |
| `featured` | "[Name]'s Pick" | Trips the advisor recommends |
| `recommended` | "Recommended" | General recommendations |
| `custom` | Advisor's headline | Any other framing |

**Trip showcase page renders:**
- Hero image + trip title
- Advisor badge (hosted/featured/recommended/custom)
- Trip overview (dates, duration, highlights)
- Day-by-day itinerary highlights (from `itinerary_days`)
- Key activities (from `itinerary_activities`)
- Starting price (from `activity_pricing`)
- AI concierge CTA pre-configured for this advisor
- "Inquire About This Trip" lead capture

The `@tailfire/trip-proposal-ui` shared package can be adapted for public-facing trip rendering.

### Advisor Directory

`/advisors` — browse all published advisors with filters:
- By specialty (Cruises, Luxury, Adventure, etc.)
- By language
- By destination expertise

---

## 4. Attribution System

### Referral Tracking

When a consumer lands on an advisor's micro-site or follows an advisor's referral link, attribution is tracked via a cookie:

- **Cookie:** `ota_ref=advisor-slug; max-age=2592000 (30 days); path=/; domain=ota.phoenixvoyages.ca`
- **Set by:** `middleware.ts` (existing at `apps/ota/src/middleware.ts`) on any `/advisor/[slug]` page load or `?ref=slug` parameter
- **Persists:** Across all OTA pages for 30 days

### Attribution Priority Chain

When a lead is captured (email provided via AI concierge or form):

```
1. CRM ownership (existing Contact with assigned agent)        — highest
2. Referral cookie (advisor micro-site visit within 30 days)
3. Round-robin / agency default assignment                     — lowest
```

**Scenarios:**
- Agent shares micro-site link → prospect navigates to search → books → **attributed to agent** (cookie persists)
- Prospect visits micro-site → returns weeks later via main site → **attributed to agent** (if within 30-day cookie window)
- Consumer books on site, already exists in CRM with an agent → **CRM ownership wins** (agent can't "steal" another's client)
- Brand new consumer, no referral → **round-robin assignment**

### Data Model

```sql
ota_referrals
├── id                    UUID PK
├── sessionId             TEXT — anonymous session ID from referral cookie (no browser fingerprinting)
├── advisorSlug           TEXT — referring advisor
├── landingUrl            TEXT — where they first landed
├── referralSource        TEXT — "microsite" | "direct_link" | "deal_share"
├── cookieExpiry          TIMESTAMP
├── convertedToContactId  UUID FK → contacts (NULL until lead captured)
├── agencyId              UUID FK → agencies
├── createdAt             TIMESTAMP
```

**Privacy note:** No browser fingerprinting is used. Attribution relies solely on a first-party cookie with an anonymous session ID (UUID). This avoids GDPR/PIPEDA/Quebec Law 25 consent requirements for fingerprinting while achieving the same attribution goal.

---

## 5. Deals System

### Architecture

The `deals` table is an **agency-wide library** in the Tailfire DB. Three sources write to it:

```
VPS Scraper (existing) → POST /api/v1/deals → deals table
Admin dashboard (manual) ──────────────────→ deals table
                                                  ↓
                                    OTA reads ← deals table → Email marketing
                                                  ↓
                                    Advisors curate for micro-sites
```

### Existing Scraper Integration

The current automation on the VPS periodically fetches deals from TLN and supplier feeds. Instead of migrating this system, it simply writes to a new authenticated API endpoint:

- `POST /api/v1/deals` — service-to-service auth token for VPS scraper
- Scraper sends normalized deal data
- API upserts into `deals` table (dedup by external source + external ID)

### Consumer Experience

- `/deals` → all published agency deals, filterable by destination, product type, price range
- `/deals/[slug]` → individual deal landing page (marketing-optimized)
- `/advisor/[slug]/deals` → advisor's curated subset from the shared pool

**Deal pages are marketing-optimized landing pages:**
- Hero image + headline + price anchor
- Rich description, key details, what's included
- Related advisor (if advisor-specific)
- AI concierge CTA: "Ask about this deal"
- Lead capture: "Get notified" / "Inquire"
- SEO metadata + OG image generation for social sharing

### Advisor Curation

Advisors don't create deals — they **curate from the shared pool**. In the admin dashboard, advisors select which deals to feature on their micro-site. The same deal can appear on multiple advisor micro-sites.

---

## 6. Search Pages

Each product type gets a dedicated search page wrapping the real API:

| Route | API | Filters |
|-------|-----|---------|
| `/search/cruises` | cruise-repository (DB catalog) + FusionAPI (live pricing) | Text, line, ship, region, ports, dates, nights, price, cabin category |
| `/search/flights` | Amadeus (needs public facade + airport-lookup endpoint) | Origin, destination, dates, passengers, class |
| `/search/hotels` | Amadeus (needs public facade) | Destination, dates, guests |
| `/search/tours` | tour-repository (DB catalog, already public) + Globus live proxy | Keyword, operator, season, duration |
| `/search/all-inclusives` | Softvoyage iframe | Embedded widget as-is |

**Deferred to Phase 2:** `/search/cars` — no Amadeus car rental provider exists, must be built.
| `/search/all-inclusives` | Softvoyage iframe | Embedded widget as-is |

### Search UX

- Results render as Server Components with Streaming (Suspense skeletons while APIs resolve)
- Product cards with key info + pricing
- "Ask the AI about this" button on each card (opens concierge with product context)
- For tours: "Request Quote from Advisor" instead of price
- **No booking in Phase 1** — all CTAs are "Inquire" or "Ask AI"

---

## 7. Data Model Changes

### New Tables

**`advisor_profiles`**

**Relationship to `user_profiles`:** The existing `user_profiles` table stores internal agent settings (agency membership, role, avatarUrl, bio, socialMediaLinks, isPublicProfile). `advisor_profiles` is a new public-facing table specifically for OTA micro-sites, linked to the same user via `userId`. The existing `user_profiles.isPublicProfile` boolean is unrelated — it controls internal directory visibility, not OTA publishing. Fields like `bio` and `socialMediaLinks` on `user_profiles` remain for admin-internal use; `advisor_profiles` holds the TLN-synced public version. One user can have a `user_profile` without an `advisor_profile` (agents who don't participate in the OTA).

```
id                    UUID PK
userId                UUID FK → users (same user as user_profiles.userId)
agencyId              UUID FK → agencies
slug                  TEXT UNIQUE — URL-safe, auto-generated, editable
tlnProfileUrl         TEXT — e.g., "https://www.travelleaders.com/agent/388887"
tlnAgentId            TEXT — "388887" (extracted from URL)
tlnLastSyncedAt       TIMESTAMP

-- Synced from TLN (read-only, populated by scraper)
displayName           TEXT
title                 TEXT
bio                   TEXT
photoUrl              TEXT
specialties           TEXT[]
certifications        TEXT[]
languages             TEXT[]
destinations          TEXT[]
reviews               JSONB — [{rating, text, author}]

-- OTA-specific (agent manages in admin)
bioSupplement         TEXT — additional OTA-specific bio (optional)
socialLinks           JSONB — {instagram, linkedin, facebook}
isPublished           BOOLEAN DEFAULT false
-- Featured deals managed via advisor_featured_deals join table
createdAt             TIMESTAMP
updatedAt             TIMESTAMP
```

**`deals`**
```
id                    UUID PK
agencyId              UUID FK → agencies
slug                  TEXT UNIQUE
externalSource        TEXT — "tln" | "supplier_name" | "manual"
externalId            TEXT — source-specific ID for dedup
title                 TEXT
description           TEXT — rich text / markdown
heroImageUrl          TEXT
productType           TEXT — "flight" | "cruise" | "tour" | "hotel" | "package"
pricing               JSONB — {fromPriceCents, currency, priceNote, originalPriceCents}
validFrom             DATE
validUntil            DATE
destinations          TEXT[]
supplierName          TEXT
isPublished           BOOLEAN DEFAULT false
seoMeta               JSONB — {title, description, ogImage}
createdAt             TIMESTAMP
updatedAt             TIMESTAMP
```

**`advisor_featured_deals`** (join table — replaces UUID[] array for queryability)
```
advisorProfileId      UUID FK → advisor_profiles
dealId                UUID FK → deals
sortOrder             INT — display order on advisor's micro-site
createdAt             TIMESTAMP
PRIMARY KEY (advisorProfileId, dealId)
```

**`ota_referrals`**
```
id                    UUID PK
sessionId             TEXT — anonymous session ID from cookie
advisorSlug           TEXT
landingUrl            TEXT
referralSource        TEXT — "microsite" | "direct_link" | "deal_share"
cookieExpiry          TIMESTAMP
convertedToContactId  UUID FK → contacts (nullable)
agencyId              UUID FK → agencies
createdAt             TIMESTAMP
```

### Existing Table Modifications

**`ota_published_trips`** (NEW — separate publication table, not columns on `itinerary_templates`)

`itinerary_templates` stores templates as a JSON payload blob, not a relational graph of itinerary_days/activity_pricing. Adding OTA columns directly onto it would conflate template storage with publication metadata, and prevent multiple advisors from publishing the same template.

Instead, a separate publication table references the template and stores a rendered snapshot + OTA metadata. This follows the same pattern as the existing trip sharing system (`trips.controller.ts` share tokens).

```
id                    UUID PK
agencyId              UUID FK → agencies
templateId            UUID FK → itinerary_templates
advisorProfileId      UUID FK → advisor_profiles
slug                  TEXT UNIQUE — URL-friendly slug for the trip showcase page
publishType           TEXT — "hosted" | "featured" | "recommended" | "custom"
headline              TEXT — advisor-written tagline
callToAction          TEXT — custom CTA label (default: "Inquire About This Trip")
renderedSnapshot      JSONB — snapshot of template data at publish time (itinerary, activities, pricing)
heroImageUrl          TEXT
isPublished           BOOLEAN DEFAULT true
createdAt             TIMESTAMP
updatedAt             TIMESTAMP
```

This allows:
- Multiple advisors publishing the same template with different headlines/types
- Snapshot isolation (published view doesn't change when template is edited, until re-published)
- Clean separation of Library concerns from OTA concerns

---

## 8. New API Endpoints (NestJS)

### Deals Module
- `GET /api/v1/deals` — list published deals (filterable, paginated)
- `GET /api/v1/deals/:slug` — single deal by slug
- `POST /api/v1/deals` — create deal (admin + VPS scraper, service auth)
- `PUT /api/v1/deals/:id` — update deal (admin)
- `DELETE /api/v1/deals/:id` — delete deal (admin)

### Advisor Profiles Module
- `GET /api/v1/advisor-profiles` — list published advisors (public, for OTA)
- `GET /api/v1/advisor-profiles/:slug` — single advisor by slug (public)
- `POST /api/v1/advisor-profiles` — create profile (admin)
- `PUT /api/v1/advisor-profiles/:id` — update profile (admin)
- `POST /api/v1/advisor-profiles/:id/sync-tln` — trigger TLN profile scrape
- `GET /api/v1/advisor-profiles/:slug/deals` — advisor's curated deals
- `GET /api/v1/advisor-profiles/:slug/trips` — advisor's published trip templates

### Lead Capture
- `POST /api/v1/ota/leads` — create or match Contact, apply attribution logic
- `POST /api/v1/ota/referrals` — log referral visit

### OTA Published Trips
- `POST /api/v1/ota/published-trips` — publish a template to advisor's micro-site (creates snapshot)
- `PUT /api/v1/ota/published-trips/:id` — update publication metadata (headline, type, CTA)
- `POST /api/v1/ota/published-trips/:id/refresh` — re-snapshot from current template data
- `DELETE /api/v1/ota/published-trips/:id` — unpublish
- `GET /api/v1/ota/published-trips/:slug` — public: get published trip by slug

---

## 9. Authentication & API Access

The OTA has no consumer authentication in Phase 1. API access uses a tiered model:

### Public Endpoints (no auth required)

The OTA Server Components call the NestJS API server-to-server. Some endpoints already exist with public access:

**Already public (via `x-catalog-api-key` or dual JWT/key auth):**
- `GET /api/v1/cruise-repository/*` — full cruise catalog search/filter (sailing-search DTO)
- `GET /api/v1/tour-repository/*` — tour catalog browse/search/detail/departures
- `GET /api/v1/globus/*` — live Globus proxy (keyword search, departures, pricing, travel styles)

**New endpoints needed (read-only, `@Public()` or service-key auth):**
- `GET /api/v1/deals` and `GET /api/v1/deals/:slug` — deals library
- `GET /api/v1/advisor-profiles` and `GET /api/v1/advisor-profiles/:slug` — advisor directory
- `GET /api/v1/advisor-profiles/:slug/deals` — advisor's curated deals
- `GET /api/v1/advisor-profiles/:slug/trips` — advisor's published trip templates
- `GET /api/v1/ota/flights/search` — public facade wrapping existing Amadeus flight provider
- `GET /api/v1/ota/flights/airports` — public airport lookup (AeroDataBox data, currently admin-only)
- `GET /api/v1/ota/hotels/search` — public facade wrapping Amadeus hotel provider
- `GET /api/v1/ota/published-trips/:slug` — single published trip snapshot

### Service-to-Service Endpoints (internal API key)

The OTA's API routes (`app/api/chat/route.ts`, `app/api/lead/route.ts`) call the NestJS API with a service token:
- `POST /api/v1/ota/leads` — lead capture with attribution
- `POST /api/v1/ota/referrals` — referral logging
- Search endpoints that require Amadeus/Traveltek credentials

Auth: `x-ota-service-key` header with a shared secret stored in Doppler (`OTA_SERVICE_KEY`).

### VPS Scraper Endpoints (service auth)

- `POST /api/v1/deals` — deal ingestion from VPS scraper
- Auth: `x-internal-api-key` header (existing pattern, same as cruise-import)

### CORS Configuration

The NestJS API must allow requests from `ota.phoenixvoyages.ca` (production) and `localhost:3103` (local dev). However, since most OTA-to-API calls happen server-side (Server Components and API routes), CORS is only needed for any direct client-side fetches (e.g., search autocomplete). Configure CORS in the API's `main.ts` to include OTA origins.

### AI Concierge Rate Limiting

The `app/api/chat/route.ts` endpoint streams AI responses to unauthenticated users. To prevent abuse:
- Per-IP rate limiting via middleware (e.g., `@upstash/ratelimit` or Vercel Edge)
- Max 20 messages per session (stored in cookie/localStorage)
- Session-based anonymous token (UUID) required for chat API calls

---

## 10. UI Design Decisions

**Design approach:** Mobile-first, light background, Phoenix Voyages brand system.

### Brand Palette (from Brand Guidelines PDF)

| Token | Hex | Usage |
|-------|-----|-------|
| Phoenix Gold | `#C59746` | Primary accent, CTAs, supplier labels, links |
| Deep Charcoal | `#1A1A1A` | Text, headers, dark card headers, nav elements |
| Ember Red | `#B33939` | Urgency badges (HOT DEAL), savings callouts |
| Ash Gray | `#E0E0E0` | Borders, dividers |
| Pure White | `#FFFFFF` | Page backgrounds |
| Warm Ivory | `#faf6f0` | Callout cards, bio sections, warm emphasis |
| Golden Hour Orange | `#E89E4A` | Warm overlays, gradient accents |

### Typography

| Style | Font | Usage |
|-------|------|-------|
| Titles | Cinzel Bold (ALL CAPS) | Page titles, section headers, hero text |
| Subtitles | Cinzel Decorative | Taglines, sub-headings |
| Body | Lato | All body text, descriptions, UI labels |

### Screen-by-Screen Decisions

**Homepage (Mobile):** Hybrid AI-first layout. Light background. AI chat input ("Tell me about your dream trip...") as primary CTA. Below: "or search directly" divider with 2x2 product category grid (Flights, Cruises, Hotels, Tours). Featured deal teaser card at bottom. Tagline: "Discover, Soar, Repeat". Trust bar: "AI-Powered / Advisor-Backed / TICO Licensed".

**AI Concierge Chat:** Clean minimal, light background (consistent with homepage). Full-screen mobile overlay. Dark header bar with Phoenix AI branding. White chat bubbles on light gray (`#fafafa`). Product results as inline cards within conversation flow. Suggestion chips for quick starts. Input bar anchored at bottom.

**Search Results (Cruises/Flights/Hotels):** Two-tone cruise cards — branded dark gradient header (cruise line, ship name, price) + white detail section (dates, ports as pills). Compact, info-dense — maximizes results per scroll. Sort chips (horizontal scroll). Floating AI button bottom-right. No hero images on result cards.

**Advisor Micro-Site Profile:** Full light, scrolling sections. Profile card (avatar, name, title, stars, specialties). Warm bio card (`#faf6f0` background). Horizontal scrolling destination expertise cards. Sections for deals, trips, reviews. Dual CTAs: "Contact [Name]" + "Ask AI". Consistent with homepage — feels like a natural extension.

**Deals Listing (`/deals`):** Magazine-style grid. Featured deal large at top (hero image area, HOT DEAL badge in Ember Red, strikethrough price, save percentage). Below: 2-column compact tile grid. Filter chips (All, Cruises, Flights, Tours, Hotels). Deep Charcoal placeholders where real destination photos will go.

**Deal Landing Page (`/deals/[slug]`):** Marketing-optimized. Golden hour hero gradient with title overlay. Floating price card overlapping hero (price + savings + Inquire CTA). Quick fact pills (duration, dates, departure port). Description, port pills, dual CTAs ("Ask AI About This" + "Talk to Advisor"). Validity notice at bottom. Optimized for social sharing (OG image generation).

**Advisor Deals (`/advisor/[slug]/deals`):** Same `DealCard` component as main `/deals`, but with advisor personalization wrapper: context bar (avatar + "[Name]'s Picks"), "Jane's Pick" badge on cards, "Ask Jane's AI" instead of generic AI CTA, advisor contact CTA at bottom.

### Reusable Components

| Component | Used On |
|-----------|---------|
| `DealCard` | `/deals`, `/advisor/[slug]/deals`, homepage featured deal |
| `CruiseResultCard` | `/search/cruises`, AI chat inline results |
| `FlightResultCard` | `/search/flights`, AI chat inline results |
| `HotelResultCard` | `/search/hotels`, AI chat inline results |
| `AdvisorCard` | `/advisors` directory, advisor context bars |
| `ChatWidget` | All pages (floating button), full-screen on tap |
| `ProductGrid` | Homepage (2x2 category grid) |
| `FilterChips` | Search results, deals listing |
| `PortPills` | Cruise results, deal pages |

### Mockups Reference

HTML mockups saved in `.superpowers/brainstorm/` directories for implementation reference.

---

## 11. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 15.x (App Router) | Existing monorepo pattern, SSR + SSG + ISR flexibility |
| Deployment | Vercel | CDN-optimized for public traffic, ISR support |
| AI | AI SDK v6 + AI Gateway (OIDC) | Unified provider routing, cost tracking, no API keys |
| AI Model | `anthropic/claude-sonnet-4.6` | Strong reasoning for travel recommendations |
| UI | shadcn/ui + Tailwind CSS | Component primitives, theming via CSS variables |
| Chat UI | AI Elements | Production-ready message rendering, handles streaming |
| State | TanStack React Query | Consistent with admin/client apps |
| Auth (Phase 2) | Supabase (portal-style) | Consistent with existing client portal auth |
| TLN Sync | Server-side scrape (Firecrawl or fetch + parse) | Structured data extraction from TLN profiles |
| Deals ingestion | Existing VPS scraper → new API endpoint | No migration of scraper logic needed |

---

## 12. Phase 2 Roadmap (Deferred)

- **Self-serve booking:** Consumer completes purchase through supplier payment flows (Traveltek for cruises, Amadeus for flights/hotels)
- **Car rental search:** Build Amadeus car rental provider and `/search/cars` page
- **Consumer auth:** Sign up / sign in, creates Contact in Tailfire
- **My Trips:** After booking, consumer accesses trip in the client portal
- **All-inclusives catalog:** Build DB catalog by scraping/importing package providers (like cruises/tours)
- **White-label:** Config-driven branding so other Tailfire agencies can deploy their own OTA
- **Advisor micro-site expansion:** Testimonials, booking calendar, video introductions
- **Advanced AI:** AI remembers returning consumers, proactive trip suggestions based on past searches

---

## 13. Cross-Cutting Concerns

### SEO
- All deal and advisor pages generate `metadata` via `generateMetadata()` with dynamic title, description, and canonical URL
- Dynamic OG images via `opengraph-image.tsx` for deals and advisor profiles (social sharing)
- JSON-LD structured data: `TravelAction` for search pages, `Offer` for deals, `Person` for advisor profiles
- Dynamic sitemap generation (`app/sitemap.ts`) covering deals, advisors, and published trips
- Canonical URL strategy: each deal has one canonical URL at `/deals/[slug]`; advisor-curated views link back to canonical

### Accessibility
- WCAG 2.1 AA compliance required for all public pages
- Keyboard navigation for search forms, chat widget, and advisor directory
- Screen reader support: proper ARIA labels on chat widget, search results, and interactive cards
- Color contrast: minimum 4.5:1 for body text, 3:1 for large text (enforced via shadcn theme tokens)
- Focus management: chat widget traps focus when open, returns focus on close

### Mobile
- Mobile-first responsive design (60-70% of OTA traffic expected from mobile)
- Chat widget: full-screen overlay on mobile
- Search pages: stacked card layout on mobile, grid on desktop
- Advisor micro-sites: optimized for social media sharing (mobile link previews)

### Error Handling
- Search API failures: graceful degradation with "Unable to search [product type] right now" message + retry button
- AI concierge tool failures: AI acknowledges the failure conversationally ("I wasn't able to search flights right now, but I can help you with...")
- Streaming SSR: Suspense boundaries with skeleton cards; `error.tsx` boundaries per route segment

### ISR Revalidation Strategy
- **Deals and advisor profiles:** On-demand revalidation via `revalidateTag()` triggered by NestJS webhooks when data changes (POST to `app/api/revalidate/route.ts` with tag and secret)
- **Fallback:** Time-based revalidation (`revalidate: 3600`) as safety net if webhook fails

### New API Provider Work
- **Amadeus Car Rental Provider:** Deferred to Phase 2. No car rental provider exists in the codebase.
- **FusionAPI Public Facade:** cruise-repository provides catalog search, but FusionAPI is needed for live pricing and availability. A public-facing facade (service-key auth, not JWT) must wrap the existing FusionAPI search capabilities for the OTA cruise search page.
- **Amadeus Public Facades:** Flight and hotel search controllers exist but are JWT-gated. New `/api/v1/ota/flights/search` and `/api/v1/ota/hotels/search` endpoints needed with service-key auth. Also need a public airport-lookup endpoint (currently admin-only via AeroDataBox).

### Softvoyage Widget
- The `/search/all-inclusives` page embeds the existing Softvoyage widget via iframe
- Widget URL and parameters to be confirmed (currently used on phoenixvoyages.ca/book/)
- Responsive iframe container that adapts to viewport width
- Minimal integration in Phase 1 — no data exchange between OTA and widget
