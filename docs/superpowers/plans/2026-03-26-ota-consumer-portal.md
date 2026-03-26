# OTA Consumer Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a consumer-facing OTA on `phoenixvoyages.ca` with AI concierge, advisor micro-sites, deals system, product search, agent recruitment, and WordPress content migration.

**Architecture:** Next.js 15.x (App Router) in `apps/ota`, talking to existing NestJS API in `apps/api`. AI concierge via AI SDK v6 + AI Gateway. Brand system: Phoenix Gold on white, Cinzel + Lato typography. Mobile-first.

**Tech Stack:** Next.js 15.x, shadcn/ui, Tailwind CSS, AI SDK v6, AI Elements, TanStack React Query, Drizzle ORM, NestJS

**Spec:** `docs/superpowers/specs/2026-03-26-ota-consumer-portal-design.md`
**Content Inventory:** `docs/superpowers/specs/2026-03-26-wordpress-content-inventory.md`
**Mockups:** `.superpowers/brainstorm/` directories

---

## Phase Overview

| Phase | What it produces | Depends on |
|-------|-----------------|------------|
| **1. Foundation** | Scaffolded OTA app with brand theming, layout, homepage | Nothing |
| **2. Database & API** | New tables + NestJS modules (deals, advisor_profiles, referrals, published_trips) | Phase 1 |
| **3. Deals System** | `/deals` listing, `/deals/[slug]` landing pages, VPS scraper endpoint | Phase 2 |
| **4. Advisor Micro-Sites** | `/advisor/[slug]` profiles, TLN sync, directory, attribution | Phase 2 |
| **5. Search Pages** | `/search/cruises`, `/search/flights`, `/search/hotels`, `/search/tours`, `/search/all-inclusives` | Phase 2 |
| **6. AI Concierge** | Chat widget, AI tools, lead capture, streaming | Phases 2-5 |
| **7. Agent Recruitment** | `/join` route group, registration, SEO content pages | Phase 1 |
| **8. WordPress Migration** | 301 redirects, SEO metadata, sitemap, OG images | Phases 3-7 |

Each phase produces a deployable increment. Phase 1 alone gives you a branded homepage. By Phase 4 you have a working advisor marketing tool. Phase 6 adds the AI differentiator.

---

## Phase 1: Foundation (OTA App Scaffold + Brand Theming)

### Task 1.1: Clean and re-scaffold `apps/ota`

The existing `apps/ota` has mock data and placeholder content. Reset it to a clean Next.js 15 app with the monorepo integration intact.

**Files:**
- Modify: `apps/ota/package.json`
- Modify: `apps/ota/src/app/layout.tsx`
- Modify: `apps/ota/src/app/globals.css`
- Modify: `apps/ota/src/app/page.tsx`
- Delete: `apps/ota/src/data/` (mock data)
- Delete: `apps/ota/src/components/` (old placeholder components)
- Create: `apps/ota/src/lib/utils.ts` (cn utility)

- [ ] **Step 1:** Remove all mock data files and old placeholder components from `apps/ota/src/data/` and `apps/ota/src/components/`
- [ ] **Step 2:** Update `package.json` — ensure `next@^15.5.x`. Keep existing `@tailfire/ui-public` and `@tailfire/api-client` workspace deps. Remove `@tailfire/api-client` only if replacing with new `lib/api.ts` (Task 1.6). Add `ai@^6.0.0`, `@ai-sdk/react@^3.0.0`. Remove Supabase auth packages if present (`@supabase/ssr`, `@supabase/supabase-js`) — no consumer auth in Phase 1.
- [ ] **Step 2b:** Remove or disable the Supabase session middleware in `apps/ota/src/middleware.ts` — the existing middleware calls `updateSession()` for Supabase auth which will error without auth configured. Replace with a minimal middleware that just passes through (referral logic added in Task 4.5).
- [ ] **Step 3:** Run `npx shadcn@latest init -d --base radix` in `apps/ota/`
- [ ] **Step 4:** Install baseline shadcn components: `npx shadcn@latest add button card input label textarea select tabs dialog sheet dropdown-menu badge separator skeleton`
- [ ] **Step 5:** Verify `pnpm dev` starts clean (turbo dev from repo root, OTA on localhost:3103)
- [ ] **Step 6:** Commit: `feat(ota): clean scaffold with shadcn and workspace deps`

### Task 1.2: Brand theming — Phoenix Voyages palette + fonts

**Files:**
- Modify: `apps/ota/src/app/globals.css`
- Modify: `apps/ota/src/app/layout.tsx`
- Create: `apps/ota/src/lib/fonts.ts`
- Create: `apps/ota/tailwind.config.ts` (if not using CSS-only theming)

- [ ] **Step 1:** The OTA uses Tailwind v3 with `@tailfire/ui-public/tailwind.preset.ts` which already defines the Phoenix Voyages palette (`phoenix.gold`, `phoenix.charcoal`, `phoenix.ember`, `phoenix.red`) and font families (Cinzel, Lato). Verify the preset is applied in `tailwind.config.ts`. Set CSS variable values in `globals.css` `:root` block for the light theme (HSL values for shadcn compatibility): `--primary` for Phoenix Gold, `--foreground` for Deep Charcoal, `--destructive` for Ember Red, `--border` for Ash Gray, `--background: 0 0% 100%`, `--muted` for Warm Ivory. Do NOT use `@theme inline` — that's Tailwind v4 syntax.
- [ ] **Step 2:** Set up Cinzel and Lato via `next/font/google` in `lib/fonts.ts`. Cinzel for `--font-serif` (titles), Lato for `--font-sans` (body). Apply font variable classNames to `<html>` in `layout.tsx`.
- [ ] **Step 3:** Set light mode as default. Add `bg-background text-foreground` to `<body>`. Verify Phoenix Gold accent renders correctly on buttons and links.
- [ ] **Step 4:** Visually verify — `turbo dev`, open localhost:3103, confirm fonts and colors render correctly
- [ ] **Step 5:** Commit: `feat(ota): phoenix voyages brand theming — palette, fonts, light mode`

