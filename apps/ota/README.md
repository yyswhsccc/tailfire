# @tailfire/ota

Next.js public storefront and marketing surface for Phoenix Voyages.

## Current Scope

The OTA app is primarily a public-facing experience with landing, discovery, and brochure-style trip detail pages.

Current route areas include:

- home page
- search
- trip detail by slug
- advisors
- about
- contact
- privacy
- terms
- auth callback

## Current Data Sources

Several important flows are still local or placeholder-driven:

- trip search and trip detail pages use local data in `src/data/trips.ts`
- advisor content uses local data in `src/data/consultants.ts`
- inquiry, profile, and tracking helpers in `src/lib/api.ts` are placeholder functions that log locally instead of calling the NestJS API

This means the OTA is not yet a fully API-backed storefront.

## Development Commands

Run from `apps/ota`:

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

This workspace currently has no `typecheck` or `test` script.

## Environment

Copy `apps/ota/.env.example` to `apps/ota/.env.local`.

The example includes:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Even with those values present, many current OTA flows remain local/mock-backed.

## Practical Reality

- The app is useful for UI iteration and content exploration.
- It is not yet the same thing as a live end-to-end booking storefront.
- Search and lead capture work should be treated carefully because the current implementation can suggest more backend integration than actually exists.

## Related Docs

- [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- [`../../docs/LOCAL_DEV.md`](../../docs/LOCAL_DEV.md)
- [`../../docs/REPOSITORY_REVIEW_ISSUES.md`](../../docs/REPOSITORY_REVIEW_ISSUES.md)
