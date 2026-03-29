# Flight Search & Request — Design Specification

**Date:** 2026-03-29
**Status:** Draft
**Author:** Claude + Alex Guertin

## Overview

Redesign the OTA flight search into a Google Flights / Kayak-style experience with a price calendar, smart filters, AI-powered insights, and a round-trip selection flow. Optimized for the full Amadeus Self-Service API suite. Checkout creates a Flight Request in Tailfire for advisor fulfillment (self-serve booking deferred until Huntington consolidator API is set up).

**Core principles:**
- **Google Flights UX** — price calendar as primary discovery, not just a date picker
- **Amadeus-optimized** — leverage 6+ Amadeus APIs for rich data (cheapest dates, price analysis, direct routes, delay prediction, branded fares)
- **Fast & responsive** — search form instant, results stream in, filters are client-side
- **Round-trip flow** — select outbound → select return → confirm both → request
- **Request model** — consumer submits flight request, advisor books via Snap Engine or consolidator
- **AI-ready** — concierge context for proactive savings tips and advisor handoff

---

## 1. Search Form

### Layout
Light background (`#fafaf8`), matching the rest of the OTA. No dark header. The form sits at the top of the page inside a white card with subtle shadow.

### Fields

| Field | Component | Source | Required |
|-------|-----------|--------|----------|
| Trip type | Pill toggle | Round trip / One way / Multi-city | Yes (default: Round trip) |
| From | Airport Autocomplete | Amadeus `referenceData.locations` | Yes |
| To | Airport Autocomplete | Amadeus `referenceData.locations` | Yes |
| Swap | Button | Swaps From ↔ To | — |
| Depart | Date picker | Calendar | Yes |
| Return | Date picker | Calendar (disabled for one-way) | Yes for round trip |
| Travelers | Dropdown | Adults (1-9), Children (0-6) | Yes (default: 1 adult) |
| Class | Dropdown | Economy, Premium Economy, Business, First | Yes (default: Economy) |

### Quick Filter Pills (below form)
Instant client-side filters shown after results load:
- All (default)
- Nonstop only
- Under $500
- Morning departure
- Shortest flight

### Behavior
- Form submits via URL query params (SSR-compatible, shareable URLs)
- Airport autocomplete uses existing `AirportAutocomplete` component
- Swap button animates the exchange
- Date picker shows price hints from Cheapest Date Search (if available)

---

## 2. Price Calendar

### Data Source
Amadeus **Flight Cheapest Date Search** (`shopping.flightDates.get()`)
- Input: origin, destination
- Returns: cheapest fare per departure date for a range

### Display
Full month calendar grid below the search form. Shows:
- Date number
- Cheapest fare for that date in small text
- Color coding:
  - Green background = cheapest dates (bottom 25% of prices)
  - Gold background = currently selected date
  - Dimmed = past dates
  - White = available, normal price

### Interaction
- Click a date → updates the departure date in the search form and triggers a new search
- Month navigation (← →) loads cheapest dates for adjacent months
- Calendar is collapsible — can be hidden to show just results

### Mobile
- Horizontal scrolling date strip (not full calendar grid)
- Shows 7 days at a time with prices
- Swipe to see more dates

---

## 3. Search Results

### Layout
Two-column on desktop:
- **Left sidebar (240px):** Filters
- **Right main area:** Sort pills + flight cards

Mobile: filters accessible via bottom sheet or expandable panel at top.

### Sort Options (pills above results)
- **Best** (default) — balanced score of price + duration + stops
- **Cheapest** — lowest price first
- **Fastest** — shortest duration first
- **Departure** — earliest departure time first

### Filter Sidebar

| Filter | Type | Data Source |
|--------|------|------------|
| Stops | Checkboxes | Parsed from results (Nonstop / 1 stop / 2+ stops) with cheapest price per option |
| Airlines | Checkboxes | Parsed from results, sorted by frequency |
| Price range | Slider | Min/max from results |
| Departure time | Checkboxes | Morning (6am-12pm) / Afternoon (12pm-6pm) / Evening (6pm-12am) |
| Duration | Slider | Min/max from results |
| Baggage | Checkboxes | Carry-on included / Checked bag included |

