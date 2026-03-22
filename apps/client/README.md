# @tailfire/client

Next.js traveler portal for Phoenix Voyages customers.

## Current Scope

The client app is an authenticated portal built around Supabase auth plus portal-specific API endpoints.

Current route areas include:

- login and auth callback
- dashboard
- trips list
- trip detail
- itinerary detail
- documents
- traveler profile and loyalty programs
- shared trip proposal pages by token

The route tree also includes placeholder "coming soon" pages for:

- messages
- payments
- preferences
- settings

## Data Flow

- auth is handled with Supabase client sessions
- authenticated portal requests use the bearer token from the current session
- most portal data flows through `src/lib/api.ts`
- shared trip proposal pages fetch public token-based data from the API

## Key Features Present Today

- portal profile editing
- avatar upload/remove
- trips and itinerary viewing
- document listing
- loyalty program CRUD
- public shared proposal rendering with comments/approval-related UI

## Development Commands

Run from `apps/client`:

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
```

There is currently no `test` script in this workspace.

## Environment

Copy `apps/client/.env.example` to `apps/client/.env.local`.

Key variables:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Current Caveats

- The app depends on a working API for authenticated traveler flows.
- Some dashboard sections are intentionally scaffolded but not yet implemented.
- The shared trip proposal route still uses client-local proposal components instead of the `@tailfire/trip-proposal-ui` package used by the admin preview route.

## Related Docs

- [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
- [`../../docs/LOCAL_DEV.md`](../../docs/LOCAL_DEV.md)
- [`../../docs/REPOSITORY_REVIEW_ISSUES.md`](../../docs/REPOSITORY_REVIEW_ISSUES.md)
