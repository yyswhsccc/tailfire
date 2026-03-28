# Interactive Deck Plan Viewer V2 — Design Specification

**Date:** 2026-03-28
**Status:** Draft (Future Feature)
**Author:** Claude + Alex Guertin
**Reference:** Royal Caribbean deck plan UX — https://www.royalcaribbean.com/cruise-ships/harmony-of-the-seas/deck-plans

## Overview

Replace the simple deck plan image viewer with an interactive 2-column deck plan explorer inspired by Royal Caribbean's implementation. Consumers can browse decks, filter by cabin category, click individual cabins on the deck plan image, and see detailed cabin information with photos.

## Reference: Royal Caribbean Implementation

RC's deck plan page uses:
- **Left column**: Sail date selector, Deck dropdown, ship silhouette with active deck highlighted, "Staterooms" tab, cabin category filter pills (Suite/Balcony/Ocean View/Interior), cabin type cards with photos + descriptions + bed info + sq footage + "Learn More" links
- **Right column**: Full-height deck plan image with color-coded cabin numbers, clickable cabin hotspots, legend for occupancy/connecting/accessible icons
- **Interaction**: Select a deck → see its layout + available cabins. Click a cabin category → highlights those cabins on the deck plan. Click a specific cabin → shows that cabin's details.

## Available Traveltek Data

### Deck Plans Table (`catalog.cruise_ship_decks`)
| Field | Data | Example |
|-------|------|---------|
| `name` | Deck name | "Deck 07" |
| `deck_number` | Deck number | 7 (note: stored as Traveltek internal ID, not actual deck number) |
| `deck_plan_url` | Static PNG image of the deck layout | `https://static.traveltek.net/cruisepics/local_shipimages/1609337751.png` |
| `description` | Deck description | Empty for most ships |
| `display_order` | Sort order | Sequential |
| `metadata.cabin_locations` | Array of cabin positions on the deck image | See below |

### Cabin Location Data (in deck metadata)
Each deck has a `cabin_locations` JSON array with pixel coordinates mapping cabins onto the deck plan image:
```json
{
  "cabin_locations": [
    { "x1": "215", "y1": "282", "x2": "233", "y2": "358", "cabin_id": "7100" },
    { "x1": "183", "y1": "378", "x2": "244", "y2": "401", "cabin_id": "7101" },
    // ... 321 entries for Deck 07 of Harmony of the Seas
  ]
}
```
- `x1/y1` = top-left corner of cabin rectangle on the deck plan image
- `x2/y2` = bottom-right corner
- `cabin_id` = cabin NUMBER (e.g., "7100"), NOT a cabin type code

### Cabin Types Table (`catalog.cruise_ship_cabin_types`)
| Field | Data | Coverage |
|-------|------|----------|
| `cabin_code` | Traveltek cabin type code | All cabins |
| `cabin_category` | suite / balcony / oceanview / inside | All |
| `name` | Human-readable name | "Junior Suite", "Ocean View Balcony" |
| `description` | Full description with bed types, amenities | Most cabins |
| `image_url` | Cabin interior photo | 95% coverage (10,453 of 10,960) |
| `deck_locations` | Which decks this cabin type appears on | Empty for most |
| `default_occupancy` | Number of guests | All |

### Missing Data / Gaps
| What | Status |
|------|--------|
| **cabin_id → cabin_type mapping** | NOT available. `cabin_id` in locations (e.g., "7100") is a cabin number, but `cabin_code` in types (e.g., "26589") is a type code. No direct mapping table exists. |
| **Amenities per deck** | Empty — `amenities` field is null |
| **Cabin gallery images** | `cruise_cabin_images` table is empty (0 rows) |
| **Deck descriptions** | Empty for most ships |

## V2 Design

### Layout