### Task 1.3: Root layout — nav, footer, mobile shell

**Files:**
- Create: `apps/ota/src/components/layout/nav.tsx`
- Create: `apps/ota/src/components/layout/footer.tsx`
- Create: `apps/ota/src/components/layout/mobile-nav.tsx`
- Modify: `apps/ota/src/app/layout.tsx`

- [ ] **Step 1:** Create `Nav` component — Phoenix logo (gold icon + "PHOENIX VOYAGES" in Cinzel), horizontal nav links on desktop (Deals, Cruises, Flights, Hotels, Tours, Advisors, Join), hamburger menu on mobile. Sticky top.
- [ ] **Step 2:** Create `MobileNav` — shadcn `Sheet` component, slide-out from right, full nav links + "Talk to AI" CTA at bottom.
- [ ] **Step 3:** Create `Footer` — Phoenix logo, nav links, TICO license number, social links, copyright. Dark charcoal `#1A1A1A` background, gold accents.
- [ ] **Step 4:** Wire into `layout.tsx`: `<Nav />` at top, `{children}` in main, `<Footer />` at bottom.
- [ ] **Step 5:** Test on mobile viewport (375px) and desktop (1280px) — nav collapses, Sheet opens, footer stacks.
- [ ] **Step 6:** Commit: `feat(ota): root layout with nav, mobile nav, footer`

### Task 1.4: Homepage — AI-first with product grid

**Files:**
- Create: `apps/ota/src/app/(marketing)/page.tsx`
- Create: `apps/ota/src/components/home/hero-section.tsx`
- Create: `apps/ota/src/components/home/product-grid.tsx`
- Create: `apps/ota/src/components/home/featured-deal.tsx`
- Create: `apps/ota/src/components/home/trust-bar.tsx`

- [ ] **Step 1:** Create `HeroSection` — tagline ("DISCOVER, SOAR, REPEAT" in Cinzel, gold), heading ("Your Journey Starts Here"), subtitle, AI chat input mock (dark rounded bar with gold send button — placeholder, wired in Phase 6).
- [ ] **Step 2:** Create `ProductGrid` — "or search directly" divider, 2x2 grid of category cards (Flights, Cruises, Hotels, Tours) with icons. Links to `/search/*` pages.
- [ ] **Step 3:** Create `FeaturedDeal` — teaser card with dark charcoal background, gold "HOT DEAL" badge placeholder. Will be data-driven in Phase 3.
- [ ] **Step 4:** Create `TrustBar` — "AI-Powered / Advisor-Backed / TICO Licensed" in small caps, centered.
- [ ] **Step 5:** Compose in `(marketing)/page.tsx`: HeroSection → ProductGrid → FeaturedDeal → TrustBar.
- [ ] **Step 6:** Test mobile (375px) — all sections stack, full-width, no horizontal overflow.
- [ ] **Step 7:** Commit: `feat(ota): homepage with AI-first hero, product grid, trust bar`

### Task 1.5: Static marketing pages

**Files:**
- Create: `apps/ota/src/app/(marketing)/about/page.tsx`
- Create: `apps/ota/src/app/(marketing)/contact/page.tsx`
- Create: `apps/ota/src/app/(marketing)/terms/page.tsx`
- Create: `apps/ota/src/app/(marketing)/privacy/page.tsx`

- [ ] **Step 1:** Create About page — company story, mission, values from brand guidelines. Cinzel headings, Lato body. Photo placeholder for team/office.
- [ ] **Step 2:** Create Contact page — contact form (name, email, message, phone) using shadcn Input/Textarea/Button. Form action placeholder (wired to API in Phase 6 for lead capture).
- [ ] **Step 3:** Create Terms and Privacy pages — static markdown content (migrate from WordPress). Use consistent page layout wrapper.
- [ ] **Step 4:** Verify all pages accessible from nav, proper `<title>` tags via `metadata` exports.
- [ ] **Step 5:** Commit: `feat(ota): static marketing pages — about, contact, terms, privacy`

### Task 1.6: Error boundaries, loading states, and not-found pages

**Files:**
- Create: `apps/ota/src/app/error.tsx`
- Create: `apps/ota/src/app/not-found.tsx`
- Create: `apps/ota/src/app/deals/loading.tsx`
- Create: `apps/ota/src/app/search/cruises/loading.tsx`
- Create: `apps/ota/src/app/search/flights/loading.tsx`
- Create: `apps/ota/src/app/search/hotels/loading.tsx`
- Create: `apps/ota/src/app/search/tours/loading.tsx`
- Create: `apps/ota/src/app/advisors/loading.tsx`

- [ ] **Step 1:** Create root `error.tsx` — brand-styled error page with "Something went wrong" message, retry button, and "Contact us" link. `'use client'` with `reset()` callback.
- [ ] **Step 2:** Create root `not-found.tsx` — brand-styled 404 page with search CTA and "Talk to AI" button.
- [ ] **Step 3:** Create `loading.tsx` files for SSR-streaming routes — skeleton cards matching the card layouts for each product type. Uses shadcn `Skeleton` component.
- [ ] **Step 4:** Commit: `feat(ota): error boundaries, 404 page, loading skeletons`

### Task 1.7: OTA API client utility

**Files:**
- Create: `apps/ota/src/lib/api.ts`
- Create: `apps/ota/src/lib/config.ts`

