# In-App User Guide — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Context-aware help guide accessible from the header help menu

---

## Problem

Agents have no in-app documentation. The help menu has placeholder "Documentation" and "Support" links that do nothing. New agents have no onboarding flow, and experienced agents can't quickly reference how a feature works without leaving the app. Wiki content exists but is developer-facing and not accessible from the product.

## Goals

1. Agents can access a comprehensive guide without leaving their current page
2. Guide auto-opens to the relevant section based on the current route
3. Content covers the full system — trips, bookings, payments, contacts, commissions, calendar, emails, reporting
4. Serves both onboarding (new agents) and daily reference (experienced agents)

---

## Design

### 1. HelpGuideSheet Component

A shadcn `Sheet` slides in from the right when "Documentation" is clicked in the `?` help menu (`apps/admin/src/components/layout/top-nav.tsx`, line 181).

**Width:** `w-[480px]` (override default Sheet width via className)

**Layout:**
```
┌──────────────────────────────────────────┐
│ [←] Guide          [All Topics] [×]      │
├──────────────────────────────────────────┤
│                                          │
│  ## Booking Activities                   │
│                                          │
│  When you're ready to confirm a booking  │
│  with a supplier, use the **Mark as      │
│  Booked** button in the activity form    │
│  header...                               │
│                                          │
│  ### Steps                               │
│  1. Open the activity form               │
│  2. Fill in all required fields          │
│  3. Click "Mark as Booked"               │
│  ...                                     │
│                                          │
├──────────────────────────────────────────┤
│  ← Payment Schedules    Insurance →      │
└──────────────────────────────────────────┘
```

**Header:** Back button (when in a topic), "All Topics" link, close button
**Body:** Rendered markdown content with proper typography
**Footer:** Prev/next topic navigation

### 2. Context-Aware Route Mapping

The sheet detects the current route via `usePathname()` + `useSearchParams()` and opens to the matching guide section.

**Mapping:**

| Route Pattern | Guide Section | File |
|---------------|--------------|------|
| `/dashboard` | Dashboard Overview | `dashboard.md` |
| `/trips` (list) | Managing Trips | `trips.md` |
| `/trips/:id` (no tab / overview) | Trip Overview | `trip-overview.md` |
| `/trips/:id?tab=itinerary` | Building Itineraries | `itineraries.md` |
| `/trips/:id?tab=bookings` | Booking Activities | `bookings.md` |
| `/trips/:id?tab=payments` | Payment Schedules | `payments.md` |
| `/trips/:id?tab=insurance` | Insurance Coverage | `insurance.md` |
| `/trips/:id?tab=service-fees` | Service Fees | `service-fees.md` |
| `/trips/:id?tab=documents` | Trip Documents | `documents.md` |
| `/trips/:id?tab=tasks` | Trip Tasks | `tasks.md` |
| `/trips/:id/activities/*/edit` | Activity Forms | `activity-forms.md` |
| `/contacts` | Managing Contacts | `contacts.md` |
| `/commission` | Commission Tracking | `commissions.md` |
| `/calendar` | Calendar & Tasks | `calendar.md` |
| `/tasks` | Tasks | `tasks.md` |
| `/emails` | Email System | `emails.md` |
| `/library` | Library & Templates | `library.md` |
| `/reporting` | Reports | `reporting.md` |
| No match / "All Topics" | Table of Contents | `index.md` |

**Fallback:** If no route matches, show the table of contents (`index.md`) with all topics listed as clickable cards.

### 3. Table of Contents (index.md)

Organized by workflow stage:

```markdown
# Tailfire Guide

## Getting Started
- [Dashboard Overview](dashboard) — Your home base
- [Keyboard Shortcuts](shortcuts) — Work faster

## Trip Management
- [Managing Trips](trips) — Create, search, organize trips
- [Trip Overview](trip-overview) — Status, travelers, dates
- [Building Itineraries](itineraries) — Add activities, arrange days
- [Activity Forms](activity-forms) — Flights, hotels, cruises, tours, etc.

## Booking & Payments
- [Booking Activities](bookings) — Mark as booked, validation, packages
- [Payment Schedules](payments) — Expected payments, recording transactions
- [Insurance Coverage](insurance) — Proposals, waivers, tracking
- [Service Fees](service-fees) — Agency fees, invoicing

## Contacts & Communication
- [Managing Contacts](contacts) — Client profiles, travelers, documents
- [Email System](emails) — Send, sync, templates
- [Calendar & Tasks](calendar) — Events, reminders, deadlines

## Finances
- [Commission Tracking](commissions) — Earned, received, overdue
- [Reports](reporting) — Sales, financial, compliance reports

## Tools
- [Library & Templates](library) — Itinerary templates, email templates
- [Tags & Organization](tags) — Categorize trips and contacts
```

