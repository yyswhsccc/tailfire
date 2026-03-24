# Codex Review Fixes — Trip Preview & Publishing Plan

Apply these to the main plan before execution:

## 1. transpilePackages (BLOCKING)
Add to `apps/admin/next.config.ts` transpilePackages array:
```typescript
transpilePackages: ['@tailfire/shared-types', '@tailfire/trip-proposal-ui'],
```
Add to `apps/client/next.config.mjs` transpilePackages:
```javascript
transpilePackages: ['@tailfire/shared-types', '@tailfire/trip-proposal-ui'],
```

## 2. Package exports — add tailwind.preset subpath
```json
"exports": {
  ".": "./src/index.ts",
  "./components": "./src/components/index.ts",
  "./utils": "./src/utils/index.ts",
  "./tailwind.preset": "./src/tailwind.preset.ts"
}
```

## 3. Fix query key (tripKeys.detail only takes 1 arg)
```typescript
// WRONG:
queryKey: tripKeys.detail(tripId!, 'preview-proposal'),
// RIGHT:
queryKey: [...tripKeys.detail(tripId!), 'preview-proposal'],
```

## 4. text-shadow-hero is CSS, not Tailwind
Move the CSS utility from `apps/client/src/app/globals.css` into a Tailwind plugin within the shared preset:
```typescript
// packages/trip-proposal-ui/src/tailwind.preset.ts
plugin(function({ addUtilities }) {
  addUtilities({
    '.text-shadow-hero': {
      'text-shadow': '0 2px 4px rgba(0,0,0,0.3)',
    },
  })
})
```

## 5. Font loading for preview visual parity
Admin preview page must load Cinzel + Lato fonts (client fonts). Add to the preview page:
```typescript
import { Cinzel, Lato } from 'next/font/google'
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-display' })
const lato = Lato({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-body' })

// Wrap preview content:
<div className={`${cinzel.variable} ${lato.variable}`}>
  {/* preview content */}
</div>
```

## 6. ActivityCard — skip full render-prop conversion
ActivityCard already uses callback props (onConfirm, onDecline, commentButton). Keep those as-is. Only DaySection needs the render-prop refactor for DayCommentButton.
