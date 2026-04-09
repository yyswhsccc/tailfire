# Platform Architecture

Tailfire is a single-agency, multi-branch travel platform organized as a monorepo.

## Deployable Apps

- `admin`: advisor and back-office dashboard
- `api`: centralized backend API for validation, auth enforcement, and business logic
- `client`: traveler portal and shared proposal access flows
- `ota`: public discovery, AI concierge, advisor attribution, and trip-request surface

## Shared Packages

- `database`: Drizzle schema and migrations
- `shared-types`: DTOs, validators, and shared contracts
- `api-client`: reusable fetch primitives
- `trip-proposal-ui`: shared proposal presentation layer
- `ui-public`: shared public UI primitives
- `config`: shared TypeScript, ESLint, and port config

## Architectural Rules

- Frontend apps do not own business rules; the API does.
- Shared workflow terminology lives in `packages/shared-types` and the canonical docs.
- Trip stage, itinerary status, supplier booking, and proposal publishing are separate concepts and should stay documented that way.
- The OTA is more than marketing content now, but it still converts through advisor-led flows rather than direct checkout.
