# @tailfire/trip-proposal-ui

Shared proposal presentation components for Tailfire trip previews and proposal experiences.

## What It Exports

- hero, itinerary shell, day sections, pricing summary, comparison views
- agent profile card
- activity cards and detail renderers
- Tailwind preset for proposal styling

## Current Repo Usage

- the admin trip preview route imports this package
- the client shared-trip route still has a parallel local implementation under `apps/client/src/app/shared/trips/[token]/_components`

That means this package is only partially adopted today.

## Directory Layout

```text
packages/trip-proposal-ui/
├── src/components/
├── src/utils/
├── src/index.ts
└── src/tailwind.preset.ts
```

## Scripts

This package currently does not define build, typecheck, or test scripts.

## Related Docs

- [`../../apps/admin/README.md`](../../apps/admin/README.md)
- [`../../apps/client/README.md`](../../apps/client/README.md)
- [`../../docs/REPOSITORY_REVIEW_ISSUES.md`](../../docs/REPOSITORY_REVIEW_ISSUES.md)