**Desktop (lg+):**
```
┌──────────────────────────────────────────────────────────┐
│ Deck Selector (pill strip with prev/next)                │
├────────────────────────┬─────────────────────────────────┤
│ LEFT PANEL (380px)     │ RIGHT PANEL (flex)              │
│                        │                                 │
│ Category Filters       │ Deck Plan Image                 │
│ [Suite] [Balcony]      │ (full height, scrollable)       │
│ [Ocean] [Inside]       │                                 │
│                        │ Cabin hotspots overlaid         │
│ ─────────────────      │ (colored rectangles from        │
│                        │  cabin_locations coordinates)   │
│ Cabin Type Cards       │                                 │
│ ┌──────────────┐       │ Click a cabin → highlights it   │
│ │ [photo]      │       │ and scrolls left panel to       │
│ │ Junior Suite │       │ that cabin type                 │
│ │ ⭐ Balcony   │       │                                 │
│ │ 287 sq ft    │       │                                 │
│ │ Up to 5      │       │                                 │
│ └──────────────┘       │                                 │
│                        │                                 │
│ ┌──────────────┐       │                                 │
│ │ [photo]      │       │                                 │
│ │ Ocean View   │       │                                 │
│ │ Balcony      │       │                                 │
│ │ 182 sq ft    │       │                                 │
│ └──────────────┘       │                                 │
│                        │                                 │
├────────────────────────┴─────────────────────────────────┤
│ Legend: occupancy icons, connecting, accessible           │
└──────────────────────────────────────────────────────────┘
```

**Mobile:**
```
┌──────────────────────┐
│ Deck Selector pills  │
├──────────────────────┤
│ Category Filter pills│
├──────────────────────┤
│ Deck Plan Image      │
│ (full width,         │
│  horizontally        │
│  scrollable)         │
│                      │
│ Tap cabin → shows    │
│ bottom sheet with    │
│ cabin details        │
├──────────────────────┤
│ Cabin Type Cards     │
│ (horizontal scroll)  │
└──────────────────────┘
```

### Interaction Flow

1. **Select deck** → deck plan image updates, cabin type list filters to types on this deck
2. **Filter by category** → cabin hotspots on the deck plan highlight/dim based on category. Cabin type list filters.
3. **Click cabin on deck plan** → that cabin's rectangle highlights, left panel scrolls to the matching cabin type card
4. **Click cabin type card** → all cabins of that type on the deck plan highlight

### Technical Approach

**Phase 1 (without cabin_id → cabin_type mapping):**
- Render deck plan image at proper size
- Show cabin type cards filtered by category
- Category filter highlights/dims zones on the deck plan (use CSS overlay with opacity)
- No individual cabin click-through (can't resolve cabin numbers to types)

**Phase 2 (with mapping — requires Traveltek investigation or reverse-engineering):**
- Overlay SVG/canvas on the deck plan image with rectangles from `cabin_locations`
- Each rectangle colored by cabin category
- Click a rectangle → resolve cabin_id to cabin type → show details
- Possible approach: build a mapping by analyzing which cabin numbers appear on which decks, then matching to cabin types that list those decks in `deck_locations`

### API Endpoints Needed

```
GET /cruise-repository/ships/:shipId/decks/:deckId/cabins
→ Returns: deck plan URL, cabin_locations array, cabin types available on this deck

GET /cruise-repository/ships/:shipId/cabin-types?category=suite
→ Returns: filtered cabin types with photos, descriptions, bed info
```

### Component Architecture

```
DeckPlanExplorer (client component)
├── DeckSelector (pill strip)
├── CategoryFilter (toggle pills)
├── DeckPlanCanvas (image + SVG overlay for cabin hotspots)
│   └── CabinHotspot (clickable rectangle per cabin)
├── CabinTypeList (scrollable panel)
│   └── CabinTypeCard (photo + details)
└── CabinDetailSheet (mobile bottom sheet on cabin tap)
```

### Dependencies
- Cabin location coordinate data (already available in deck metadata)
- Cabin type data with images (already available)
- Cabin number → cabin type mapping (NOT yet available — key blocker for full interactivity)

## Scope

**V2 Phase 1:** 2-column layout, category filter, cabin type cards with photos, deck plan at proper size. No cabin click-through.

**V2 Phase 2:** Interactive cabin hotspots on the deck plan image, click-to-see-details, color-coded by category. Requires cabin_id → cabin_type mapping.

## Priority

This is a **nice-to-have** feature for launch. The V1 simple viewer with deck selector is sufficient for initial release. V2 should be built after the core entity hubs, cruise search, and package library are complete.
