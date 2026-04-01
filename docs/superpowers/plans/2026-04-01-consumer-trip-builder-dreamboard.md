# Consumer Trip Builder — Dream Board Page (Plan C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dream board page — a Pinterest-style masonry grid of image-rich cards where consumers view, manage, and curate their trip components and inspiration imagery.

**Architecture:** Server component page at `/my-trip/[id]` with access control (session cookie, portal JWT, or share token). Client component renders a masonry grid using CSS columns (no DnD library yet — deferred to avoid complexity). Functional cards show hero images with gradient overlays. Inspiration cards are image-only filler.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, shadcn/ui, existing trip basket store

**Spec:** `docs/superpowers/specs/2026-04-01-consumer-trip-builder-design.md`
**Depends on:** Plan A (Backend) + Plan B (Basket Store)

---

## File Structure

```
apps/ota/src/
├── app/my-trip/[id]/
│   ├── page.tsx                    # NEW — Server component, access control, data fetch
│   └── loading.tsx                 # NEW — Skeleton loading state
├── components/trip-builder/
│   ├── dream-board.tsx             # NEW — Masonry grid container
│   ├── board-card.tsx              # NEW — Single card (functional or inspiration)
│   ├── board-functional-card.tsx   # NEW — Flight/hotel/cruise/tour card with hero image
│   ├── board-inspiration-card.tsx  # NEW — Image-only filler card
│   ├── board-add-menu.tsx          # NEW — "+ Add Flight/Hotel/Cruise/Tour" buttons
│   ├── board-header.tsx            # NEW — Trip title, component count, submit button
│   └── board-empty-state.tsx       # NEW — Empty board prompt
```

---

### Task 1: Dream Board Page (Server Component + Access Control)

**Files:**
- Create: `apps/ota/src/app/my-trip/[id]/page.tsx`
- Create: `apps/ota/src/app/my-trip/[id]/loading.tsx`

Server component that checks access and fetches the trip request data.

**Access control logic:**
1. Read `ota_session` cookie from request
2. Read `?token=` query param for shared view
3. If token provided: call `GET /ota/trip-requests/shared/{token}` — read-only mode
4. If no token: call `GET /ota/trip-requests/{id}` — verify sessionId matches cookie
5. If no match: return notFound()
6. Pass data + readOnly flag to client component

**Page metadata:** "My Trip | Phoenix Voyages"

**Loading skeleton:** Masonry grid placeholder with pulse animations.

- [ ] **Step 1: Create the page**

The page fetches the trip request server-side, checks access, and renders the board.

```typescript
// apps/ota/src/app/my-trip/[id]/page.tsx
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { serviceFetch } from "@/lib/api";
import { DreamBoard } from "@/components/trip-builder/dream-board";

export const metadata: Metadata = {
  title: "My Trip | Phoenix Voyages",
  description: "Your dream trip board",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function MyTripPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { token } = await searchParams;

  let tripRequest: any;
  let readOnly = false;

  if (token) {
    // Shared view — public, read-only
    try {
      tripRequest = await serviceFetch(`/ota/trip-requests/shared/${token}`);
      readOnly = true;
    } catch {
      notFound();
    }
  } else {
    // Owner view — verify session
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("ota_session")?.value;

    try {
      tripRequest = await serviceFetch(`/ota/trip-requests/${id}`);
      // Verify ownership
      if (tripRequest.sessionId !== sessionId) {
        notFound();
      }
    } catch {
      notFound();
    }
  }

  if (!tripRequest) notFound();

  return (
    <main className="min-h-screen bg-[#fafaf8]">
      <DreamBoard
        requestId={tripRequest.id}
        title={tripRequest.title}
        components={tripRequest.components || []}
        inspiration={tripRequest.inspiration || []}
        boardOrder={tripRequest.boardOrder || []}
        readOnly={readOnly}
        startDate={tripRequest.startDate}
        endDate={tripRequest.endDate}
        travelers={tripRequest.travelers}
      />
    </main>
  );
}
```

- [ ] **Step 2: Create loading skeleton**

```typescript
// apps/ota/src/app/my-trip/[id]/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function MyTripLoading() {
  return (
    <main className="min-h-screen bg-[#fafaf8]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Skeleton className="mb-6 h-10 w-64" />
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="columns-2 gap-4 md:columns-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="mb-4 break-inside-avoid rounded-xl"
              style={{ height: 180 + (i % 3) * 60 }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/ota/src/app/my-trip/
git commit -m "feat(ota): dream board page with access control and loading skeleton"
```

---

### Task 2: Board Components (Header + Cards + Empty State)