**All filters are client-side** — applied to the already-fetched results array. No re-fetch needed. This makes filtering instant.

---

## 4. Flight Result Cards

### Card Layout
Horizontal card with 3 zones:
1. **Airline badge** (left) — colored square with airline code + airline name below
2. **Flight details** (center) — departure time → duration/stops → arrival time, airport codes, flight number, baggage badges
3. **Price** (right) — fare amount, "per person", price indicator

### Price Indicator
From Amadeus **Flight Price Analysis** (`analytics.itineraryPriceMetrics.get()`):
- 📉 **Low price** (green) — below 25th percentile
- 📊 **Typical price** (amber) — 25th–75th percentile
- 📈 **High price** (red) — above 75th percentile

If Price Analysis API is unavailable, omit the indicator.

### Business Class Upsell
From Amadeus **Branded Fares Upsell** (`shopping.flightOffers.upselling.post()`):
- If premium fares exist for the same route, show ONE highlighted card with gold border
- Shows class name (Business, Premium Economy), included perks (lounge, bags, meal)
- Positioned after the first 3-4 economy results

### Delay Prediction
From Amadeus **Flight Delay Prediction** (`travel.predictions.flightDelay.get()`):
- Small badge on card: "⏱️ 92% on time" or "⚠️ Often delayed"
- Only show if prediction data is available

---

## 5. Smart Insights

### AI Savings Tip
Displayed between the price calendar and results:
- Dark card with AI icon (✦)
- "Save $127 — Flying on June 17 instead of June 15 could save you $127 per person"
- Generated by comparing selected date price vs cheapest date in the calendar
- Click opens AI concierge with the suggestion pre-loaded

### Price Insight Bar
From Amadeus **Flight Price Analysis**:
- Colored badge: Low (green) / Typical (amber) / High (red)
- Text: "$425 is about average for YYZ → CUN in June. Prices typically range $298–$512."

### Direct Flights Banner
From Amadeus **Airport Direct Destinations** (`airport.directDestinations.get()`):
- "✈️ 3 airlines fly direct from Toronto to Cancun: Air Canada, WestJet, Sunwing"
- Only shown when direct flights exist for the route

---

## 6. Round Trip Selection Flow

### Step 1: Select Outbound
- Consumer searches with round-trip dates
- Results show **outbound flights only** for the departure date
- Header: "Select your departure · YYZ → CUN · Jun 15"

### Step 2: Select Return
- After clicking an outbound flight, results swap to show **return flights**
- Header: "Select your return · CUN → YYZ · Jun 22"
- Selected outbound shown as a compact summary bar at the top
- "Change departure" link to go back

### Step 3: Confirmation
- Both flights shown in a confirmation card
- Total price (outbound + return × travelers)
- Fare details: baggage, fare class, refund policy
- "Request This Flight" CTA

### One-Way Flow
- Single selection → confirmation → request
- No step 2

---

## 7. Flight Request (Checkout)

### Guest Flow
When consumer clicks "Request This Flight":

**Form fields:**
| Field | Required | Notes |
|-------|----------|-------|
| Full name | Yes | Primary contact |
| Email | Yes | For confirmation |
| Phone | Yes | For advisor follow-up |
| Number of travelers | Yes | Pre-filled from search |
| Special requests | No | Textarea — wheelchair, extra bags, seating preferences |

### Logged-In Client Flow (future)
- Pre-filled from Tailfire contact profile
- Traveler details (names, DOB, passport) pre-filled from traveler profiles
- Just confirm and submit

### What Gets Created in Tailfire
- **New Lead** (if guest) or linked to existing contact
- **Flight Request** record with:
  - Selected outbound flight details (airline, flight number, times, fare)
  - Selected return flight details (if round trip)
  - Total price, fare class, baggage
  - Traveler count
  - Special requests
  - Amadeus offer ID (for advisor to re-price if needed)
- **Notification** to assigned advisor or advisor queue
- **Email confirmation** to consumer: "We've received your flight request. An advisor will confirm your booking within 2 hours."

---

## 8. Amadeus API Integration Map

