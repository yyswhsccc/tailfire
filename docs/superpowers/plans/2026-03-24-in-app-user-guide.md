# In-App User Guide — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a context-aware help guide accessible from the header help menu, covering the full Tailfire system for travel agents.

**Architecture:** A shadcn Sheet slides from the right, rendering markdown content that's selected based on the current route. Content is stored as exported string constants in TypeScript files. Route mapping is a simple utility function.

**Tech Stack:** Next.js, React, shadcn/ui Sheet, react-markdown, remark-gfm, Tailwind prose typography

**Spec:** `docs/superpowers/specs/2026-03-24-in-app-user-guide-design.md`

---

## File Structure

### New Files — Infrastructure
- `apps/admin/src/components/help/help-guide-sheet.tsx` — Main Sheet wrapper with state, route detection, topic navigation
- `apps/admin/src/components/help/guide-content.tsx` — Markdown renderer with Tailwind prose styling
- `apps/admin/src/components/help/guide-toc.tsx` — Table of contents grid with topic cards
- `apps/admin/src/components/help/guide-route-map.ts` — Route → topic mapping utility + topic metadata

### New Files — Content (20 files)
- `apps/admin/src/content/guide/index.ts` — Barrel export of all guide content
- `apps/admin/src/content/guide/dashboard.ts`
- `apps/admin/src/content/guide/trips.ts`
- `apps/admin/src/content/guide/trip-overview.ts`
- `apps/admin/src/content/guide/itineraries.ts`
- `apps/admin/src/content/guide/activity-forms.ts`
- `apps/admin/src/content/guide/bookings.ts`
- `apps/admin/src/content/guide/payments.ts`
- `apps/admin/src/content/guide/insurance.ts`
- `apps/admin/src/content/guide/service-fees.ts`
- `apps/admin/src/content/guide/documents.ts`
- `apps/admin/src/content/guide/tasks.ts`
- `apps/admin/src/content/guide/contacts.ts`
- `apps/admin/src/content/guide/emails.ts`
- `apps/admin/src/content/guide/calendar.ts`
- `apps/admin/src/content/guide/commissions.ts`
- `apps/admin/src/content/guide/reporting.ts`
- `apps/admin/src/content/guide/library.ts`
- `apps/admin/src/content/guide/shortcuts.ts`
- `apps/admin/src/content/guide/tags.ts`

### Modified Files
- `apps/admin/src/components/layout/top-nav.tsx` — Wire "Documentation" and "Keyboard Shortcuts" to open HelpGuideSheet
- `apps/admin/package.json` — Add react-markdown + remark-gfm

---

## Task 1: Install Dependencies

**Files:**
- Modify: `apps/admin/package.json`

- [ ] **Step 1: Install react-markdown and remark-gfm**

```bash
cd apps/admin && pnpm add react-markdown remark-gfm
```

- [ ] **Step 2: Verify installation**

```bash
grep "react-markdown" apps/admin/package.json
```

Expected: `"react-markdown": "^9.x.x"` in dependencies

- [ ] **Step 3: Commit**

```
git add apps/admin/package.json pnpm-lock.yaml
git commit -m "chore(admin): add react-markdown + remark-gfm for help guide"
```

---

## Task 2: Route Mapping Utility + Topic Metadata

**Files:**
- Create: `apps/admin/src/components/help/guide-route-map.ts`

- [ ] **Step 1: Create the route mapping utility**

This file exports:
- `GuideTopic` type with id, title, description, category
- `GUIDE_TOPICS` array of all topics
- `getTopicForRoute(pathname, searchParams)` function

