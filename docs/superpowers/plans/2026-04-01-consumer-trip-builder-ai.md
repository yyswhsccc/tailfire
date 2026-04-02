# Consumer Trip Builder — AI Integration (Plan D / Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the AI concierge into the trip basket so it can add/remove components, capture identity, and provide trip-aware suggestions. Build the desktop slide-out AI panel and mobile bottom sheet for the dream board.

**Architecture:** Extend existing AI tools in `apps/ota/src/lib/ai/tools.ts` with `manageTripBasket` and `captureIdentity` actions. Pass basket context in the chat system prompt. Build a new AI panel component for the dream board that coexists with the existing floating chat widget on other pages.

**Tech Stack:** AI SDK (existing), OpenAI (existing provider), Zustand, shadcn Sheet, existing chat transport

**Spec:** `docs/superpowers/specs/2026-04-01-consumer-trip-builder-design.md` Section 2
**Depends on:** Plans A-E (all complete)

---

## File Structure

```
apps/ota/src/
├── lib/ai/
│   └── tools.ts                        # MODIFY — add manageTripBasket + captureIdentity tools
├── app/api/chat/
│   └── route.ts                        # MODIFY — pass basket context in system prompt
├── components/trip-builder/
│   ├── ai-board-panel.tsx              # NEW — Desktop slide-out AI panel for dream board
│   ├── ai-mobile-bar.tsx              # NEW — Mobile compact suggestion bar (top)
│   ├── ai-mobile-sheet.tsx            # NEW — Mobile expandable bottom sheet
│   ├── ai-suggestion-card.tsx         # NEW — Draggable/tappable suggestion card
│   └── dream-board.tsx                # MODIFY — integrate AI panel
```

---

### Task 1: AI Tools — manageTripBasket + captureIdentity

**Files:**
- Modify: `apps/ota/src/lib/ai/tools.ts`
- Modify: `apps/ota/src/app/api/chat/route.ts`

Extend the existing AI tool system with two new tools that let the AI interact with the trip basket.

- [ ] **Step 1: Read existing tools file**

Read `apps/ota/src/lib/ai/tools.ts` to understand the current tool pattern. The existing tools use the AI SDK `tool()` function with `parameters` (zod schema) and `execute` (async function). Tools include `searchFlights`, `searchHotels`, `captureContact`, etc.

- [ ] **Step 2: Add manageTripBasket tool**

Add a new tool that the AI can call to add/remove components from the basket:

```typescript
manageTripBasket: tool({
  description: 'Add or remove a travel component (flight, hotel, cruise, tour) from the consumer\'s trip basket. Use this when the consumer wants to save a specific flight, hotel, or other travel product to their trip.',
  parameters: z.object({
    action: z.enum(['add', 'remove']).describe('Whether to add or remove the component'),
    componentId: z.string().optional().describe('Required for remove action — the component ID to remove'),
    component: z.object({
      type: z.enum(['flight', 'hotel', 'cruise', 'tour']),
      data: z.record(z.unknown()).describe('The structured booking data'),
      display: z.object({
        title: z.string(),
        subtitle: z.string().optional(),
        price: z.string().optional(),
        heroImage: z.string().optional(),
      }).optional(),
    }).optional().describe('Required for add action — the component to add'),
  }),
  execute: async ({ action, componentId, component }) => {
    // This tool returns instructions for the client to execute
    // The actual mutation happens client-side via the Zustand store
    if (action === 'add' && component) {
      return {
        action: 'add',
        component: {
          id: `ai-${Date.now()}`,
          type: component.type,
          data: component.data,
          display: component.display,
          addedAt: new Date().toISOString(),
        },
        message: `Added ${component.display?.title || component.type} to your trip!`,
      };
    }
    if (action === 'remove' && componentId) {
      return {
        action: 'remove',
        componentId,
        message: 'Removed from your trip.',
      };
    }
    return { action: 'error', message: 'Invalid action' };
  },
}),
```