### 4. Content Files

Located at `apps/admin/src/content/guide/`. Each file is plain markdown, task-oriented, concise.

**Content style:**
- Lead with "what this does" in one sentence
- Steps numbered, imperative voice ("Click", "Select", "Enter")
- Bold key UI elements: **Mark as Booked**, **Save Changes**, **Bookings tab**
- Tips in blockquotes: `> Tip: You can...`
- Warnings prefixed: `> Warning: Once finalized...`
- No screenshots in v1 (add later)
- ~200-400 words per section

**Source material:** Rewrite from existing wiki files (wiki/Agent-Guide-*.md), adapted for in-app consumption. Wiki content is developer-oriented and verbose — the guide should be agent-oriented and scannable.

### 5. Technical Implementation

**Dependencies to add:**
- `react-markdown` — Render markdown to React components
- `remark-gfm` — GitHub Flavored Markdown (tables, strikethrough, task lists)

**New files:**
- `apps/admin/src/components/help/help-guide-sheet.tsx` — Main Sheet component
- `apps/admin/src/components/help/guide-content.tsx` — Markdown renderer with typography
- `apps/admin/src/components/help/guide-toc.tsx` — Table of contents view
- `apps/admin/src/components/help/guide-route-map.ts` — Route → section mapping utility
- `apps/admin/src/content/guide/*.md` — 18 markdown content files

**Modified files:**
- `apps/admin/src/components/layout/top-nav.tsx` — Wire "Documentation" menu item to open HelpGuideSheet, wire "Keyboard Shortcuts" to open shortcuts section

**Content loading:** Static imports via `import dashboardGuide from '@/content/guide/dashboard.md'` with a raw loader webpack config, OR read files as strings at build time. For simplicity, store content as exported string constants in `.ts` files:

```typescript
// apps/admin/src/content/guide/dashboard.ts
export const content = `
# Dashboard Overview

Your dashboard shows key metrics at a glance...
`
```

This avoids webpack loader configuration and works with all bundlers.

### 6. Keyboard Shortcuts

The "Keyboard Shortcuts" menu item opens the guide to a shortcuts reference:

| Shortcut | Action |
|----------|--------|
| `⌘ K` | Search |
| `⌘ S` | Save activity |
| `Esc` | Close panel/modal |

(Populated from actual shortcuts in the app)

---

## Non-Goals (v1)

- No search within guide (v2)
- No screenshots or GIFs (v2)
- No interactive walkthroughs (v2)
- No AI-powered help chat (v2)
- No "Support" link functionality (v2 — needs support system)
- No admin guide (agency settings, user management) — agent-focused only

---

## Content Sections (18 files)

1. `index.ts` — Table of contents
2. `dashboard.ts` — Dashboard overview, KPIs, charts
3. `trips.ts` — Trip list, create, search, filters, kanban/table views
4. `trip-overview.ts` — Trip detail page, status, travelers, dates
5. `itineraries.ts` — Building itineraries, days, drag-drop, proposals
6. `activity-forms.ts` — Activity types, common fields, auto-save
7. `bookings.ts` — Mark as Booked, validation, package cascade, booking tab
8. `payments.ts` — Payment schedules, expected items, recording transactions
9. `insurance.ts` — Insurance tab, proposals, waivers
10. `service-fees.ts` — Agency service fees
11. `documents.ts` — Trip/activity documents, upload
12. `tasks.ts` — Trip tasks, calendar tasks, assignment
13. `contacts.ts` — Contact management, travelers, documents, shares
14. `emails.ts` — Email accounts, sync, send, templates
15. `calendar.ts` — Calendar views, event types, filters
16. `commissions.ts` — Commission checks, tracking, reconciliation
17. `reporting.ts` — Report types, filters, export
18. `library.ts` — Templates, itinerary library
19. `shortcuts.ts` — Keyboard shortcuts reference
20. `tags.ts` — Tags system
