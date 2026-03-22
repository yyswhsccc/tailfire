# @tailfire/ui-public

Shared public-facing UI package used mainly by the client portal and OTA app.

## What It Exports

- Tailwind/classname helpers such as `cn`
- shared hooks such as `useIsMobile` and toast helpers
- public layout components such as `Footer` and `NavLink`
- a large set of shadcn-style UI primitives re-exported from `src/components/ui/*`
- `tailwind.preset`
- `globals.css`

## Primary Consumers

- `apps/client`
- `apps/ota`

The admin app mostly uses its own internal UI component tree instead.

## Scripts

Run from `packages/ui-public`:

```bash
pnpm lint
pnpm typecheck
```

There is currently no package test script.

## Notes

- This package exports source files directly.
- It is the main shared visual layer for the public/traveler-facing apps, not for the internal admin UI.

## Related Docs

- [`../../apps/client/README.md`](../../apps/client/README.md)
- [`../../apps/ota/README.md`](../../apps/ota/README.md)