- [ ] **Step 1:** Create `config.ts` — export `API_BASE_URL` from env (`NEXT_PUBLIC_API_URL` for client, `API_URL` for server), `OTA_SERVICE_KEY` for service-to-service calls.
- [ ] **Step 2:** Create `api.ts` — typed fetch wrapper for NestJS API. Two modes: `publicFetch(path)` for public endpoints (catalog key auth), `serviceFetch(path, options)` for service-key-authenticated endpoints. Error handling, JSON parsing, timeout.
- [ ] **Step 3:** Commit: `feat(ota): API client utility with public and service-key auth`

---

## Phase 2: Database Schema & NestJS API Modules

### Task 2.1: Database migration — new tables

**Files:**
- Create: `packages/database/src/schema/advisor-profiles.schema.ts`
- Create: `packages/database/src/schema/deals.schema.ts`
- Create: `packages/database/src/schema/advisor-featured-deals.schema.ts`
- Create: `packages/database/src/schema/ota-referrals.schema.ts`
- Create: `packages/database/src/schema/ota-published-trips.schema.ts`
- Create: `packages/database/src/migrations/YYYYMMDDHHMMSS_ota_tables.sql`
- Modify: `packages/database/src/schema/index.ts` (export new schemas)

- [ ] **Step 1:** Define Drizzle schemas for all 5 new tables: `advisorProfiles`, `deals`, `advisorFeaturedDeals`, `otaReferrals`, `otaPublishedTrips`. Follow existing patterns (uuid PKs, timestamps, agencyId FK). Reference the spec Section 7 for exact columns.
- [ ] **Step 2:** Export from `schema/index.ts`.
- [ ] **Step 3:** Generate migration SQL: `cd apps/api && pnpm db:generate`
- [ ] **Step 4:** Register in `meta/_journal.json`.
- [ ] **Step 5:** Run migration locally: `cd apps/api && pnpm db:migrate`
- [ ] **Step 6:** Verify tables exist: `psql "$DATABASE_URL" -c "\dt ota_*"` and `psql "$DATABASE_URL" -c "\dt deals"` and `psql "$DATABASE_URL" -c "\dt advisor_*"`
- [ ] **Step 7:** Commit: `feat(db): add OTA tables — advisor_profiles, deals, ota_referrals, ota_published_trips`

### Task 2.2: NestJS — Deals module

**Files:**
- Create: `apps/api/src/deals/deals.module.ts`
- Create: `apps/api/src/deals/deals.controller.ts`
- Create: `apps/api/src/deals/deals.service.ts`
- Create: `apps/api/src/deals/dto/create-deal.dto.ts`
- Create: `apps/api/src/deals/dto/update-deal.dto.ts`
- Create: `apps/api/src/deals/dto/deal-search.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register DealsModule)

- [ ] **Step 1:** Create DTOs — `CreateDealDto` (Zod validated: title, slug, productType, pricing, destinations, supplierName, externalSource, externalId), `UpdateDealDto` (partial), `DealSearchDto` (filters: productType, destination, supplier, page, limit).
- [ ] **Step 2:** Create `DealsService` — CRUD operations. `findPublished()` for OTA (filters by `isPublished: true`). `upsertFromScraper()` for VPS scraper (dedup by externalSource + externalId).
- [ ] **Step 3:** Create `DealsController` — public GET endpoints (no auth guard), admin POST/PUT/DELETE (JWT guard), scraper POST (internal API key guard, same pattern as cruise-import).
- [ ] **Step 4:** Register in `app.module.ts`.
- [ ] **Step 5:** Test with curl: `curl localhost:3101/api/v1/deals` should return empty array.
- [ ] **Step 6:** Commit: `feat(api): deals module with CRUD, public listing, scraper upsert`

### Task 2.3: NestJS — Advisor Profiles module

**Files:**
- Create: `apps/api/src/advisor-profiles/advisor-profiles.module.ts`
- Create: `apps/api/src/advisor-profiles/advisor-profiles.controller.ts`
- Create: `apps/api/src/advisor-profiles/advisor-profiles.service.ts`
- Create: `apps/api/src/advisor-profiles/tln-sync.service.ts`
- Create: `apps/api/src/advisor-profiles/dto/create-advisor-profile.dto.ts`
- Create: `apps/api/src/advisor-profiles/dto/update-advisor-profile.dto.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1:** Create DTOs — `CreateAdvisorProfileDto` (userId, agencyId, slug, tlnProfileUrl), `UpdateAdvisorProfileDto`.
- [ ] **Step 2:** Create `AdvisorProfilesService` — CRUD, `findPublished()`, `findBySlug()`, `getAdvisorDeals(slug)` (join with advisor_featured_deals + deals), `getAdvisorTrips(slug)` (join with ota_published_trips).
- [ ] **Step 3:** Create `TlnSyncService` — fetches TLN profile page (server-side HTTP), parses structured data (name, bio, photo, specialties, certifications, languages, destinations, reviews). Updates advisor_profiles synced fields. Sets `tlnLastSyncedAt`.
- [ ] **Step 4:** Create `AdvisorProfilesController` — public GET endpoints for OTA, admin CRUD (JWT), `POST /:id/sync-tln` (JWT, triggers TLN scrape).
- [ ] **Step 5:** Register in `app.module.ts`.
- [ ] **Step 6:** Test: `curl localhost:3101/api/v1/advisor-profiles` should return empty array.
- [ ] **Step 7:** Commit: `feat(api): advisor profiles module with TLN sync, public listing`

### Task 2.4: NestJS — OTA Lead Capture & Referral module