- [ ] **Step 3: Add captureIdentity tool**

```typescript
captureIdentity: tool({
  description: 'Save the consumer\'s name and email to their trip so they can access their dream board and an advisor can contact them. Use this when the consumer shares their email in conversation.',
  parameters: z.object({
    email: z.string().email().describe('Consumer email'),
    name: z.string().optional().describe('Consumer name'),
    phone: z.string().optional().describe('Consumer phone'),
  }),
  execute: async ({ email, name, phone }) => {
    // Returns instructions for client to call linkIdentity
    return {
      action: 'linkIdentity',
      email,
      name,
      phone,
      message: `Great, I've saved your info! You can now view your dream board anytime.`,
    };
  },
}),
```

- [ ] **Step 4: Pass basket context in chat route**

In `apps/ota/src/app/api/chat/route.ts`, read the `ota_session` cookie and fetch the active basket. Append basket summary to the system prompt:

```typescript
// Read basket context
const cookieStore = await cookies();
const sessionId = cookieStore.get('ota_session')?.value;
let basketContext = '';
if (sessionId) {
  try {
    const drafts = await serviceFetch(`/ota/trip-requests/by-session/${sessionId}`);
    if (drafts.length > 0) {
      const active = drafts[0];
      const components = active.components || [];
      basketContext = `\n\nThe user has an active trip "${active.title || 'Untitled'}" with ${components.length} components: ${components.map(c => `${c.type}: ${c.display?.title || 'unnamed'}`).join(', ')}. Trip ID: ${active.id}.`;
    }
  } catch { /* no basket */ }
}