| Feature | Amadeus API | Method | When Called |
|---------|-------------|--------|------------|
| Airport autocomplete | Reference Data Locations | `referenceData.locations.get()` | On typing in From/To fields |
| Flight search | Flight Offers Search | `shopping.flightOffersSearch.get()` | On form submit |
| Price calendar | Cheapest Date Search | `shopping.flightDates.get()` | On page load (after origin/destination set) |
| Price insight | Flight Price Analysis | `analytics.itineraryPriceMetrics.get()` | After results load |
| Direct routes | Airport Direct Destinations | `airport.directDestinations.get()` | After results load |
| Delay prediction | Flight Delay Prediction | `travel.predictions.flightDelay.get()` | Per flight card (lazy, top 5 only) |
| Premium upsell | Branded Fares Upsell | `shopping.flightOffers.upselling.post()` | After results load (top result only) |
| Fare confirmation | Flight Offers Pricing | `shopping.flightOffers.pricing.post()` | On flight selection (confirmation step) |

### API Call Strategy
- **Core search** (Flight Offers Search) is the only blocking call — everything else loads asynchronously
- Price calendar, price analysis, direct routes, and upsell all stream in via separate Suspense boundaries or client-side fetches
- Delay prediction is lazy-loaded per card (only for visible cards)
- All API responses cached with ISR tags where appropriate

### Rate Limiting
- Amadeus: 10 req/min for flights, shared token cache
- Price calendar and analysis calls should be debounced and cached aggressively
- Consider server-side caching layer (Redis/memory) for frequently searched routes

---

## 9. Mobile Design

### Search Form
- Full-width stacked fields
- Airport fields expand to full-screen picker with autocomplete
- Date picker expands to full-screen calendar with price annotations

### Price Calendar
- Horizontal scrolling date strip (not grid)
- 7 dates visible, swipe for more
- Prices below each date

### Filters
- "Filters" button at top → opens bottom sheet
- Applied filters shown as pills below the button
- Filter count badge on the button

### Results
- Full-width cards, single column
- Airline badge + times + price in a compact layout
- Swipe left on card for quick actions (Save, Share)

---

## 10. Performance

### Streaming Architecture
```
0ms     → Search form renders (instant)
100ms   → Form submitted, loading skeleton appears
1-3s    → Flight results stream in (Amadeus Flight Offers Search)
1-3s    → Price calendar loads (parallel, Amadeus Cheapest Date Search)
2-4s    → Price insight appears (Amadeus Price Analysis)
2-4s    → Direct routes banner appears (Amadeus Direct Destinations)
3-5s    → Business upsell card appears (Amadeus Branded Fares Upsell)
Lazy    → Delay predictions load per visible card
```

### Client-Side Filtering
All filters operate on the already-loaded results array — no server round-trips. This makes filtering feel instant regardless of API latency.

### Caching
- Price calendar data: cache per route for 1 hour
- Direct destinations: cache per airport for 24 hours
- Price analysis: cache per route+month for 6 hours

---

## 11. Scope & Phasing

### This Spec Covers
- Complete flight search page redesign (form, calendar, filters, results, cards)
- Round-trip selection flow (outbound → return → confirm)
- Flight request submission (guest flow)
- 6 Amadeus API integrations
- Mobile responsive design
- AI concierge context integration

### Deferred
- Self-serve booking via Amadeus Flight Create Orders (needs Huntington consolidator setup)
- Logged-in client pre-fill (needs consumer auth)
- Multi-city search (complex flow, separate spec)
- Seat map display (Amadeus Seatmap API — Phase 2)
- Flight status tracking (post-booking feature)
- Payment collection via Stripe (needs consolidator flow)

---

## 12. Mockup Reference

Visual mockup created during brainstorming:
`.superpowers/brainstorm/64965-1774749410/content/flight-search-layout.html`

Key design decisions:
- Light background matching OTA theme (not dark header)
- Price calendar prominent below search form
- Filter sidebar on desktop, bottom sheet on mobile
- Flight cards with airline badges, time visualization, price indicators
- AI savings tip between calendar and results
- Business class upsell as highlighted card with gold border
