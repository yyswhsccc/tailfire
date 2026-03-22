# Platform Architecture

Tailfire is a single-agency, multi-branch travel platform organized as a monorepo.

## Deployable Apps

- `admin`: B2B advisor and back-office dashboard
- `api`: centralized backend API, validation, auth, and business logic
- `client`: traveler portal and shared proposal access flows
- `ota`: public storefront and marketing surface

## Shared Packages

- `database`: Drizzle schema, migrations, and database helpers
- `shared-types`: DTOs, shared contracts, and API types
- `api-client`: shared fetch client
- `trip-proposal-ui`: shared proposal presentation layer
- `ui-public`: shared UI primitives
- `config`: TypeScript and ESLint config

## Architectural Principles

- Frontend apps use Supabase Auth for identity flows, but business data flows through the NestJS API.
- Authorization, validation, and business rules are enforced centrally in the API.
- Cruise and tour catalog data are shared across surfaces.
- Canonical docs under `docs/` are the repo source of truth; historical plan/spec files are supporting context only.

## Lifecycle And Workflow

The most important current architecture clarification is the separation of:

- trip stage
- itinerary status
- activity booking and fulfillment
- proposal versioning

That model is documented here:

- [Trip Workflow](./Trip-Workflow.md)
- [Canonical Trip Workflow Doc](https://github.com/Systemsaholic/tailfire/blob/main/docs/TRIP_WORKFLOW.md)

## Canonical References

- [Architecture](https://github.com/Systemsaholic/tailfire/blob/main/docs/ARCHITECTURE.md)
- [Database Architecture](https://github.com/Systemsaholic/tailfire/blob/main/docs/DATABASE_ARCHITECTURE.md)
- [Security](https://github.com/Systemsaholic/tailfire/blob/main/docs/SECURITY.md)
