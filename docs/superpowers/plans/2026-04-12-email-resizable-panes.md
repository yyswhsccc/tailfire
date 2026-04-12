# Email Resizable + Collapsible Panes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the email inbox three-pane layout (Folders | Email List | Reader) resizable via drag handles and collapsible via chevrons/double-click, with widths persisted to the user's profile.

**Architecture:** A reusable `ResizablePane` component handles drag logic via mouse events. Pane widths and collapsed state are stored in `platformPreferences.emailPaneWidths` (existing JSONB field). Debounced save to avoid excessive API calls during drag. No backend changes needed.

**Tech Stack:** React (mouse events for drag), Tailwind CSS, existing `useUpdateMyProfile` hook for persistence

---

### Task 1: Create ResizablePaneLayout component

**Files:**
- Create: `apps/admin/src/components/ui/resizable-pane-layout.tsx`

- [ ] **Step 1: Create the component**

This is a generic three-pane resizable layout component. It handles:
- Mouse drag on dividers to resize
- Chevron buttons to collapse/expand
- Double-click on divider to collapse/expand
- Min/max width constraints
- Callback when widths change (for persistence)

```tsx
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaneConfig {
  defaultWidth: number
  minWidth: number
  maxWidth: number
  collapsed?: boolean
  collapsedWidth?: number  // width when collapsed (default 0)
}

interface ResizablePaneLayoutProps {
  left: PaneConfig & { children: React.ReactNode }
  center: PaneConfig & { children: React.ReactNode }
  right: { children: React.ReactNode }  // right fills remaining space
  className?: string
  /** Called when widths or collapsed state changes (debounce externally) */
  onLayoutChange?: (layout: {
    leftWidth: number
    centerWidth: number
    leftCollapsed: boolean
    centerCollapsed: boolean
  }) => void
  /** Initial layout from persisted settings */
  initialLayout?: {
    leftWidth?: number
    centerWidth?: number
    leftCollapsed?: boolean
    centerCollapsed?: boolean
  }
}
```

The component:
- Renders three sections separated by draggable dividers
- Each divider is a 4px-wide hover target with a visible 1px line
- Dividers have a chevron icon centered vertically
- Mouse down on divider starts drag → mousemove updates width → mouseup stops
- Double-click on divider toggles collapsed state
- When collapsed, pane shrinks to `collapsedWidth` (default 20px) with only a chevron visible
- Calls `onLayoutChange` whenever widths or collapsed state change

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/components/ui/resizable-pane-layout.tsx
git commit -m "feat: add ResizablePaneLayout component with drag + collapse"
```

---

### Task 2: Hook for persisted pane layout

**Files:**
- Create: `apps/admin/src/hooks/use-email-layout.ts`

- [ ] **Step 1: Create the persistence hook**

```typescript
'use client'

import { useCallback, useMemo } from 'react'
import { useDebouncedCallback } from '@/hooks/use-debounce'
import { useMyProfile, useUpdateMyProfile } from '@/hooks/use-user-profile'

interface EmailPaneLayout {
  leftWidth: number
  centerWidth: number
  leftCollapsed: boolean
  centerCollapsed: boolean
}

const DEFAULT_LAYOUT: EmailPaneLayout = {
  leftWidth: 200,
  centerWidth: 350,
  leftCollapsed: false,
  centerCollapsed: false,
}

export function useEmailLayout() {
  const { data: profile } = useMyProfile()
  const updateProfile = useUpdateMyProfile()

  const layout = useMemo<EmailPaneLayout>(() => {
    const saved = (profile?.platformPreferences as any)?.emailPaneWidths
    if (!saved) return DEFAULT_LAYOUT
    return {
      leftWidth: saved.folders ?? DEFAULT_LAYOUT.leftWidth,
      centerWidth: saved.emailList ?? DEFAULT_LAYOUT.centerWidth,
      leftCollapsed: saved.foldersCollapsed ?? DEFAULT_LAYOUT.leftCollapsed,
      centerCollapsed: saved.emailListCollapsed ?? DEFAULT_LAYOUT.centerCollapsed,
    }
  }, [profile?.platformPreferences])

  const saveLayout = useDebouncedCallback((newLayout: EmailPaneLayout) => {
    updateProfile.mutate({
      platformPreferences: {
        ...(profile?.platformPreferences as object),
        emailPaneWidths: {
          folders: newLayout.leftWidth,
          emailList: newLayout.centerWidth,
          foldersCollapsed: newLayout.leftCollapsed,
          emailListCollapsed: newLayout.centerCollapsed,
        },
      },
    })
  }, 500)

  return { layout, saveLayout }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/hooks/use-email-layout.ts
git commit -m "feat: add useEmailLayout hook for persisted pane widths"
```

---

### Task 3: Wire ResizablePaneLayout into inbox page

**Files:**
- Modify: `apps/admin/src/app/emails/inbox/page.tsx`

- [ ] **Step 1: Replace hardcoded widths with ResizablePaneLayout**

Read the file first. The current layout (around line 172-280) has:
- `div.w-52` for folder sidebar
- `div.w-80` for email list
- `div.flex-1` for reader

Replace with:

```tsx
import { ResizablePaneLayout } from '@/components/ui/resizable-pane-layout'
import { useEmailLayout } from '@/hooks/use-email-layout'

// Inside the component:
const { layout, saveLayout } = useEmailLayout()

// Replace the three hardcoded divs with:
<ResizablePaneLayout
  className="h-[calc(100vh-8rem)] overflow-hidden rounded-lg border"
  initialLayout={layout}
  onLayoutChange={saveLayout}
  left={{
    defaultWidth: 200,
    minWidth: 150,
    maxWidth: 350,
    collapsedWidth: 20,
    children: (
      // Existing folder sidebar content (header + FolderSidebar)
    ),
  }}
  center={{
    defaultWidth: 350,
    minWidth: 250,
    maxWidth: 600,
    collapsedWidth: 20,
    children: (
      // Existing email list content (search + sort + EmailList)
    ),
  }}
  right={{
    children: (
      // Existing email reader content
    ),
  }}
/>
```

Move the content from the three existing divs into the `children` props. Remove the hardcoded width classes (`w-52`, `w-80`).

- [ ] **Step 2: Commit**

```bash
git add apps/admin/src/app/emails/inbox/page.tsx
git commit -m "feat: wire resizable pane layout into email inbox"
```

---

### Task 4: Type-check + push to preview

- [ ] **Step 1: Type-check**

```bash
npx tsc --noEmit -p apps/admin/tsconfig.json
```

- [ ] **Step 2: Push and merge to preview**

```bash
git push
git checkout preview && git merge feature/email-inbox-improvements --no-edit && git push
git checkout feature/email-inbox-improvements
```

- [ ] **Step 3: Test on tf-demo**

1. Drag divider between folders and email list — width changes smoothly
2. Drag divider between email list and reader — width changes
3. Click chevron on folder divider — folders collapse to thin strip
4. Click chevron again — folders expand back
5. Double-click divider — toggles collapse
6. Resize, refresh page — widths persist
7. Collapse, refresh — collapsed state persists
