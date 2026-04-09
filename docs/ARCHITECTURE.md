# Architecture Overview

Tailfire is a single-agency, multi-branch travel platform organized as a pnpm/turbo monorepo.

## Deployable Apps

| App | Purpose |
| --- | --- |
| `apps/admin` | Advisor and back-office dashboard |
| `apps/api` | Central NestJS API for auth enforcement, validation, business logic, and persistence |
| `apps/client` | Traveler portal and shared proposal access flows |
| `apps/ota` | Public discovery, AI concierge, advisor attribution, trip requests, and traveler access |

## Shared Packages

| Package | Purpose |
| --- | --- |
| `packages/database` | Drizzle schema, migrations, and migration utilities |
| `packages/shared-types` | Shared DTOs, validators, transition maps, and API contracts |
| `packages/api-client` | Reusable fetch client primitives |
| `packages/ui-public` | Shared public-facing UI primitives |
| `packages/trip-proposal-ui` | Shared proposal presentation layer |
| `packages/config` | Shared config and port helpers |

## Core Architecture Rules

- Frontend apps use Supabase for identity flows, but business data flows through the NestJS API.
- The API is the enforcement point for authorization, validation, lifecycle rules, and persistence.
- Database changes are managed through Drizzle migrations run from `apps/api`.
- Shared contracts live in `packages/shared-types` and should be imported through the package boundary rather than source-file paths.

## OTA Reality

The OTA is no longer just a brochure shell. The tracked route tree includes:

- catalog-backed discovery pages for deals, destinations, regions, cruise lines, ships, cruises, and advisors
- search surfaces for cruises, flights, hotels, tours, and all-inclusives
- AI chat and trip-request API routes
- a traveler-facing `my-trip/[id]` route with token and session-based access
- advisor recruitment pages under `/join/*`

The remaining conversion path is still advisor-led. Public forms, legal content, and discovery metadata coverage are not complete enough to describe the OTA as a full self-serve booking app.

## Workflow Model

The current repo still separates these concerns:

- trip stage
- itinerary status
- supplier booking state
- proposal publishing and snapshot versioning

That separation matters in both the docs and the help center. A trip can be in `Planning` while an itinerary is `Proposing`, and publishing an itinerary snapshot is still separate from recording a supplier booking.

## Canonical References

- [Trip Workflow](./TRIP_WORKFLOW.md)
- [Local Development](./LOCAL_DEV.md)
- [Testing](./TESTING.md)
- [Repository Review Issues](./REPOSITORY_REVIEW_ISSUES.md)