```typescript
export interface GuideTopic {
  id: string
  title: string
  description: string
  category: 'getting-started' | 'trip-management' | 'booking-payments' | 'contacts-communication' | 'finances' | 'tools'
}

export const GUIDE_TOPICS: GuideTopic[] = [
  // Getting Started
  { id: 'dashboard', title: 'Dashboard Overview', description: 'Your home base — KPIs, charts, tasks due', category: 'getting-started' },
  { id: 'shortcuts', title: 'Keyboard Shortcuts', description: 'Work faster with shortcuts', category: 'getting-started' },
  // Trip Management
  { id: 'trips', title: 'Managing Trips', description: 'Create, search, organize trips', category: 'trip-management' },
  { id: 'trip-overview', title: 'Trip Overview', description: 'Status, travelers, dates, agents', category: 'trip-management' },
  { id: 'itineraries', title: 'Building Itineraries', description: 'Add activities, arrange days, proposals', category: 'trip-management' },
  { id: 'activity-forms', title: 'Activity Forms', description: 'Flights, hotels, cruises, tours, and more', category: 'trip-management' },
  // Booking & Payments
  { id: 'bookings', title: 'Booking Activities', description: 'Mark as booked, validation, packages', category: 'booking-payments' },
  { id: 'payments', title: 'Payment Schedules', description: 'Expected payments, recording transactions', category: 'booking-payments' },
  { id: 'insurance', title: 'Insurance Coverage', description: 'Proposals, waivers, tracking', category: 'booking-payments' },
  { id: 'service-fees', title: 'Service Fees', description: 'Agency fees and invoicing', category: 'booking-payments' },
  // Contacts & Communication
  { id: 'contacts', title: 'Managing Contacts', description: 'Client profiles, travelers, documents', category: 'contacts-communication' },
  { id: 'emails', title: 'Email System', description: 'Send, sync, templates', category: 'contacts-communication' },
  { id: 'calendar', title: 'Calendar & Tasks', description: 'Events, reminders, deadlines', category: 'contacts-communication' },
  { id: 'tasks', title: 'Tasks', description: 'Trip tasks, assignments, tracking', category: 'contacts-communication' },
  // Finances
  { id: 'commissions', title: 'Commission Tracking', description: 'Earned, received, overdue commissions', category: 'finances' },
  { id: 'reporting', title: 'Reports', description: 'Sales, financial, compliance reports', category: 'finances' },
  // Tools
  { id: 'library', title: 'Library & Templates', description: 'Itinerary and email templates', category: 'tools' },
  { id: 'tags', title: 'Tags & Organization', description: 'Categorize trips and contacts', category: 'tools' },
  { id: 'documents', title: 'Documents', description: 'Upload and manage trip documents', category: 'tools' },
]

export function getTopicForRoute(pathname: string, tab?: string | null): string | null {
  // Trip detail tabs
  if (pathname.match(/\/trips\/[^/]+$/) || pathname.match(/\/trips\/[^/]+\/?$/)) {
    const tabMap: Record<string, string> = {
      itinerary: 'itineraries',
      bookings: 'bookings',
      payments: 'payments',
      insurance: 'insurance',
      'service-fees': 'service-fees',
      documents: 'documents',
      tasks: 'tasks',
    }
    if (tab && tabMap[tab]) return tabMap[tab]
    return 'trip-overview'
  }

  // Activity edit forms
  if (pathname.includes('/activities/') && pathname.includes('/edit')) {
    return 'activity-forms'
  }

  // Top-level routes
  const routeMap: Record<string, string> = {
    '/dashboard': 'dashboard',
    '/trips': 'trips',
    '/contacts': 'contacts',
    '/commission': 'commissions',
    '/calendar': 'calendar',
    '/tasks': 'tasks',
    '/emails': 'emails',
    '/library': 'library',
    '/reporting': 'reporting',
  }

  for (const [route, topic] of Object.entries(routeMap)) {
    if (pathname === route || pathname.startsWith(route + '/')) return topic
  }

  return null // fallback to TOC
}

export const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Getting Started',
  'trip-management': 'Trip Management',
  'booking-payments': 'Booking & Payments',
  'contacts-communication': 'Contacts & Communication',
  'finances': 'Finances',
  'tools': 'Tools',
}
```

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add guide route mapping utility"
```

---

## Task 3: Guide Content Renderer

**Files:**
- Create: `apps/admin/src/components/help/guide-content.tsx`

- [ ] **Step 1: Create the markdown renderer component**

```typescript
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface GuideContentProps {
  content: string
}