// Append to system prompt
const systemPrompt = baseSystemPrompt + basketContext;
```

- [ ] **Step 5: Verify + Commit**

```bash
pnpm --filter @tailfire/ota exec tsc --noEmit 2>&1 | head -10
git add apps/ota/src/lib/ai/ apps/ota/src/app/api/chat/
git commit -m "feat(ota): AI tools — manageTripBasket + captureIdentity + basket context"
```

---

### Task 2: AI Panel Components for Dream Board

**Files:**
- Create: `apps/ota/src/components/trip-builder/ai-suggestion-card.tsx`
- Create: `apps/ota/src/components/trip-builder/ai-board-panel.tsx`
- Create: `apps/ota/src/components/trip-builder/ai-mobile-bar.tsx`
- Create: `apps/ota/src/components/trip-builder/ai-mobile-sheet.tsx`
- Modify: `apps/ota/src/components/trip-builder/dream-board.tsx`

- [ ] **Step 1: Create ai-suggestion-card.tsx**

"use client" component. A card that shows an AI suggestion (flight, hotel, etc.) with an "Add" button.

Props: `suggestion: { type, title, subtitle, price?, heroImage? }, onAdd: () => void`

Small card with type emoji, title, subtitle, price, and gold "Add" button. On desktop this could eventually be draggable; for now just the Add button.

- [ ] **Step 2: Create ai-board-panel.tsx**

"use client" component. The desktop slide-out AI panel for the dream board.

Props: `isOpen: boolean, onClose: () => void, requestId: string`

Layout:
- Dark background (#1A1A1A) with rounded-l-xl
- Header: "✦ AI Concierge" title + close X button
- Chat messages area (scrollable)
- AI suggestion cards rendered inline in the chat
- Chat input at bottom
- Uses the existing chat hook pattern (`useChat` from AI SDK or the existing chat widget approach)

For the MVP: reuse the existing chat widget's message handling but render in a panel layout instead of a floating bubble. The AI tools (manageTripBasket, captureIdentity) return action objects that the panel interprets and calls the Zustand store.

- [ ] **Step 3: Create ai-mobile-bar.tsx**

"use client" component. Compact suggestion bar for mobile (shows at top of dream board).

Props: `suggestions: Array<{ type, title, price }>, onAdd: (suggestion) => void`

Horizontal scrollable row of small suggestion pills. Each has type emoji + title + price + "Add" button. If no suggestions, shows "Ask AI for suggestions" prompt.

For MVP: show a static prompt "✦ Ask AI for trip ideas" that opens the mobile sheet.

- [ ] **Step 4: Create ai-mobile-sheet.tsx**

"use client" component. Expandable bottom sheet for mobile AI chat.

Uses shadcn `Sheet` with `side="bottom"`. Contains the same chat interface as ai-board-panel but in a bottom sheet layout.

Props: `isOpen: boolean, onOpenChange: (open: boolean) => void, requestId: string`

- [ ] **Step 5: Integrate into dream-board.tsx**

Modify `dream-board.tsx`:
- Add state: `aiPanelOpen: boolean`
- Desktop: When AI panel is open, board container gets `lg:pr-[400px]` and the AI panel is absolutely positioned on the right
- Mobile: Show `<AiMobileBar>` between header and board. Show `<AiMobileSheet>` triggered by the chat input.
- Wire the "✦ AI" toggle button in BoardHeader

- [ ] **Step 6: Handle AI tool results**

When the AI calls `manageTripBasket` with action 'add', the chat component needs to:
1. Parse the tool result
2. Call `useTripBasket.addComponent(result.component)`
3. Show a confirmation message in the chat

When the AI calls `captureIdentity`:
1. Call `useTripBasket.linkIdentity(email, name, phone)`
2. Show confirmation in chat

This requires the chat component to have access to the Zustand store.

- [ ] **Step 7: Verify + Commit**

```bash
pnpm --filter @tailfire/ota exec tsc --noEmit 2>&1 | head -10
git add apps/ota/src/components/trip-builder/
git commit -m "feat(ota): AI panel for dream board — desktop slide-out + mobile sheet + suggestion cards"
```

---

### Task 3: Visual Polish + DnD Reordering

**Files:**
- Modify: `apps/ota/src/components/trip-builder/dream-board.tsx`
- Modify: `apps/ota/src/components/trip-builder/board-functional-card.tsx`
- Install: `@dnd-kit/core` + `@dnd-kit/sortable`

- [ ] **Step 1: Install dnd-kit**

```bash
cd apps/ota && pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Wrap board in DnD context**

In `dream-board.tsx`:
- Import `DndContext`, `closestCenter`, `SortableContext`, `verticalListSortingStrategy` from @dnd-kit
- Wrap the masonry grid in `<DndContext>` + `<SortableContext>`
- Each card gets wrapped in a `useSortable` hook
- On drag end: compute new board_order, call `updateBoardOrder()`

- [ ] **Step 3: Add hover effects + remove animation**

In `board-functional-card.tsx`:
- Add scale-on-hover: `hover:scale-[1.02] transition-transform`
- Remove button fades in on hover
- Remove animation: card shrinks and fades out

- [ ] **Step 4: Improve mobile masonry**

- Single column on small mobile (<640px)
- 2 columns on larger mobile / tablet
- 3 columns on desktop

- [ ] **Step 5: Verify + Commit**

```bash
pnpm --filter @tailfire/ota exec tsc --noEmit 2>&1 | head -10
git add apps/ota/
git commit -m "feat(ota): DnD reordering + visual polish for dream board cards"
```

---

## Post-Plan Notes

**What Phase 3 builds:**
- AI concierge integrated with trip basket (add/remove via chat)
- AI identity capture (email → CRM lookup from conversation)
- Basket context in AI system prompt
- Desktop AI slide-out panel on dream board
- Mobile AI bottom sheet on dream board
- Drag-and-drop card reordering
- Visual polish (hover effects, animations)

**Deferred:**
- Published trip → dream board on client portal
- Inspiration cards → bookable experiences
- Real-time advisor ↔ consumer collaboration
- Map/timeline views
- Social sharing with OG images
