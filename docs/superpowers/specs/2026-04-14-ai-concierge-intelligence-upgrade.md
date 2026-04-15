# AI Concierge Intelligence Upgrade

**Goal:** Transform the OTA AI concierge from a stateless product-search bot into a contextual, knowledgeable travel advisor that checks our data first, never forgets what the user said, and knows what they've been browsing.

**Business value:** The concierge is the primary conversion funnel for the OTA. Every improvement to its intelligence directly increases lead quality, basket completion, and advisor handoff rates. A concierge that feels like a real travel advisor — not a chatbot — is the differentiator.

---

## 1. Problem Statement

The current AI concierge has 9 tools but zero knowledge. It can search products and capture leads, but it cannot look up what Phoenix Voyages already knows about destinations, cruise lines, or ships. This creates five failure modes:

| Failure | Example | Root Cause |
|---------|---------|------------|
| No destination knowledge | "Tell me about Santorini" → generic AI response | No tool to query our 4,380 enriched destinations |
| Forgets mid-conversation | "I'm traveling in November with my wife" → 3 messages later: "When are you traveling?" | No fact extraction from conversation history |
| Blind to browsing | User viewed Caribbean + Mediterranean pages, opens chat → "Where do you want to go?" | No browsing session tracking |
| Shallow page context | On Jamaica page, asks "What should I do there?" → AI doesn't have highlights/tips | Page context flattening in chat-widget.tsx strips rich metadata |
| Wrong tool selection | "Jamaica beach vacation" → searches flights (needs airports/dates) instead of cruises | No clear tool decision framework |

---

## 2. Architecture: Knowledge Tools + Conversation State

### Approach

Add **knowledge lookup tools** so the AI can query our data on demand. Add a **conversation fact extractor** so the AI never forgets what the user said. Add **browsing history tracking** so the AI knows what pages the user visited. Fix the **page context flattening** so the AI has full destination data for the current page without a tool call.

### Future path

The knowledge tools are designed as a clean interface. The current implementation uses direct DB queries via existing API endpoints. In the future, the same tool interface can be backed by a **vector search (RAG) system** — swap the implementation of `lookupDestination` from "API call" to "vector search + reranking" without changing anything else in the stack.

---

## 3. Knowledge Tools

Two new tools added to the AI tool factory.

### 3.1 `lookupDestination`

**Purpose:** Query our enriched destination database before answering any destination question.

**Input:**
```typescript
{
  query: string  // Destination name, slug, or partial match (e.g., "Jamaica", "santorini-greece", "Bali")
}
```

**Implementation (two-step: search → detail):**
1. Try exact slug match: `GET /destinations/by-slug/{query}` (returns full enriched payload with metadata)
2. If 404, name search: `GET /destinations?search={query}&pageSize=3` (returns base rows only — name, slug, type, countryCode)
3. Take the best match from search results, then fetch full detail: `GET /destinations/by-slug/{bestMatch.slug}`
4. Return the enriched metadata from the detail response

**Note:** The list endpoint (`GET /destinations?search=`) searches `name` and `normalizedName` but NOT aliases. For alias-heavy matching, the by-slug path is more reliable. This is a known limitation — future RAG upgrade will solve it.

**Output to AI:**
```typescript
{
  found: true,
  name: "Jamaica",
  slug: "jamaica",
  type: "country",
  oneLiner: "Reggae rhythms, jerk spice, and turquoise water that stays warm year-round",
  highlights: ["Dunn's River Falls", "Blue Mountains coffee", "Negril Seven Mile Beach", "Port Antonio rafting"],
  bestMonths: ["December", "January", "February", "March"],
  budgetTier: "mid-range",
  typicalStay: "5-7 days",
  travelTips: ["Book all-inclusive for best value", "Rent a car to explore beyond resorts", "Try authentic jerk from roadside stands"],
  tags: ["beach", "all-inclusive", "reggae", "snorkeling", "cruise-port"],
  vibeWords: ["relaxing", "vibrant", "tropical", "laid-back"],
  currency: "JMD (Jamaican Dollar) — USD widely accepted",
  languages: ["English", "Jamaican Patois"],
  airportIata: "MBJ",
  travelDescription: "2-3 paragraph curated travel guide..."
}
```