**Files:**
- Create: `apps/api/src/ota/ota.module.ts`
- Create: `apps/api/src/ota/ota-leads.controller.ts`
- Create: `apps/api/src/ota/ota-leads.service.ts`
- Create: `apps/api/src/ota/ota-referrals.controller.ts`
- Create: `apps/api/src/ota/ota-referrals.service.ts`
- Create: `apps/api/src/ota/dto/create-lead.dto.ts`
- Create: `apps/api/src/ota/dto/create-referral.dto.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1:** Create `CreateLeadDto` (email, name, phone?, advisorSlug?, referralSessionId?, source), `CreateReferralDto` (sessionId, advisorSlug, landingUrl, referralSource).
- [ ] **Step 2:** Create `OtaLeadsService` — implements attribution priority chain: 1) Check existing Contact by email → if has assigned agent, use CRM ownership. 2) Check referral cookie → assign referring advisor. 3) Fall back to round-robin. Creates Contact in contacts table if new.
- [ ] **Step 3:** Create `OtaReferralsService` — logs referral visits to `ota_referrals` table.
- [ ] **Step 4:** Create controllers — service-key auth (`x-ota-service-key`).
- [ ] **Step 5:** Register in `app.module.ts`.
- [ ] **Step 6:** Commit: `feat(api): OTA lead capture with attribution priority chain, referral logging`

### Task 2.5: NestJS — OTA Published Trips module

**Files:**
- Create: `apps/api/src/ota/ota-published-trips.controller.ts`
- Create: `apps/api/src/ota/ota-published-trips.service.ts`
- Create: `apps/api/src/ota/dto/publish-trip.dto.ts`
- Modify: `apps/api/src/ota/ota.module.ts`

- [ ] **Step 1:** Create `PublishTripDto` (templateId, advisorProfileId, slug, publishType, headline, callToAction, heroImageUrl).
- [ ] **Step 2:** Create `OtaPublishedTripsService` — `publish()` reads itinerary_template JSON, renders a snapshot, stores in `ota_published_trips`. `refresh()` re-snapshots from current template data. `findBySlug()` for public access. `findByAdvisor(advisorProfileId)`.
- [ ] **Step 3:** Create controller — public GET by slug, admin POST/PUT/DELETE (JWT), refresh endpoint.
- [ ] **Step 4:** Commit: `feat(api): OTA published trips with template snapshots`

### Task 2.6: NestJS — Public search facades

**Files:**
- Create: `apps/api/src/ota/ota-search.controller.ts`
- Create: `apps/api/src/ota/ota-search.service.ts`
- Modify: `apps/api/src/ota/ota.module.ts`

- [ ] **Step 1:** Create `OtaSearchService` — thin wrappers around existing providers: `searchFlights()` calls `AmadeusFlightsProvider.search()`, `searchHotels()` calls `AmadeusHotelsProvider.search()`, `searchAirports()` calls AeroDataBox airport data, `searchCruisesLive()` calls `FusionApiService.search()` for real-time pricing/availability (the catalog endpoint has static data only).
- [ ] **Step 2:** Create `OtaSearchController` — service-key auth (`x-ota-service-key`). Endpoints: `GET /api/v1/ota/flights/search`, `GET /api/v1/ota/flights/airports`, `GET /api/v1/ota/hotels/search`, `GET /api/v1/ota/cruises/search` (live FusionAPI pricing).
- [ ] **Step 3:** Test: `curl -H "x-ota-service-key: $KEY" localhost:3101/api/v1/ota/flights/airports?keyword=toronto`
- [ ] **Step 4:** Commit: `feat(api): OTA public search facades for flights, hotels, airports`

### Task 2.7: Add OTA_SERVICE_KEY to Doppler

- [ ] **Step 1:** Generate a secure key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] **Step 2:** Add to Doppler `dev`, `stg`, `prd` configs via MCP: `mcp__doppler__secrets_update(project: "tailfire", config: "dev", secrets: {"OTA_SERVICE_KEY": "<key>"})`
- [ ] **Step 3:** Add matching key to OTA's env: same key in `apps/ota/.env.local` as `OTA_SERVICE_KEY`
- [ ] **Step 4:** Commit: (no code change — env config only)

---

## Phase 3: Deals System (OTA Frontend)

### Task 3.1: Deals listing page `/deals`

**Files:**
- Create: `apps/ota/src/app/deals/page.tsx`
- Create: `apps/ota/src/components/deals/deal-card.tsx`
- Create: `apps/ota/src/components/deals/deal-filters.tsx`
- Create: `apps/ota/src/components/deals/featured-deal-card.tsx`

- [ ] **Step 1:** Create `DealCard` component — reusable card with dark charcoal image header (placeholder for real photo), gold supplier label, title, price, duration. Used on `/deals`, advisor deals, homepage.
- [ ] **Step 2:** Create `FeaturedDealCard` — larger variant with HOT DEAL badge (Ember Red), strikethrough original price, save percentage.
- [ ] **Step 3:** Create `DealFilters` — horizontal scroll filter chips (All, Cruises, Flights, Tours, Hotels, All-Inclusive). Updates URL search params.
- [ ] **Step 4:** Create `/deals/page.tsx` — Server Component. Fetches `GET /api/v1/deals?isPublished=true` via `publicFetch`. SSR with ISR (`revalidate: 3600`). First deal as FeaturedDealCard, rest in 2-column grid of DealCards. SEO metadata via `generateMetadata`.
- [ ] **Step 5:** Test: create a test deal via API, verify it appears on `/deals`
- [ ] **Step 6:** Commit: `feat(ota): deals listing page with magazine grid, filters`

### Task 3.2: Deal landing page `/deals/[slug]`

**Files:**
- Create: `apps/ota/src/app/deals/[slug]/page.tsx`
- Create: `apps/ota/src/app/deals/[slug]/opengraph-image.tsx`
- Create: `apps/ota/src/components/deals/deal-hero.tsx`
- Create: `apps/ota/src/components/deals/deal-quick-facts.tsx`
- Create: `apps/ota/src/components/deals/deal-cta-section.tsx`

- [ ] **Step 1:** Create `DealHero` — golden hour gradient hero with title overlay, back button, share button.
- [ ] **Step 2:** Create floating price card — overlapping hero, price + savings + "Inquire" CTA.
- [ ] **Step 3:** Create `DealQuickFacts` — pill cards (duration, dates, departure port) with warm ivory background.
- [ ] **Step 4:** Create `DealCtaSection` — dual CTAs ("Ask AI About This" + "Talk to Advisor").
- [ ] **Step 5:** Create `page.tsx` — Server Component, fetches deal by slug, ISR. Full SEO `generateMetadata` with title, description, canonical URL.
- [ ] **Step 6:** Create `opengraph-image.tsx` — dynamic OG image using `ImageResponse` from `next/og`. Phoenix Gold gradient, deal title, price, supplier logo.
- [ ] **Step 7:** Test: visit `/deals/test-deal`, verify OG tags with `curl -I`, share on social media preview tool.
- [ ] **Step 8:** Commit: `feat(ota): deal landing page with hero, OG image, CTAs`

### Task 3.3: Wire homepage featured deal

**Files:**
- Modify: `apps/ota/src/components/home/featured-deal.tsx`
- Modify: `apps/ota/src/app/(marketing)/page.tsx`

- [ ] **Step 1:** Update `FeaturedDeal` component to accept deal data props.
- [ ] **Step 2:** Fetch the latest hot deal from API in homepage Server Component.
- [ ] **Step 3:** Commit: `feat(ota): wire homepage featured deal from API`

### Task 3.4: ISR revalidation webhook

**Files:**
- Create: `apps/ota/src/app/api/revalidate/route.ts`

- [ ] **Step 1:** Create revalidation route in OTA — accepts POST with `{tag, secret}`, validates secret, calls `revalidateTag(tag)`. Tags: `deals`, `deal-{slug}`, `advisors`, `advisor-{slug}`.
- [ ] **Step 2:** Add `REVALIDATION_SECRET` and `OTA_REVALIDATION_URL` to Doppler (all envs). OTA env gets `REVALIDATION_SECRET`. API env gets both `REVALIDATION_SECRET` and `OTA_REVALIDATION_URL` (e.g., `https://phoenixvoyages.ca/api/revalidate`).
- [ ] **Step 3:** Add revalidation triggers to NestJS services: `DealsService.create/update/delete()` → POST to `OTA_REVALIDATION_URL` with tag `deals`. `AdvisorProfilesService.update()` → POST with tag `advisor-{slug}`. Fire-and-forget with try/catch (don't block the API operation if OTA is down).
- [ ] **Step 4:** Commit: `feat(ota): ISR revalidation webhook + NestJS triggers for deals and advisors`

---

## Phase 4: Advisor Micro-Sites

### Task 4.1: Advisor profile page `/advisor/[slug]`

**Files:**
- Create: `apps/ota/src/app/advisor/[slug]/page.tsx`
- Create: `apps/ota/src/components/advisor/advisor-profile-header.tsx`
- Create: `apps/ota/src/components/advisor/advisor-bio-card.tsx`
- Create: `apps/ota/src/components/advisor/advisor-destinations.tsx`
- Create: `apps/ota/src/components/advisor/advisor-reviews.tsx`

- [ ] **Step 1:** Create `AdvisorProfileHeader` — avatar (TLN photo or initials fallback), name (Cinzel), title, location, star rating, specialty badges. Dual CTAs: "Contact [Name]" + "Ask AI".
- [ ] **Step 2:** Create `AdvisorBioCard` — warm ivory (`#faf6f0`) background, Cinzel heading, Lato body text. Shows TLN bio + optional bioSupplement.
- [ ] **Step 3:** Create `AdvisorDestinations` — horizontal scroll of destination cards with gradient backgrounds. Populated from TLN destinations array.
- [ ] **Step 4:** Create `AdvisorReviews` — review cards with rating stars, text, author. From TLN reviews.
- [ ] **Step 5:** Create `page.tsx` — Server Component, fetches advisor by slug, ISR. Scrolling sections layout. SEO metadata with advisor name and specialties.
- [ ] **Step 6:** Create `apps/ota/src/app/advisor/[slug]/opengraph-image.tsx` — dynamic OG image with advisor photo, name, specialties, Phoenix branding. For social media sharing of advisor links.
- [ ] **Step 7:** Test with a seeded advisor profile.
- [ ] **Step 8:** Commit: `feat(ota): advisor micro-site profile page with OG image`

### Task 4.2: Advisor deals page `/advisor/[slug]/deals`

**Files:**
- Create: `apps/ota/src/app/advisor/[slug]/deals/page.tsx`
- Create: `apps/ota/src/components/advisor/advisor-context-bar.tsx`

- [ ] **Step 1:** Create `AdvisorContextBar` — avatar + "[Name]'s Picks" + "View Profile" link. Warm ivory background.
- [ ] **Step 2:** Create `page.tsx` — reuses `DealCard` component from Phase 3 with "Jane's Pick" badge and "Ask Jane's AI" CTA variant. Fetches advisor-curated deals via API.
- [ ] **Step 3:** Add "Not finding what you need?" advisor CTA at bottom.
- [ ] **Step 4:** Commit: `feat(ota): advisor curated deals page`

### Task 4.3: Advisor published trips `/advisor/[slug]/trips`

**Files:**
- Create: `apps/ota/src/app/advisor/[slug]/trips/page.tsx`
- Create: `apps/ota/src/app/advisor/[slug]/trips/[tripSlug]/page.tsx`
- Create: `apps/ota/src/components/advisor/trip-showcase-card.tsx`
- Create: `apps/ota/src/components/advisor/trip-showcase-detail.tsx`

- [ ] **Step 1:** Create `TripShowcaseCard` — card with hero image, trip title, publish type badge (Hosted/Featured/Recommended/Custom), starting price, advisor name.
- [ ] **Step 2:** Create trips listing page — grid of TripShowcaseCards, advisor context bar.
- [ ] **Step 3:** Create trip detail page — renders from `ota_published_trips.renderedSnapshot`. Hero image, advisor badge, itinerary highlights, activities, pricing, "Inquire About This Trip" CTA.
- [ ] **Step 4:** Commit: `feat(ota): advisor published trips listing and detail pages`

### Task 4.4: Advisor directory `/advisors`

**Files:**
- Create: `apps/ota/src/app/advisors/page.tsx`
- Create: `apps/ota/src/components/advisor/advisor-directory-card.tsx`
- Create: `apps/ota/src/components/advisor/advisor-directory-filters.tsx`

- [ ] **Step 1:** Create `AdvisorDirectoryCard` — compact card with avatar, name, specialties, rating, "View Profile" link.
- [ ] **Step 2:** Create filters — by specialty, language, destination. Client-side filtering with search params.
- [ ] **Step 3:** Create page — Server Component, fetches all published advisors, ISR. Grid layout.
- [ ] **Step 4:** Commit: `feat(ota): advisor directory with filters`

### Task 4.5: Attribution middleware

**Files:**
- Modify: `apps/ota/src/middleware.ts`

- [ ] **Step 1:** Update middleware to detect `/advisor/[slug]` routes and `?ref=` parameter. Set `ota_ref` cookie (30 days, path `/`). Generate anonymous session UUID if not present, store as `ota_session` cookie.
- [ ] **Step 2:** On `/advisor/[slug]` visits, POST referral to `POST /api/v1/ota/referrals` via service fetch (fire-and-forget with `waitUntil` if available, or background).
- [ ] **Step 3:** Test: visit `/advisor/jane-smith`, verify `ota_ref=jane-smith` cookie is set. Navigate to `/deals`, verify cookie persists.
- [ ] **Step 4:** Commit: `feat(ota): attribution middleware with referral cookie and session tracking`

---

## Phase 5: Search Pages

### Task 5.1: Cruise search `/search/cruises`

**Files:**
- Create: `apps/ota/src/app/search/cruises/page.tsx`
- Create: `apps/ota/src/components/search/cruise-search-form.tsx`
- Create: `apps/ota/src/components/search/cruise-result-card.tsx`
- Create: `apps/ota/src/components/search/search-results-header.tsx`
- Create: `apps/ota/src/components/search/filter-chips.tsx`
- Create: `apps/ota/src/components/search/port-pills.tsx`

- [ ] **Step 1:** Create reusable `FilterChips` and `SearchResultsHeader` components.
- [ ] **Step 2:** Create `CruiseSearchForm` — destination, date range, passengers. Submits as search params.
- [ ] **Step 3:** Create `CruiseResultCard` — two-tone card: dark gradient header (cruise line, ship, price) + white detail (dates, port pills). Compact, info-dense per mockup.
- [ ] **Step 4:** Create page — Server Component with Suspense boundary. Fetches from cruise-repository (catalog data, already public) for browsing, and from `/api/v1/ota/cruises/search` (FusionAPI facade, service-key auth) for live pricing when search is submitted. Streaming results with skeleton fallback.
- [ ] **Step 5:** Test: search for Caribbean cruises, verify results render.
- [ ] **Step 6:** Commit: `feat(ota): cruise search page with streaming results`

### Task 5.2: Flight search `/search/flights`

**Files:**
- Create: `apps/ota/src/app/search/flights/page.tsx`
- Create: `apps/ota/src/components/search/flight-search-form.tsx`
- Create: `apps/ota/src/components/search/flight-result-card.tsx`
- Create: `apps/ota/src/components/search/airport-autocomplete.tsx`

- [ ] **Step 1:** Create `AirportAutocomplete` — client component, debounced search against `/api/v1/ota/flights/airports`.
- [ ] **Step 2:** Create `FlightSearchForm` — origin (autocomplete), destination (autocomplete), dates, passengers, class.
- [ ] **Step 3:** Create `FlightResultCard` — two-tone card: airline branded header + white detail (times, stops, duration, price).
- [ ] **Step 4:** Create page with Suspense streaming.
- [ ] **Step 5:** Commit: `feat(ota): flight search page with airport autocomplete`

### Task 5.3: Hotel search `/search/hotels`

**Files:**
- Create: `apps/ota/src/app/search/hotels/page.tsx`
- Create: `apps/ota/src/components/search/hotel-search-form.tsx`
- Create: `apps/ota/src/components/search/hotel-result-card.tsx`

- [ ] **Step 1:** Create `HotelSearchForm` — destination, check-in/out dates, guests, rooms.
- [ ] **Step 2:** Create `HotelResultCard` — two-tone card with hotel name, star rating, location, board basis, price.
- [ ] **Step 3:** Create page with Suspense streaming.
- [ ] **Step 4:** Commit: `feat(ota): hotel search page`

### Task 5.4: Tour browse `/search/tours`

**Files:**
- Create: `apps/ota/src/app/search/tours/page.tsx`
- Create: `apps/ota/src/components/search/tour-result-card.tsx`

- [ ] **Step 1:** Create `TourResultCard` — operator logo, tour name, duration, departures, "Request Quote from Advisor" CTA (not price for tours).
- [ ] **Step 2:** Create page — fetches from tour-repository (already public, catalog key auth) + Globus live proxy.
- [ ] **Step 3:** Commit: `feat(ota): tour browse page with Globus catalog`

### Task 5.5: All-inclusives `/search/all-inclusives`

**Files:**
- Create: `apps/ota/src/app/search/all-inclusives/page.tsx`

- [ ] **Step 1:** Create page with responsive iframe embedding Softvoyage widget. Confirm widget URL from current phoenixvoyages.ca/book/ page.
- [ ] **Step 2:** Add intro text and "need help?" CTA above iframe.
- [ ] **Step 3:** Commit: `feat(ota): all-inclusives page with Softvoyage iframe`

---

## Phase 6: AI Concierge

### Task 6.1: AI SDK setup + chat route

**Files:**
- Create: `apps/ota/src/app/api/chat/route.ts`
- Modify: `apps/ota/package.json` (add ai-sdk deps if not already present)

- [ ] **Step 1:** Ensure `ai@^6.0.0`, `@ai-sdk/react@^3.0.0` are installed. Run `vercel link` for OTA project, enable AI Gateway, `vercel env pull` for OIDC token.
- [ ] **Step 2:** Create `app/api/chat/route.ts` — POST handler. `convertToModelMessages()` → `streamText()` with `model: 'anthropic/claude-sonnet-4.6'` → `toUIMessageStreamResponse()`. System prompt: Phoenix Voyages travel concierge, aware of referral cookie, advisor context.
- [ ] **Step 3:** Test with curl: `curl -X POST localhost:3103/api/chat -H "Content-Type: application/json" -d '{"messages":[{"role":"user","parts":[{"type":"text","text":"Hello"}]}]}'`
- [ ] **Step 4:** Commit: `feat(ota): AI concierge chat route with AI Gateway`

### Task 6.2: AI tools — search, lead capture, advisor handoff

**Files:**
- Create: `apps/ota/src/lib/ai/tools.ts`
- Create: `apps/ota/src/lib/ai/system-prompt.ts`
- Modify: `apps/ota/src/app/api/chat/route.ts`

- [ ] **Step 1:** Create tools file with tool definitions using `inputSchema` (Zod): `searchFlights`, `searchHotels`, `searchCruises`, `browseTours`, `assemblePackage`, `lookupDestination`, `captureContact`, `requestAdvisor`. Each tool's `execute` calls the NestJS API via `serviceFetch`.
- [ ] **Step 2:** Create system prompt builder — takes advisor context (if on advisor page), referral info, and product capabilities. Instructs AI on which products are self-serve vs. agent-assisted.
- [ ] **Step 3:** Wire tools into chat route with `stopWhen: stepCountIs(5)`.
- [ ] **Step 4:** Test: ask "Find me Caribbean cruises in February" — should call searchCruises tool and return results.
- [ ] **Step 5:** Commit: `feat(ota): AI concierge tools — search, lead capture, advisor handoff`

### Task 6.3: Chat widget UI

**Files:**
- Create: `apps/ota/src/components/chat/chat-widget.tsx`
- Create: `apps/ota/src/components/chat/chat-panel.tsx`
- Create: `apps/ota/src/components/chat/chat-message.tsx`
- Create: `apps/ota/src/components/chat/chat-suggestion-chips.tsx`
- Create: `apps/ota/src/components/chat/chat-product-card.tsx`
- Modify: `apps/ota/src/app/layout.tsx`

- [ ] **Step 1:** Install AI Elements: `npx ai-elements@latest add message conversation`
- [ ] **Step 2:** Create `ChatWidget` — floating button (bottom-right, gold accent on dark charcoal circle, sparkle icon). Click expands `ChatPanel`. Full-screen overlay on mobile.
- [ ] **Step 3:** Create `ChatPanel` — dark header ("Phoenix AI — Your Travel Concierge"), light chat area, suggestion chips ("Beach getaway in Mexico", "Caribbean cruise", "European tour"), input bar at bottom with gold send button.
- [ ] **Step 4:** Wire `useChat` from `@ai-sdk/react` with `DefaultChatTransport({ api: '/api/chat' })`. Render messages with AI Elements `<Message>` component.
- [ ] **Step 5:** Create `ChatProductCard` — inline card for tool results (cruise/flight/hotel results rendered within conversation). Register as custom tool renderer.
- [ ] **Step 6:** Add `<ChatWidget />` to root `layout.tsx`.
- [ ] **Step 7:** Test end-to-end: open homepage → click chat → ask about cruises → see results inline → close chat → navigate to another page → reopen → conversation persists (localStorage).
- [ ] **Step 8:** Commit: `feat(ota): AI concierge chat widget with streaming, tools, product cards`

### Task 6.4: Rate limiting

**Files:**
- Create: `apps/ota/src/lib/rate-limit.ts`
- Modify: `apps/ota/src/app/api/chat/route.ts`

- [ ] **Step 1:** Install `@upstash/ratelimit` and `@upstash/redis`. Create rate limiter: 20 messages per session per hour, keyed by IP + session UUID.
- [ ] **Step 2:** Add rate limit check at top of chat route. Return 429 with friendly message if exceeded.
- [ ] **Step 3:** Commit: `feat(ota): AI concierge rate limiting — 20 messages/session/hour`

### Task 6.5: Wire homepage AI input to chat

**Files:**
- Modify: `apps/ota/src/components/home/hero-section.tsx`

- [ ] **Step 1:** Make hero AI input functional — typing and pressing Enter opens the ChatPanel with the text pre-filled and auto-sends the message.
- [ ] **Step 2:** Commit: `feat(ota): wire homepage AI input to chat widget`

---

## Phase 7: Agent Recruitment (`/join`)

### Task 7.1: Join landing page

**Files:**
- Create: `apps/ota/src/app/join/page.tsx`
- Create: `apps/ota/src/app/join/layout.tsx`

- [ ] **Step 1:** Create join layout — same nav/footer as OTA but with "Join" context.
- [ ] **Step 2:** Create landing page — migrate content from `join.phoenixvoyages.ca`. Benefits, testimonials, CTAs ("Start Your Application" + "Learn More"). Use brand palette and components.
- [ ] **Step 3:** Create `/join/learn-more/page.tsx` — detailed benefits page (expanded from landing page). Migrate content from `join.phoenixvoyages.ca/learn-more`.
- [ ] **Step 4:** Commit: `feat(ota): agent recruitment landing + learn-more pages at /join`

### Task 7.2: Registration form

**Files:**
- Create: `apps/ota/src/app/join/register/page.tsx`

- [ ] **Step 1:** Migrate registration form from `join.phoenixvoyages.ca`. Stripe integration for agent registration fees. Form fields: name, email, phone, experience level.
- [ ] **Step 2:** Commit: `feat(ota): agent registration form with Stripe at /join/register`

### Task 7.3: SEO content pages

**Files:**
- Create: `apps/ota/src/app/join/[slug]/page.tsx`
- Create: `apps/ota/src/content/join/` (markdown files for each SEO article)

- [ ] **Step 1:** Scrape content from WordPress recruitment pages (12 articles + 4 competitor comparisons). Save as markdown files in `apps/ota/src/content/join/`.
- [ ] **Step 2:** Create `[slug]/page.tsx` — SSG with `generateStaticParams`. Renders markdown content. Full SEO metadata migrated from WordPress (title, description, canonical).
- [ ] **Step 3:** Verify all 16 pages render correctly with proper SEO tags.
- [ ] **Step 4:** Commit: `feat(ota): agent recruitment SEO content pages migrated from WordPress`

---

## Phase 8: WordPress Migration & SEO

### Task 8.1: 301 redirect map

**Files:**
- Modify: `apps/ota/next.config.ts`

- [ ] **Step 1:** Add `redirects()` to `next.config.ts` with the full 301 redirect map from the content inventory. Priority redirects: `/about-us` → `/about`, `/contact-us` → `/contact`, `/plan-your-trip` → `/`, `/book` → `/search/all-inclusives`, `/deals/*` supplier pages → `/deals?supplier=*`, `/promo/*` → `/deals`, `/join-us` → `/join`, all recruitment pages → `/join/*`.
- [ ] **Step 2:** Add `join.phoenixvoyages.ca` → `phoenixvoyages.ca/join` redirect (domain-level, configured in Vercel dashboard).
- [ ] **Step 3:** Test: `curl -I phoenixvoyages.ca/about-us` returns 301 to `/about`.
- [ ] **Step 4:** Commit: `feat(ota): 301 redirect map for WordPress migration`

### Task 8.2: Dynamic sitemap

**Files:**
- Create: `apps/ota/src/app/sitemap.ts`

- [ ] **Step 1:** Create `sitemap.ts` — generates sitemap from: static pages, deals (from API), advisor profiles (from API), published trips (from API), join content pages. Uses `generateSitemaps` for large sites.
- [ ] **Step 2:** Test: `curl localhost:3103/sitemap.xml` returns valid XML with all pages.
- [ ] **Step 3:** Submit to Google Search Console after deployment.
- [ ] **Step 4:** Commit: `feat(ota): dynamic sitemap for SEO`

### Task 8.3: JSON-LD structured data

**Files:**
- Create: `apps/ota/src/lib/structured-data.ts`
- Modify: deal pages, advisor pages, search pages (add JSON-LD scripts)

- [ ] **Step 1:** Create helpers: `generateDealJsonLd(deal)` → `Offer` schema, `generateAdvisorJsonLd(advisor)` → `Person` schema, `generateSearchJsonLd()` → `SearchAction` schema.
- [ ] **Step 2:** Add `<script type="application/ld+json">` to relevant page layouts.
- [ ] **Step 3:** Test with Google's Rich Results Test.
- [ ] **Step 4:** Commit: `feat(ota): JSON-LD structured data for deals, advisors, search`

### Task 8.4: robots.txt and metadata

**Files:**
- Create: `apps/ota/src/app/robots.ts`
- Modify: `apps/ota/src/app/layout.tsx` (global metadata)

- [ ] **Step 1:** Create `robots.ts` — allow all crawlers, reference sitemap URL.
- [ ] **Step 2:** Set global metadata in layout: site name "Phoenix Voyages", default OG image from `cdn.tailfire.ca`, Twitter card settings, verification codes.
- [ ] **Step 3:** Commit: `feat(ota): robots.txt, global metadata, OG defaults`

---

## Deployment Checklist

After all phases complete:

- [ ] Push OTA to preview branch, verify on Vercel preview URL
- [ ] Run database migration on Preview environment
- [ ] Test all routes on preview (deals, advisors, search, chat, join)
- [ ] Configure `phoenixvoyages.ca` domain in Vercel project settings
- [ ] Configure `join.phoenixvoyages.ca` redirect in Vercel
- [ ] Set DNS: point `phoenixvoyages.ca` from WordPress host to Vercel
- [ ] Verify 301 redirects work for all WordPress URLs
- [ ] Submit new sitemap to Google Search Console
- [ ] Monitor Search Console for crawl errors over next 2 weeks
- [ ] Decommission WordPress after confirming zero 404s
