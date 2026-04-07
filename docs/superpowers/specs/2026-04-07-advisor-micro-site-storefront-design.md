# Agent Micro Site — Personal Travel Storefront Design

**Goal:** Transform the advisor page from a simple profile into a branded lead-generation storefront where every visitor, dream board, and trip request flows back to the advisor through referral attribution.

**Business value:** This is the advisor's most valuable tool. They share their link on social media, email signatures, and business cards. Every click is tracked, every lead is theirs. The micro site sells the advisor's expertise and funnels visitors into the dream board pipeline.

---

## 1. Lead Attribution Flow

```
Advisor shares link: phoenix.ca/advisor/sarah?ref=sarah
  → Visitor lands → ota_ref cookie set (30 days)
  → Visitor browses OTA (any page) → cookie persists
  → Visitor opens AI chat → advisor slug in system prompt
  → Visitor builds dream board → trip request assigned to Sarah
  → Visitor submits → lead created with Sarah as owner
  → Sarah contacts them → booking → commission
```

**Already built:**
- `ota_ref` cookie set by middleware ✅
- Cookie read in chat API route for advisor attribution ✅
- Owner resolution chain: CRM > referral > group > round-robin ✅
- Trip promotion pipeline attributes to advisor ✅

**Needs building:**
- Storefront page redesign (current profile is a resume, not a storefront)
- Personalized AI concierge on advisor pages
- "Start Planning" CTA that opens dream board with advisor attribution
- Group trip section with urgency/availability
- Contact form (currently a dead `#contact` anchor)

---

## 2. Storefront Page Architecture

The advisor page uses the same visual language as entity hub pages (ImageCardFrame, Dream Board aesthetic) but with advisor-specific sections.

### Page Structure

```
/advisor/[slug]
├── AdvisorHero — Full-bleed photo, name, title, rating, CTAs
├── SpecialtyPills — Scrollable: Caribbean, Cruises, Honeymoons
├── AiPrompt — "Sarah's AI Travel Assistant" (personalized)
├── CuratedTrips — Group cruises, published trips (ImageCardFrame)
├── FeaturedDeals — Current offers Sarah promotes (ImageCardFrame)
├── Destinations — Places Sarah knows best (destination cards)
├── Testimonials — Client stories with names and context
├── AboutBio — Full bio, certifications, social links
└── ContactForm — Name, email, message, phone (creates lead)
```

### Hero Section

```
┌─────────────────────────────────────────────┐
│  [Background: scenic destination photo]      │
│                                              │
│          [Agent Photo - circle]              │
│        SARAH MITCHELL                        │
│    LUXURY TRAVEL ADVISOR                     │
│    ⭐ 4.9 · 127 Reviews · 15 Years          │
│                                              │
│  [✨ Start Planning]  [📞 Contact Sarah]     │
└─────────────────────────────────────────────┘
```

- Background: curated travel photo from advisor's top destination, or uploaded cover photo
- Photo: advisor profile photo (TLN sync or uploaded)
- "Start Planning" → opens dream board with `ota_ref` cookie already set
- "Contact Sarah" → scrolls to contact form

### Curated Trips Section

Shows published trips the advisor is promoting. Uses ImageCardFrame with:
- Trip hero image
- Group badge: "🚢 Group Cruise" or "🏝 Curated Trip"
- Price badge
- Availability: "12 spots left" (urgency)
- Date + duration
- AddToTrip button

Data source: `ota_published_trips` linked to advisor profile.

### Featured Deals Section

Shows deals the advisor has hand-picked. Uses ImageCardFrame with:
- Deal image
- Savings badge: "SAVE 30%"
- Supplier, destination, dates
- "View Deal" CTA

Data source: `advisor_featured_deals` join table → `deals`.

### Destinations Section

Shows destinations the advisor specializes in. Uses the existing destination cards (image-forward) with links to destination hub pages.

Data source: `advisor_profiles.destinations[]` → matched to destination slugs.

### Testimonials Section

Client reviews in a card format:
- Quote text (italic)
- Client name + initial avatar
- Trip context: "Honeymoon to Greece"
- Star rating

Data source: `advisor_profiles.reviews` JSONB array.