**Fallback:** If destination not found or not enriched:
```typescript
{
  found: false,
  query: "Timbuktu",
  suggestion: "I don't have detailed info on Timbuktu in our system yet. I can share what I know from general travel knowledge, or connect you with an advisor who might have insider tips."
}
```

### 3.2 `lookupCruiseLineOrShip`

**Purpose:** Query our cruise catalog for cruise line or ship details before answering brand/ship questions.

**Input:**
```typescript
{
  query: string,          // Name or partial match (e.g., "Royal Caribbean", "Symphony of the Seas")
  type?: "line" | "ship"  // Optional hint — if omitted, searches both
}
```

**Implementation (uses by-slug detail endpoints for rich data):**
1. Search cruise lines: `GET /cruise-repository/lines` → filter by name match → if found, fetch detail via `GET /cruise-repository/lines/by-slug/{slug}`
2. Search ships: `GET /cruise-repository/ships` or match from line's fleet → if found, fetch detail via `GET /cruise-repository/ships/by-slug/{slug}`
3. Return the best match with full spec data

**Output to AI (cruise line):**
```typescript
{
  found: true,
  type: "cruise_line",
  name: "Royal Caribbean International",
  slug: "royal-caribbean",
  logoUrl: "...",
  shipCount: 28,
  ships: ["Symphony of the Seas", "Wonder of the Seas", "Icon of the Seas", ...],
  regions: ["Caribbean", "Mediterranean", "Alaska", "Northern Europe"],
  knownFor: "Mega-ships with waterslides, surf simulators, and Broadway shows. Best for families and active travelers."
}
```

**Output to AI (ship):**
```typescript
{
  found: true,
  type: "ship",
  name: "Celebrity Reflection",
  slug: "celebrity-reflection",
  cruiseLine: "Celebrity Cruises",
  imageUrl: "...",
  shipClass: "Solstice Class",
  passengerCapacity: 3046,
  yearBuilt: 2012,
  deckCount: 16,
  upcomingSailings: 42
}
```

### 3.3 Expand `searchCruises` with `shipId`

The backend `sailing-search.dto.ts` already supports `shipId`, `embarkPortId`, and other filters that the current OTA tool doesn't expose. Expand the `searchCruises` input schema to accept optional `shipId` so the AI can search sailings for a specific ship after looking it up.

---

## 4. Conversation State Extractor

**Purpose:** Extract structured facts from the conversation history each turn and inject them into the system prompt so the AI never re-asks known information.

### Implementation

A server-side function `extractConversationFacts(messages)` that runs at the start of each `/api/chat` request.

**Not AI-powered** — uses rule-based pattern matching on message text and structured data from tool call results:

| Fact | Extraction method |
|------|-------------------|
| Destination | Pattern match country/city names from user messages + lookup tool outputs (NOT incidental search results) |
| Dates | Regex for month names, "YYYY-MM-DD", "next November", etc. |
| Travelers | Pattern match "my wife and I" (2 adults), "family of 4", numbers + "people"/"adults"/"kids" |
| Budget | Keywords: "budget", "luxury", "mid-range", dollar amounts |
| Interests | Keywords: "beach", "snorkeling", "culture", "food", "adventure", "relaxation" |
| Travel style | Keywords: "honeymoon", "anniversary", "family vacation", "girls trip" |
| Origin | Airport codes (3 uppercase letters), city names near "from" or "flying from" |
| Decisions made | Extracted from tool results: what they searched, what they added to basket, what they rejected |

### Fact precedence (Codex recommendation)

When facts conflict, use this priority:
1. Latest explicit user statement (highest)
2. Current page context
3. Lookup tool resolution
4. Browsing history (lowest)

Never promote assistant free text as fact. Only trust explicit user messages and structured tool outputs.

### Output format

```typescript
interface ConversationFacts {
  destination?: string
  dates?: { from?: string; to?: string; flexible?: boolean; description?: string }
  travelers?: { adults?: number; children?: number; description?: string }
  budget?: string
  interests?: string[]
  travelStyle?: string
  origin?: string
  decisionsMade?: string[]
  searchesPerformed?: string[]
}
```

### Injected into system prompt