**Files:**
- Create: `apps/ota/src/components/trip-builder/dream-board.tsx`
- Create: `apps/ota/src/components/trip-builder/board-header.tsx`
- Create: `apps/ota/src/components/trip-builder/board-functional-card.tsx`
- Create: `apps/ota/src/components/trip-builder/board-inspiration-card.tsx`
- Create: `apps/ota/src/components/trip-builder/board-empty-state.tsx`
- Create: `apps/ota/src/components/trip-builder/board-add-menu.tsx`

- [ ] **Step 1: Create board-header.tsx**

Shows trip title (editable), component count, total estimate, and submit button.

Props: `title, componentCount, totalEstimate, readOnly, requestId`

Layout: flex between title (left) and actions (right). Title is editable inline (contentEditable or input). Actions: share button + submit button (gold). Below: "N components · ~$X,XXX estimated" subtitle.

- [ ] **Step 2: Create board-functional-card.tsx**

Renders a single functional card (flight/hotel/cruise/tour) with hero image.

Props: `component: TripComponent, readOnly: boolean, onRemove?: (id: string) => void`

Layout:
- Hero image as background (from `component.display.heroImage` or fallback gradient by type)
- Gradient overlay (bottom 60% → transparent to dark)
- Type badge top-left (small pill: "✈️ Flight", "🏨 Hotel", etc.)
- Price badge top-right
- Title + subtitle overlay at bottom
- If !readOnly: "×" remove button on hover (top-right)

Fallback gradients by type:
- flight: blue (#0ea5e9 → #0284c7)
- hotel: amber (#f59e0b → #d97706)
- cruise: indigo (#6366f1 → #4f46e5)
- tour: emerald (#10b981 → #059669)
- custom: slate (#64748b → #475569)

Card height varies by type for masonry effect (flight: 200px, hotel: 240px, cruise: 260px, tour: 220px).

- [ ] **Step 3: Create board-inspiration-card.tsx**

Simple image card with subtle caption.

Props: `card: InspirationCard`

Layout: image fills card, optional caption at bottom with white text on dark gradient. Rounded corners. No click action. Height: 180-220px random for masonry variation.

If `card.attribution` exists, show small credit text on hover.

- [ ] **Step 4: Create board-empty-state.tsx**

Shown when board has no components.

Props: `requestId: string`

Layout: centered, with illustration/icon, "Start building your dream trip" heading, "Search for flights, hotels, cruises, or tours and add them here" subtitle, action buttons for each search type.

- [ ] **Step 5: Create board-add-menu.tsx**

Manual add buttons. Props: `requestId: string`

Layout: horizontal row of pills/buttons:
- "+ Flight" → `/search/flights?tripId={requestId}`
- "+ Hotel" → `/search/hotels?tripId={requestId}`
- "+ Cruise" → `/search/cruises?tripId={requestId}`
- "+ Tour" → `/search/tours?tripId={requestId}`

Styled as outlined pills with type-specific icons.

- [ ] **Step 6: Create dream-board.tsx**

The main client component. Orchestrates everything.

Props from server: `requestId, title, components[], inspiration[], boardOrder[], readOnly, startDate, endDate, travelers`

Layout:
1. `<BoardHeader>` at top
2. `<BoardAddMenu>` below header (hidden if readOnly)
3. Masonry grid using CSS columns: `columns-2 md:columns-3 gap-4`
4. Render cards in `boardOrder` sequence. For each item:
   - If `type === 'component'`: find in components by id → render `<BoardFunctionalCard>`
   - If `type === 'inspiration'`: find in inspiration by id → render `<BoardInspirationCard>`
5. If boardOrder is empty, fall back to: components first, then inspiration
6. If no components at all: `<BoardEmpty>`
7. Drop zone placeholder at the end (dashed border, "+ Add more")

Uses `useTripBasket` store for mutations (remove component, update board order).

- [ ] **Step 7: Verify + Commit**

```bash
pnpm --filter @tailfire/ota exec tsc --noEmit 2>&1 | head -10
git add apps/ota/src/components/trip-builder/
git commit -m "feat(ota): dream board masonry grid with functional and inspiration cards"
```

---

## Post-Plan Notes

**DnD deferred:** Drag-and-drop reordering is complex and can be added as an enhancement. The board renders in board_order sequence and cards can be removed, but reordering requires a follow-up with `@dnd-kit`. The board_order API is already built.

**What this plan builds:**
- `/my-trip/[id]` page with session-based access control
- Shared read-only view via `?token=`
- Pinterest-style masonry grid (CSS columns)
- Hero image cards for flights/hotels/cruises/tours
- Inspiration image filler cards
- Add menu for navigating to search pages
- Empty state with call-to-action
