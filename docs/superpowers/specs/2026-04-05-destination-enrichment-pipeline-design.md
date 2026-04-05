# AI-Curated Destination Enrichment Pipeline Design

**Goal:** Build a batch enrichment pipeline that pulls raw data from multiple sources (Wikipedia, climate, country data), runs it through an AI curation layer to produce travel-focused content, and stores it in destination metadata for pages and AI context.

**Principle:** Every piece of content we present to travelers is curated through an AI travel editor. Raw data is the ingredient — curated content is the dish we serve.

---

## 1. Pipeline Architecture

```
Raw Sources                AI Curation Layer              Storage              Consumers
─────────                  ─────────────────              ───────              ─────────
Wikipedia API    ──┐
Climate data     ──┼──→  AI Travel Editor Prompt  ──→  metadata JSONB  ──→  Entity Pages
Country lookup   ──┤     (LLM curates for travel)      destination_cache     AI Concierge
TripAdvisor      ──┤                                                         Search
Coordinates      ──┘
```

### The AI Travel Editor

A single LLM prompt that receives raw data and produces curated travel content:

```
You are a travel content editor for Phoenix Voyages, a premium Canadian travel agency.

Your job: Transform raw data about a destination into warm, helpful travel content that inspires and informs travelers.

Tone: Like a well-traveled friend sharing insider knowledge. Enthusiastic but honest. Specific over generic.

Rules:
- Lead with what makes this place special — what would make someone say "I NEED to go there"
- Include practical tips a traveler actually needs (not Wikipedia facts)
- Mention seasons/weather naturally: "Visit in December for perfect beach weather and fewer crowds"
- If it's a cruise port, mention what you can do in a day
- Keep descriptions to 2-3 short paragraphs max
- Use sensory language: "turquoise waters", "cobblestone streets", "the smell of fresh seafood"
- Never sound like an encyclopedia or a marketing brochure
- If you don't have enough info to write well, say so — don't pad with generic filler
```

### Input to AI Editor

```json
{
  "destination": "Cozumel, Mexico",
  "type": "port_city",
  "country": "Mexico",
  "coordinates": { "lat": 20.423, "lng": -86.922 },
  "rawWikipedia": "Cozumel is an island in the Caribbean Sea off the eastern coast of Mexico's Yucatán Peninsula, opposite Playa del Carmen...",
  "tripAdvisorData": { "rating": 4.5, "topAttractions": [...], "reviewSnippets": [...] },
  "climateZone": "tropical",
  "averageTemps": { "jan": 25, "apr": 28, "jul": 30, "oct": 28 },
  "currency": "MXN",
  "language": "Spanish",
  "timezone": "America/Cancun",
  "cruisePortInfo": { "isPort": true, "sailingsCount": 299 }
}
```

### Output from AI Editor

```json
{
  "travelDescription": "Cozumel is a Caribbean island paradise where world-class reef diving meets vibrant Mexican culture. The Palancar Reef is consistently rated among the top dive sites in the world, but you don't need to be a diver to fall in love — the island's turquoise waters are perfect for snorkeling right off the beach.\n\nAs one of the busiest cruise ports in the Western Caribbean, Cozumel has perfected the art of the day visit. Rent a scooter to explore Mayan ruins at San Gervasio, feast on fresh ceviche at a beachfront palapa, or simply float in the impossibly clear water.\n\nVisit between November and April for dry season perfection — warm days, cool evenings, and calm seas for the best reef visibility.",
  "highlights": ["World-class reef snorkeling & diving", "Mayan ruins at San Gervasio", "Fresh seafood & Mexican cuisine", "Crystal-clear Caribbean waters"],
  "bestMonths": ["November", "December", "January", "February", "March", "April"],
  "typicalStay": "2-4 days",
  "budgetTier": "mid-range",
  "travelTips": ["The east side of the island has wild beaches — rent a car to explore", "US dollars widely accepted but you'll get better prices in pesos", "Book reef excursions through local operators, not cruise ship tours — half the price"],
  "tags": ["beach", "snorkeling", "diving", "cruise-port", "tropical", "family-friendly", "food", "history"],
  "vibeWords": ["tropical", "relaxed", "adventurous", "colorful"],
  "oneLiner": "Caribbean diving paradise with Mayan history and incredible Mexican food"
}
```

---

## 2. Data Sources

### Source 1: Wikipedia (Primary content)

**API:** `https://en.wikipedia.org/api/rest_v1/page/summary/{title}`
- Free, no API key needed
- Rate limit: 200 req/sec (generous)
- Returns: extract (plain text summary), description, coordinates, thumbnail
- Search: `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={destination name}`