```
--- Conversation Context ---
Traveler: Couple (2 adults), honeymoon
Destination interest: Jamaica (Montego Bay)
Travel dates: November 2026 (flexible)
Budget: Mid-range
Preferences: Beach, all-inclusive, snorkeling
Origin: Toronto (YYZ)
Searches done: Caribbean cruises (5 results shown)
Basket: 1 cruise saved
---
```

### Key rules
- Grows incrementally — each turn can add facts, never loses them
- Tool results are the richest source of facts (structured data)
- User messages are parsed for new information only
- Only promote explicit user facts and dedicated lookup-tool outputs, NOT incidental search results
- Cheap — no API calls, no AI inference, just string parsing
- Must have unit tests for extraction logic

---

## 5. Browsing Session Awareness

**Purpose:** Track the last 10 entity pages visited in the session so the AI can reference what the user has been exploring.

### Client-side tracking

**Modified file:** `apps/ota/src/stores/ai-panel-store.ts`

Add `browsingHistory` array to the Zustand store:

```typescript
browsingHistory: Array<{
  type: string       // "destination" | "ship" | "cruise_line" | "sailing" | "region" | "deal"
  name: string       // "Santorini"
  slug: string       // "santorini-greece"
  timestamp: number  // Date.now()
}>
```

**Modified file:** `apps/ota/src/components/page-context-bridge.tsx`

When a new entity page loads, call `addPageVisit({ type, name, slug })`:
- Deduplicate by `type + slug` (not just slug — a destination and a region could share a slug)
- Move revisits to the front (most recent first)
- Cap at 10 entries
- **Exclude the current page** — it's already sent separately as `pageContext`

### Sent with chat requests

**Modified file:** `apps/ota/src/components/chat/chat-widget.tsx`

The custom fetch currently only sends extra payload when `currentPageContext` exists. Fix: **always send `browsingHistory`** even when `pageContext` is absent (user might be on homepage after browsing destinations):

```typescript
body: {
  messages,
  pageContext: currentPageContext,    // may be null
  browsingHistory: useAiPanelStore.getState().browsingHistory  // always sent
}
```

### Injected into system prompt

```
--- Browsing History ---
Recently viewed: Santorini (destination), Amalfi Coast (destination), Celebrity Cruises (cruise line)
Currently viewing: Mediterranean Cruises (region page)
---
```

---

## 6. Richer Page Context Injection

**Purpose:** When the user is on an entity page, pass the FULL enriched metadata through to the system prompt so the AI can answer questions about the current page instantly — no tool call needed.

### Where the bottleneck actually is (Codex finding)

The `PageContextBridge` already sends full metadata to Zustand — the problem is downstream:
- **`chat-widget.tsx` line ~69** flattens arrays to comma-separated strings and drops fields like `travelDescription`, `travelTips` array, `vibeWords`, `languages`
- **`route.ts` line ~167** only formats a subset of fields into the prompt

### What changes

**`apps/ota/src/components/chat/chat-widget.tsx`:** Stop flattening. Pass the full metadata object through to the API.

**`apps/ota/src/app/api/chat/route.ts`:** Expand the page context section builder to include all enriched fields:

For destinations: oneLiner, highlights (array), bestMonths (array), budgetTier, typicalStay, travelTips (array), tags (array), vibeWords (array), currency, languages, airportIata, travelDescription

For ships: shipClass, passengerCapacity, yearBuilt, deckCount, notable features

For cruise lines: fleet size, ship names, regions served, brand personality

For sailings: full itinerary with port names, embark/disembark ports, voyage code, cabin category prices

### Missing metadata on non-destination pages (Codex finding)

Destination pages already pass rich metadata via the adapter. But **cruise-line hub pages** (`apps/ota/src/app/cruise-lines/[slug]/page.tsx`) and **ship hub pages** (`apps/ota/src/app/ships/[slug]/page.tsx`) currently don't forward derived metadata to the bridge. Add metadata forwarding for these pages so the AI has context when users browse ships and cruise lines.

### Token budget

Full enrichment for a destination adds ~300-500 tokens to the system prompt. Negligible against Claude Sonnet's 200K context window. Only the current page gets full enrichment — browsing history is names/types only.

---

## 7. System Prompt Rewrite

The system prompt is restructured from scattered rules into a clear hierarchy with a decision tree.

### New structure