### Contact Form

Simple lead capture:
- Name (required)
- Email (required)
- Phone (optional)
- Message (optional, with placeholder: "Tell Sarah what you're dreaming of...")
- Submit → creates OTA lead via `/ota/leads` with advisor slug

---

## 3. Personalized AI Concierge

When a visitor is on an advisor's page, the AI concierge becomes **the advisor's AI assistant**:

### System Prompt Extension

```
--- Advisor Context ---
The visitor is on Sarah Mitchell's micro site (Luxury Travel Advisor).
Sarah specializes in: Caribbean, Cruises, Honeymoons, Europe
Sarah's destinations: Santorini, Cozumel, Amalfi Coast, Maldives
Sarah has 15 years of experience and a 4.9/5 rating.

When helping this visitor:
- Reference Sarah by name: "Sarah is amazing with Caribbean cruises"
- Promote Sarah's expertise naturally
- When they're ready to book: "Want me to connect you with Sarah directly?"
- If they ask about Sarah's trips: search her curated/published trips
- All leads go to Sarah — use her slug for captureContact
```

### Suggestion Chips (Advisor-Specific)

```
- "What trips does Sarah recommend?"
- "Tell me about Sarah's group cruise"
- "Help me plan a honeymoon"
- "What makes Sarah special?"
```

---

## 4. Referral Link System

### URL Patterns

```
/advisor/sarah                    — Micro site (sets ota_ref=sarah)
/advisor/sarah?ref=sarah          — Explicit referral (same effect)
/advisor/sarah/deals              — Sarah's featured deals
/advisor/sarah/trips              — Sarah's published trips
/advisor/sarah/trips/[tripSlug]   — Individual trip detail
```

### Cookie Behavior

When someone visits `/advisor/sarah`:
1. Middleware sets `ota_ref=sarah` cookie (30-day expiry)
2. Cookie persists across ALL OTA pages (not just advisor page)
3. Every dream board, AI chat, and lead captures the advisor slug
4. If visitor later comes through a different advisor, the FIRST referral wins (first-touch attribution)

**Already implemented** in OTA middleware.

---

## 5. Fixes Needed (Current Bugs)

### Bug 1: Trips endpoint 404
- Frontend calls: `/advisor-profiles/by-slug/{slug}/published-trips`
- API exposes: `/advisor-profiles/by-slug/{slug}/trips`
- **Fix:** Change OTA fetch to use `/trips`

### Bug 2: Contact form missing
- Profile header has `#contact` anchor but no form
- **Fix:** Add ContactForm component at bottom of page

### Bug 3: "Ask AI" button disabled
- Profile header references AI but it's not wired
- **Fix:** Wire to `openChat()` with advisor context prompt

---

## 6. Implementation Order

### Phase 1: Fix + Polish (Quick Wins)
1. Fix trips endpoint path (1 line change)
2. Add contact form component with lead capture
3. Wire "Ask AI" button to openChat with advisor context
4. Add personalized AI system prompt for advisor pages
5. Add advisor-specific suggestion chips

### Phase 2: Storefront Redesign
6. Redesign advisor hero (full-bleed, Dream Board aesthetic)
7. Redesign curated trips section (ImageCardFrame cards)
8. Redesign featured deals section (ImageCardFrame cards)
9. Redesign destinations section (destination hub cards)
10. Redesign testimonials section (card format)

### Phase 3: Lead Machine Features
11. "Start Planning" CTA → opens dream board with attribution
12. Group trip promotion with availability/urgency
13. Social sharing optimization (OG images, meta tags)
14. Advisor analytics (views, leads, conversion tracking)

---

## Scope

### Build Now
- Fix trips endpoint (Bug 1)
- Contact form with lead capture (Bug 2)
- AI integration — personalized concierge on advisor pages (Bug 3)
- Storefront hero redesign (Dream Board aesthetic)
- Curated trips and deals sections with ImageCardFrame
- Advisor-specific AI suggestion chips
- "Start Planning" CTA with attribution

### Deferred
- Group trip availability/urgency system
- Social sharing OG image generation
- Advisor analytics dashboard
- Cover photo upload (use curated for now)
- Video introduction support