**What we get:** Factual description, geographic context, population, history basics.

### Source 2: Country Static Data (No API needed)

A static lookup table mapping country codes to practical travel info:

```typescript
const COUNTRY_DATA: Record<string, CountryInfo> = {
  MX: { currency: 'MXN', currencyName: 'Mexican Peso', languages: ['Spanish'], visaForCA: 'not required', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911' },
  ES: { currency: 'EUR', currencyName: 'Euro', languages: ['Spanish'], visaForCA: 'not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112' },
  // ... 80+ countries covering all cruise destinations
}
```

### Source 3: Climate Data (Derived from coordinates)

- **Climate zone:** Derived from latitude (tropical: 0-23°, subtropical: 23-35°, temperate: 35-55°, subarctic: 55+°)
- **Average temperatures:** Use a climate API or pre-computed dataset by region
- **Best months:** Derived from climate zone + hemisphere
- **Rainfall seasons:** Tropical wet/dry, Mediterranean, etc.

Simple approach: a lookup table by latitude band + hemisphere + coastal flag.

### Source 4: Timezone (From coordinates)

- **Library:** `geo-tz` npm package — pure computation from lat/lng, no API
- Returns IANA timezone string (e.g., "America/Cancun")

### Source 5: Nearby Destinations (From coordinates)

- SQL query: find destinations within 100km using PostGIS-style distance calculation
- Store top 8 nearest with distance

### Source 6: TripAdvisor (Already exists)

- Via SerpAPI, already integrated in `serpapi.service.ts`
- Returns: attractions, photos, ratings, reviews
- Rate limited: 1 req/sec

---

## 3. Enrichment Job

### Job Type: `DESTINATION_ENRICHMENT`

Added to the existing BullMQ enrichment queue.

```typescript
interface DestinationEnrichmentJobData {
  destinationId: string
  sources: ('wikipedia' | 'climate' | 'country' | 'timezone' | 'nearby' | 'tripadvisor' | 'ai_curation')[]
  priority: 'high' | 'medium' | 'low'
}
```

### Processing Flow

For each destination:

1. **Gather raw data** (parallel where possible):
   - Fetch Wikipedia summary
   - Look up country data (static)
   - Compute timezone from coordinates
   - Compute climate zone from latitude
   - Query nearby destinations from DB
   - Fetch TripAdvisor data if not cached (rate limited)

2. **AI Curation** (after all raw data collected):
   - Build the AI editor prompt with all raw data
   - Call LLM (GPT-4o-mini for cost efficiency, or GPT-4o for quality)
   - Parse structured output (JSON)
   - Validate required fields exist

3. **Store results**:
   - Update `destinations.metadata` JSONB with all enrichment data
   - Update `destination_cache` for TripAdvisor data
   - Update `destinations.summary` with the AI-curated `travelDescription`
   - Update `destinations.hero_image_url` if TripAdvisor provides better photos

### Metadata Schema (stored in JSONB)

```typescript
interface EnrichedMetadata {
  // Airport mapping (already exists)
  airportIata?: string
  airportName?: string
  amadeusCityCode?: string
  airportMappedAt?: string

  // AI-curated travel content
  travelDescription?: string      // 2-3 paragraph travel-focused description
  oneLiner?: string               // "Caribbean diving paradise with Mayan history"
  highlights?: string[]           // Top 4-6 highlights
  bestMonths?: string[]           // ["November", "December", ...]
  typicalStay?: string            // "2-4 days"
  budgetTier?: string             // "budget" | "mid-range" | "luxury"
  travelTips?: string[]           // Practical tips
  tags?: string[]                 // ["beach", "snorkeling", "diving", ...]
  vibeWords?: string[]            // ["tropical", "relaxed", "adventurous"]

  // Practical info (from country lookup)
  currency?: string               // "MXN"
  currencyName?: string           // "Mexican Peso"
  languages?: string[]            // ["Spanish"]
  visaInfo?: string               // "Not required for Canadian citizens (180 days)"
  timezone?: string               // "America/Cancun"
  utcOffset?: string              // "UTC-6"

  // Climate
  climateZone?: string            // "tropical"
  avgTemps?: Record<string, number>  // { jan: 25, feb: 26, ... }
  rainyMonths?: string[]          // ["June", "July", "August"]

  // Nearby
  nearbyDestinations?: Array<{
    slug: string
    name: string
    distance: number              // km
  }>

  // Enrichment tracking
  enrichedAt?: string             // ISO timestamp
  enrichmentVersion?: number      // Schema version
  aiModelUsed?: string            // "gpt-4o-mini"
  sources?: string[]              // ["wikipedia", "country", "climate", "ai"]
}
```