```
1. PERSONALITY
   (unchanged — warm, one-question-at-a-time, not salesy, texting a friend)

2. KNOWLEDGE PROTOCOL
   - Before answering ANY question about a place, cruise line, or ship:
     check Conversation Context and Page Context first.
     If the answer isn't there, call the relevant lookup tool.
   - Say something warm while you look it up:
     "Ooh, Jamaica — let me see what we've got..."
     "Great question, let me pull up the details..."
   - Ground all answers in our data first.
   - If our data doesn't cover it, supplement with general knowledge.
   - If the question is about something we SHOULD have and don't,
     say so honestly and offer to connect with an advisor.

3. CONVERSATION STATE
   - Read the Conversation Context block carefully every turn.
   - NEVER ask for information already in it.
   - When you learn something new (dates, travelers, preferences),
     it will appear in the next turn's context automatically.

4. TOOL DECISION TREE
   - User mentions a destination → lookupDestination, then searchCruises
   - User mentions destination + dates → searchCruises + searchFlights + searchHotels
   - User asks about a cruise line/ship → lookupCruiseLineOrShip
   - User asks about tours/activities → browseTours
   - User says "book" or "advisor" → requestAdvisor
   - User expresses interest in a result → manageTripBasket
   - NEVER search flights without origin airport + date
   - NEVER search hotels without check-in/check-out dates

5. CONVERSATIONAL FILLER
   - When calling a lookup/search tool, lead with a brief warm phrase
   - NEVER say "I'm searching the database" or "calling the API"
   - Keep it human: "Let me check on that...", "One sec, pulling that up..."

6. CONTEXT AWARENESS
   - Reference browsing history: "I see you've been exploring..."
   - Reference basket items: "You've already saved that cruise..."
   - Reference conversation facts: "Since you're traveling in November..."
   - If on an advisor page, use their name and attribute all leads

7. ONE THING AT A TIME
   (unchanged — one question per message, 2-3 sentences max)

8. WHAT NOT TO DO
   (unchanged — no capability dumps, no numbered lists, no price caveats)
```

### Step count increase

Current `stopWhen: stepCountIs(5)` is too tight with lookup + search in one turn. Increase to `stepCountIs(8)` to allow: lookup destination → search cruises → search flights → present results without hitting the cap.

---

## 8. UI Handling for Lookup Tools (Codex finding)

New lookup tools (`lookupDestination`, `lookupCruiseLineOrShip`) are **internal knowledge tools** — their results should NOT render as product cards or "Searching..." status in the chat UI.

### Modified file: `apps/ota/src/components/chat/chat-panel.tsx`

Currently, the chat panel splits tools into two categories:
- **Search tools** (searchFlights, searchHotels, searchCruises, browseTours) → product cards
- **Action tools** (captureContact, requestAdvisor, etc.) → inline status

Add a third category:
- **Internal tools** (lookupDestination, lookupCruiseLineOrShip) → **hidden entirely** from the UI

The AI's conversational filler ("Let me check on that...") provides all the feedback the user needs. Showing "Looking up destination..." would break the illusion of a knowledgeable advisor.

---

## 9. File Changes Summary

### New files

| File | Purpose |
|------|---------|
| `apps/ota/src/lib/ai/conversation-state.ts` | `extractConversationFacts(messages)` — rule-based fact extractor |
| `apps/ota/src/lib/ai/tools/lookup-destination.ts` | `lookupDestination` tool definition |
| `apps/ota/src/lib/ai/tools/lookup-cruise-line-or-ship.ts` | `lookupCruiseLineOrShip` tool definition |

### Modified files

| File | Change |
|------|--------|
| `apps/ota/src/app/api/chat/route.ts` | New system prompt, inject conversation facts + browsing history, import new tools, bump stepCountIs to 8 |
| `apps/ota/src/lib/ai/tools.ts` | Import and register the 2 new lookup tools, add `shipId` to searchCruises |
| `apps/ota/src/stores/ai-panel-store.ts` | Add `browsingHistory` array with `addPageVisit()` action |
| `apps/ota/src/components/page-context-bridge.tsx` | Call `addPageVisit()`, exclude current page from history |
| `apps/ota/src/components/chat/chat-widget.tsx` | Stop flattening metadata, always send browsingHistory (even when pageContext is absent) |
| `apps/ota/src/components/chat/chat-panel.tsx` | Hide internal lookup tools from UI rendering |
| `apps/ota/src/app/cruise-lines/[slug]/page.tsx` | Forward metadata to PageContextBridge |
| `apps/ota/src/app/ships/[slug]/page.tsx` | Forward metadata to PageContextBridge |