export function GuideContent({ content }: GuideContentProps) {
  return (
    <div className="prose prose-sm prose-zinc max-w-none
      prose-headings:font-semibold prose-headings:text-zinc-900
      prose-h1:text-xl prose-h1:border-b prose-h1:pb-2 prose-h1:mb-4
      prose-h2:text-lg prose-h2:mt-6
      prose-h3:text-base prose-h3:mt-4
      prose-p:text-zinc-700 prose-p:leading-relaxed
      prose-li:text-zinc-700
      prose-strong:text-zinc-900
      prose-code:bg-zinc-100 prose-code:px-1 prose-code:rounded prose-code:text-xs
      prose-blockquote:border-l-amber-400 prose-blockquote:bg-amber-50 prose-blockquote:py-1 prose-blockquote:text-amber-800
      prose-table:text-sm
      prose-th:text-left prose-th:text-zinc-600
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
```

Requires `@tailwindcss/typography` plugin — check if already installed. If not, add it.

- [ ] **Step 2: Check/install typography plugin**

```bash
grep "@tailwindcss/typography" apps/admin/package.json
# If not found:
cd apps/admin && pnpm add -D @tailwindcss/typography
```

Add `require('@tailwindcss/typography')` to `tailwind.config.ts` plugins array if not present.

- [ ] **Step 3: Commit**

```
git commit -m "feat(admin): add guide markdown content renderer"
```

---

## Task 4: Table of Contents Component

**Files:**
- Create: `apps/admin/src/components/help/guide-toc.tsx`

- [ ] **Step 1: Create the TOC component**

Renders topics grouped by category as clickable cards:

```typescript
'use client'

import { GUIDE_TOPICS, CATEGORY_LABELS, type GuideTopic } from './guide-route-map'
import { ChevronRight } from 'lucide-react'

interface GuideTocProps {
  onSelectTopic: (topicId: string) => void
}

export function GuideToc({ onSelectTopic }: GuideTocProps) {
  const grouped = GUIDE_TOPICS.reduce((acc, topic) => {
    if (!acc[topic.category]) acc[topic.category] = []
    acc[topic.category].push(topic)
    return acc
  }, {} as Record<string, GuideTopic[]>)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Tailfire Guide</h1>
        <p className="text-sm text-zinc-500 mt-1">Everything you need to manage trips, bookings, and clients.</p>
      </div>

      {Object.entries(grouped).map(([category, topics]) => (
        <div key={category}>
          <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-2">
            {CATEGORY_LABELS[category] || category}
          </h2>
          <div className="space-y-1">
            {topics.map((topic) => (
              <button
                key={topic.id}
                onClick={() => onSelectTopic(topic.id)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-zinc-100 transition-colors group flex items-center justify-between"
              >
                <div>
                  <div className="text-sm font-medium text-zinc-900">{topic.title}</div>
                  <div className="text-xs text-zinc-500">{topic.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add guide table of contents component"
```

---

## Task 5: HelpGuideSheet — Main Component

**Files:**
- Create: `apps/admin/src/components/help/help-guide-sheet.tsx`

- [ ] **Step 1: Create the main Sheet component**

This is the orchestrator — manages open/close state, current topic, navigation between topics, and context detection.

Props:
```typescript
interface HelpGuideSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Override the auto-detected topic */
  initialTopic?: string
}
```

Key behavior:
- On open, detect current route → set topic (or use initialTopic override)
- Render GuideContent when a topic is selected, GuideToc when showing all topics
- Header with: back arrow (when in topic), title, "All Topics" button, close
- Footer with prev/next topic navigation
- Content loaded from the barrel export (`@/content/guide`)

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { GuideContent } from './guide-content'
import { GuideToc } from './guide-toc'
import { getTopicForRoute, GUIDE_TOPICS } from './guide-route-map'
import { guideContent } from '@/content/guide'

export function HelpGuideSheet({ open, onOpenChange, initialTopic }: HelpGuideSheetProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [currentTopic, setCurrentTopic] = useState<string | null>(null)

  // On open, detect topic from route
  useEffect(() => {
    if (open) {
      if (initialTopic) {
        setCurrentTopic(initialTopic)
      } else {
        const tab = searchParams.get('tab')
        const detected = getTopicForRoute(pathname, tab)
        setCurrentTopic(detected) // null = show TOC
      }
    }
  }, [open, pathname, searchParams, initialTopic])

  const topicIndex = currentTopic
    ? GUIDE_TOPICS.findIndex(t => t.id === currentTopic)
    : -1
  const currentTopicMeta = topicIndex >= 0 ? GUIDE_TOPICS[topicIndex] : null
  const prevTopic = topicIndex > 0 ? GUIDE_TOPICS[topicIndex - 1] : null
  const nextTopic = topicIndex < GUIDE_TOPICS.length - 1 ? GUIDE_TOPICS[topicIndex + 1] : null

  const content = currentTopic ? guideContent[currentTopic] : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            {currentTopic && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentTopic(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-zinc-500" />
              <SheetTitle className="text-sm font-medium">
                {currentTopicMeta?.title || 'Guide'}
              </SheetTitle>
            </div>
          </div>
          {currentTopic && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setCurrentTopic(null)}>
              All Topics
            </Button>
          )}
        </div>

        {/* Body */}
        <ScrollArea className="flex-1 px-4 py-4">
          {content ? (
            <GuideContent content={content} />
          ) : (
            <GuideToc onSelectTopic={setCurrentTopic} />
          )}
        </ScrollArea>

        {/* Footer — prev/next */}
        {currentTopic && (
          <div className="flex items-center justify-between px-4 py-2 border-t text-xs">
            {prevTopic ? (
              <button onClick={() => setCurrentTopic(prevTopic.id)} className="flex items-center gap-1 text-zinc-500 hover:text-zinc-900">
                <ChevronLeft className="h-3 w-3" />
                {prevTopic.title}
              </button>
            ) : <span />}
            {nextTopic ? (
              <button onClick={() => setCurrentTopic(nextTopic.id)} className="flex items-center gap-1 text-zinc-500 hover:text-zinc-900">
                {nextTopic.title}
                <ChevronRight className="h-3 w-3" />
              </button>
            ) : <span />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add HelpGuideSheet main component"
```

---

## Task 6: Wire Into Top Nav

**Files:**
- Modify: `apps/admin/src/components/layout/top-nav.tsx`

- [ ] **Step 1: Import and add state**

```typescript
import { HelpGuideSheet } from '@/components/help/help-guide-sheet'

// Add state alongside existing bugReportOpen:
const [guideOpen, setGuideOpen] = useState(false)
const [guideInitialTopic, setGuideInitialTopic] = useState<string | undefined>()
```

- [ ] **Step 2: Wire menu items**

Replace the placeholder menu items:

```typescript
<DropdownMenuItem onClick={() => { setGuideInitialTopic(undefined); setGuideOpen(true) }}>
  <BookOpen className="mr-2 h-4 w-4" />
  Documentation
</DropdownMenuItem>
<DropdownMenuItem onClick={() => { /* TODO: support link */ }}>
  Support
</DropdownMenuItem>
<DropdownMenuItem onClick={() => { setGuideInitialTopic('shortcuts'); setGuideOpen(true) }}>
  <Keyboard className="mr-2 h-4 w-4" />
  Keyboard Shortcuts
</DropdownMenuItem>
```

Add imports for `BookOpen`, `Keyboard` from lucide-react.

- [ ] **Step 3: Add the Sheet component**

After the existing `<BugReportDialog>`, add:

```tsx
<HelpGuideSheet
  open={guideOpen}
  onOpenChange={setGuideOpen}
  initialTopic={guideInitialTopic}
/>
```

- [ ] **Step 4: Commit**

```
git commit -m "feat(admin): wire help guide into top nav menu"
```

---

## Task 7: Content — Create Barrel Export + First 5 Sections

**Files:**
- Create: `apps/admin/src/content/guide/index.ts`
- Create: `apps/admin/src/content/guide/dashboard.ts`
- Create: `apps/admin/src/content/guide/trips.ts`
- Create: `apps/admin/src/content/guide/trip-overview.ts`
- Create: `apps/admin/src/content/guide/itineraries.ts`
- Create: `apps/admin/src/content/guide/activity-forms.ts`

- [ ] **Step 1: Create barrel export**

```typescript
// apps/admin/src/content/guide/index.ts
import { content as dashboard } from './dashboard'
import { content as trips } from './trips'
import { content as tripOverview } from './trip-overview'
import { content as itineraries } from './itineraries'
import { content as activityForms } from './activity-forms'
import { content as bookings } from './bookings'
import { content as payments } from './payments'
import { content as insurance } from './insurance'
import { content as serviceFees } from './service-fees'
import { content as documents } from './documents'
import { content as tasks } from './tasks'
import { content as contacts } from './contacts'
import { content as emails } from './emails'
import { content as calendar } from './calendar'
import { content as commissions } from './commissions'
import { content as reporting } from './reporting'
import { content as library } from './library'
import { content as shortcuts } from './shortcuts'
import { content as tags } from './tags'

export const guideContent: Record<string, string> = {
  dashboard, trips, 'trip-overview': tripOverview, itineraries,
  'activity-forms': activityForms, bookings, payments, insurance,
  'service-fees': serviceFees, documents, tasks, contacts, emails,
  calendar, commissions, reporting, library, shortcuts, tags,
}
```

- [ ] **Step 2: Write first 5 content files**

Each file is a TypeScript file exporting `content` as a template literal string containing markdown. Content should be:
- 200-400 words
- Task-oriented, imperative voice
- Bold key UI elements
- Tips in blockquotes

Source material: adapt from wiki/Agent-Guide-*.md files. Read each wiki file, rewrite for in-app consumption.

- `dashboard.ts` — adapt from wiki/Getting-Started.md + app knowledge
- `trips.ts` — adapt from wiki/Agent-Guide-Create-A-Trip.md
- `trip-overview.ts` — new content about the trip detail page
- `itineraries.ts` — adapt from wiki/Agent-Guide-Build-And-Propose-An-Itinerary.md
- `activity-forms.ts` — adapt from wiki/Agent-Guide-Trip-Components.md + Agent-Guide-Flight-Activities.md

- [ ] **Step 3: Commit**

```
git commit -m "feat(admin): add guide content — getting started + trip management"
```

---

## Task 8: Content — Booking, Payments, Insurance, Service Fees, Documents

**Files:**
- Create: `apps/admin/src/content/guide/bookings.ts`
- Create: `apps/admin/src/content/guide/payments.ts`
- Create: `apps/admin/src/content/guide/insurance.ts`
- Create: `apps/admin/src/content/guide/service-fees.ts`
- Create: `apps/admin/src/content/guide/documents.ts`

- [ ] **Step 1: Write 5 content files**

- `bookings.ts` — adapt from wiki/Agent-Guide-Record-Supplier-Bookings.md + new Mark as Booked flow
- `payments.ts` — adapt from wiki/Agent-Guide-Payment-Schedules.md
- `insurance.ts` — new content about insurance tab, proposals, waivers
- `service-fees.ts` — adapt from wiki/Agent-Guide-Service-Fees.md
- `documents.ts` — new content about document upload/management

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add guide content — booking & payments"
```

---

## Task 9: Content — Contacts, Emails, Calendar, Tasks

**Files:**
- Create: `apps/admin/src/content/guide/contacts.ts`
- Create: `apps/admin/src/content/guide/emails.ts`
- Create: `apps/admin/src/content/guide/calendar.ts`
- Create: `apps/admin/src/content/guide/tasks.ts`

- [ ] **Step 1: Write 4 content files**

- `contacts.ts` — new content about contact management
- `emails.ts` — adapt from wiki/Agent-Guide-Email-System.md
- `calendar.ts` — new content about calendar views, event types
- `tasks.ts` — new content about task management

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add guide content — contacts & communication"
```

---

## Task 10: Content — Commissions, Reporting, Library, Tags, Shortcuts

**Files:**
- Create: `apps/admin/src/content/guide/commissions.ts`
- Create: `apps/admin/src/content/guide/reporting.ts`
- Create: `apps/admin/src/content/guide/library.ts`
- Create: `apps/admin/src/content/guide/tags.ts`
- Create: `apps/admin/src/content/guide/shortcuts.ts`

- [ ] **Step 1: Write 5 content files**

- `commissions.ts` — new content about commission tracking, checks, reconciliation
- `reporting.ts` — new content about report types, filters, export
- `library.ts` — adapt from wiki/Agent-Guide-Libraries.md + Agent-Guide-Template-System.md
- `tags.ts` — adapt from wiki/Agent-Guide-Tags.md
- `shortcuts.ts` — keyboard shortcuts reference table

- [ ] **Step 2: Commit**

```
git commit -m "feat(admin): add guide content — finances & tools"
```

---

## Task 11: Integration Test + Push

- [ ] **Step 1: TypeScript compile check**

```bash
npx tsc --noEmit --project apps/admin/tsconfig.json 2>&1 | grep -E "guide|help|content" | head -10
```

Expected: No new errors.

- [ ] **Step 2: Manual test**

1. Open http://localhost:3100
2. Click the `?` help button in the header
3. Click "Documentation" → verify Sheet opens with context-aware content
4. Navigate to `/trips` → reopen → verify "Managing Trips" section shows
5. Navigate to a trip bookings tab → reopen → verify "Booking Activities" section
6. Click "All Topics" → verify TOC with all categories
7. Click prev/next navigation in footer
8. Click "Keyboard Shortcuts" from help menu → verify shortcuts section

- [ ] **Step 3: Push**

```bash
git push origin main
git checkout preview && git merge main --no-edit && git push origin preview && git checkout main
```
