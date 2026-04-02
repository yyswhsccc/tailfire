# Consumer Trip Builder — Submit Flow + Share (Plan E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the submit review screen and share feature — the final step where consumers review their trip, confirm details, and submit to an advisor.

**Architecture:** Client component at the bottom of the dream board (or as a separate view). Review summary of components, confirm travelers/dates/style, special requests textarea, share link generation, and submit button that triggers the Phase 1 promotion pipeline.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS, shadcn/ui, existing trip basket store + backend endpoints

**Depends on:** Plan A (Backend) + Plan B (Basket) + Plan C (Dream Board)

---

## File Structure

```
apps/ota/src/components/trip-builder/
├── submit-review.tsx               # NEW — Full submit flow component
├── submit-summary.tsx              # NEW — Component summary with prices
├── submit-details-form.tsx         # NEW — Travelers, dates, style, requests
├── share-button.tsx                # NEW — Generate + copy share link
└── submit-success.tsx              # NEW — Post-submit confirmation
```

---

### Task 1: Submit Review Flow

**Files:**
- Create: `apps/ota/src/components/trip-builder/submit-review.tsx`
- Create: `apps/ota/src/components/trip-builder/submit-summary.tsx`
- Create: `apps/ota/src/components/trip-builder/submit-details-form.tsx`
- Create: `apps/ota/src/components/trip-builder/share-button.tsx`
- Create: `apps/ota/src/components/trip-builder/submit-success.tsx`
- Modify: `apps/ota/src/components/trip-builder/dream-board.tsx` — wire submit button

- [ ] **Step 1: Create submit-summary.tsx**

Lists all functional components with small image, title, price. Shows approximate total with disclaimer. Uses Card from shadcn.

Props: `components: TripComponent[]`

- [ ] **Step 2: Create submit-details-form.tsx**

Form fields: travelers count (number input), departure date (date input, pre-filled), date flexibility toggle, travel style select (relaxed/adventure/luxury/budget/family), name/email/phone (pre-filled if identified), special requests textarea.

Props: `defaultValues: { travelers?, startDate?, name?, email?, phone? }, onSubmit: (data) => void, isSubmitting: boolean`

Uses shadcn Input, Label, Textarea, Select, Button. Validates email required.

- [ ] **Step 3: Create share-button.tsx**

Button that generates a share link and copies to clipboard.

Props: `requestId: string`

On click: calls `POST /api/trip-requests/{id}/share` → gets shareToken → builds URL → copies to clipboard → shows "Copied!" toast.

- [ ] **Step 4: Create submit-success.tsx**

Post-submit confirmation screen.

Props: `tripId?: string`

Shows: checkmark icon, "Your dream trip has been submitted!", "An advisor will review and reach out within 2 hours", buttons for "Search Another Trip" + "Talk to AI Concierge".

- [ ] **Step 5: Create submit-review.tsx**

Main orchestrator. Shows when user clicks "Submit Trip" on the board.

Props: `requestId: string, components: TripComponent[], startDate?, travelers?, isIdentified: boolean`

States: `reviewing` (default), `submitting`, `success`

Layout:
1. SubmitSummary (components + total)
2. SubmitDetailsForm (travelers, dates, style, contact info, requests)
3. ShareButton
4. Submit button → calls identity link if needed (email), then `POST /api/trip-requests/{id}/submit`
5. On success → show SubmitSuccess

- [ ] **Step 6: Wire into dream-board.tsx**

Add state `showSubmit` to DreamBoard. When "Submit Trip" in header is clicked, show `<SubmitReview>` instead of the board. Back button to return to board.

- [ ] **Step 7: Verify + Commit**

```bash
pnpm --filter @tailfire/ota exec tsc --noEmit 2>&1 | head -10
git add apps/ota/src/components/trip-builder/
git commit -m "feat(ota): submit review flow with summary, details, share, and confirmation"
```