### No backend API changes needed

All data the new tools need is already exposed via existing endpoints:
- `GET /destinations/by-slug/{slug}` — full enriched detail
- `GET /destinations?search={name}&pageSize=3` — name search (base rows, then follow up with by-slug)
- `GET /cruise-repository/lines` + `GET /cruise-repository/lines/by-slug/{slug}` — list + detail
- `GET /cruise-repository/ships/by-slug/{slug}` — ship detail
- `GET /cruise-repository/sailings?shipId=...` — already supported in backend DTO

---

## 10. Conversation Examples (Before vs After)

### Example 1: Destination question from homepage

**Before:**
```
User: Tell me about Santorini
AI: Santorini is a beautiful Greek island known for its stunning sunsets...
    [generic AI knowledge, may be wrong]
```

**After:**
```
User: Tell me about Santorini
AI: Ooh, Santorini — let me pull up what we know...
    [calls lookupDestination("Santorini") — hidden from UI]
AI: Santorini is absolutely dreamy — those iconic blue domes against the caldera views never get old.
    Best time to visit is May through October, and most people spend 3-5 days there.
    Don't miss the sunset from Oia, the Red Beach hike, and a wine tasting at Santo Wines.
    Want me to find some cruises that stop in Santorini?
    [grounded in our enriched data]
```

### Example 2: Forgetting context

**Before:**
```
User: I'm planning a honeymoon in November, just me and my wife
AI: How exciting! Where are you dreaming of going?
User: Maybe the Caribbean
AI: [searches cruises]... Here are some options!
User: What about flights?
AI: Where would you be flying from, and when are you thinking of traveling?
    [FORGOT: November, already stated]
```

**After:**
```
User: I'm planning a honeymoon in November, just me and my wife
AI: How exciting! Where are you dreaming of going?
    [Conversation Context: travelers=couple, dates=November, style=honeymoon]
User: Maybe the Caribbean
AI: [searches cruises for Caribbean, November]... Here are some gorgeous options!
User: What about flights?
AI: Since you're looking at November, let me search flights from Toronto for two.
    [reads Conversation Context: dates=November, travelers=2, origin=YYZ default]
```

### Example 3: Browsing awareness

**Before:**
```
[User browses Santorini page, then Amalfi Coast page, then opens chat]
User: Hi, I need help planning a trip
AI: Hi there! Where are you dreaming of going?
```

**After:**
```
[User browses Santorini page, then Amalfi Coast page, then opens chat]
User: Hi, I need help planning a trip
AI: Hey! I see you've been checking out Santorini and the Amalfi Coast — are you
    thinking a Mediterranean getaway? Those are two of our most popular destinations,
    and there are some amazing cruises that hit both.
```

---

## 11. Testing

### Unit tests (new)

- `extractConversationFacts()` — test all extraction patterns: dates, travelers, budget, interests, origin, destinations
- `lookupDestination` tool — test slug match, name search fallback, not-found case
- `lookupCruiseLineOrShip` tool — test line match, ship match, not-found case
- System prompt assembly — test that all context blocks are injected correctly

---

## Scope

### Build now
- `lookupDestination` tool (two-step: search → detail)
- `lookupCruiseLineOrShip` tool (list → by-slug detail)
- Expand `searchCruises` with `shipId` param
- Conversation state extractor
- Browsing session history tracking
- Fix page context flattening (widget + route)
- Add metadata forwarding for cruise-line and ship pages
- Hide internal lookup tools in chat UI
- System prompt rewrite
- Bump step count to 8
- Unit tests for extraction and tools

### Deferred
- Cross-session memory (remembering past conversations)
- Vector search / RAG backend for knowledge tools
- Alias-grade destination matching (needs backend search improvement)
- Personalized recommendations based on browsing patterns
- AI-powered fact extraction (upgrade from rule-based)
- Proactive suggestions ("Based on your browsing, you might love...")