---

## 4. Consumer Usage

### Entity Pages

**Hero Section:** Shows `travelDescription` as the hero description (instead of empty or generic text).

**New Section: Destination Info**
A practical info card below activities:
- Climate: "Best time to visit: Nov-Apr (dry season, 25-30°C)"
- Currency: "Mexican Peso (MXN) — USD widely accepted"
- Language: "Spanish"
- Timezone: "CST (UTC-6)"
- Typical stay: "2-4 days"
- Budget: "Mid-range ($150-250/day)"

**Tags as Pills:** Destination tags shown as context pills: "🏖 Beach", "🤿 Diving", "🚢 Cruise Port"

**Highlights Section:** Top 4-6 highlights with icons.

### AI Concierge (CAG)

The system prompt context expands from:
```
Viewing: Cozumel, Mexico (destination page)
```

To:
```
Viewing: Cozumel, Mexico (destination page)
One-liner: Caribbean diving paradise with Mayan history and incredible Mexican food
Best months: Nov-Apr | Budget: mid-range | Stay: 2-4 days
Tags: beach, snorkeling, diving, cruise-port, tropical, family-friendly
Highlights: World-class reef snorkeling, Mayan ruins at San Gervasio, Fresh seafood
Their basket: 1 cruise (Western Caribbean 7N, $849)
Travel tip: Book reef excursions through local operators — half the price
```

The AI can now answer questions like:
- "When should I visit?" → "November to April is perfect — dry season, warm but not too hot"
- "Is it expensive?" → "It's mid-range — expect $150-250 CAD per day"
- "What should I do?" → "The Palancar Reef snorkeling is a must. And don't skip San Gervasio ruins"

### Search & Discovery

Tags enable AI-powered destination discovery:
- User: "Where should I go for snorkeling?"
- AI tool: `findDestinationsByTag(['snorkeling'])` → returns Cozumel, Grand Cayman, Bonaire...
- AI: "For snorkeling, you can't beat Cozumel — the Palancar Reef is world-class. Grand Cayman is also incredible if you want calmer waters."

---

## 5. Batch Processing Strategy

### Priority Order

1. **Top 50 cruise ports** (by sailing stop count) — highest traffic pages
2. **Destinations with hero images** (already enriched) — complete their profiles
3. **All port_city destinations** — primary cruise content
4. **Islands and resort areas** — high-interest destinations
5. **Everything else** — completeness

### Rate Limits

| Source | Limit | Strategy |
|--------|-------|----------|
| Wikipedia | 200/sec | No throttling needed |
| Country data | N/A (static) | Instant |
| Timezone | N/A (computation) | Instant |
| TripAdvisor (SerpAPI) | 1/sec | Queue with delays |
| AI Curation (OpenAI) | 60/min | Batch 50, wait 1min |
| Nearby (SQL) | N/A | Single query |

**Estimated time for 500 destinations:** ~10 minutes (bottleneck is AI curation at 50/min)

### Cost

- GPT-4o-mini: ~$0.15/1M input, $0.60/1M output
- Per destination: ~800 input tokens + ~400 output tokens ≈ $0.0004
- 500 destinations: ~$0.20
- 5,000 destinations: ~$2.00

Negligible cost.

---

## 6. Implementation Order

### Phase 1: Static Enrichment (No API, instant)
1. Country data lookup table (currency, language, visa)
2. Timezone from coordinates (`geo-tz`)
3. Climate zone from latitude
4. Nearby destinations from coordinates (SQL)
5. Store all in metadata JSONB

### Phase 2: Wikipedia + AI Curation
6. Wikipedia API fetch (raw summaries)
7. AI Travel Editor prompt
8. Curated content stored in metadata + summary column
9. Tags, highlights, best months, budget tier generated

### Phase 3: Frontend Integration
10. Update destination adapter to use enriched metadata
11. New "Destination Info" section component
12. Tags as context pills
13. Enriched AI concierge context
14. Highlights section

### Phase 4: Batch Processing
15. BullMQ job type for enrichment
16. Admin trigger endpoint
17. Priority-based batch processing
18. Self-re-queuing for remaining destinations

---

## Scope

### Build Now
- Country data lookup table
- Timezone resolution
- Climate zone derivation
- Wikipedia fetch + AI curation for top 50 destinations
- Metadata storage
- Destination adapter updates for enriched content
- AI concierge context enrichment

### Deferred
- Full batch processing for all 9,728 destinations
- Destination Info section component (new section type)
- Tags-based discovery tools for AI
- Highlights section
- Vector store for RAG-based destination search
