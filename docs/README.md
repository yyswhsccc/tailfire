# Tailfire Documentation Index

This directory contains both canonical runbooks and historical design material. Use the files in this index first when you need the current repository view.

## Canonical Docs

| Document | Purpose |
| --- | --- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Current high-level app/package architecture |
| [`TRIP_WORKFLOW.md`](./TRIP_WORKFLOW.md) | Canonical trip stage, itinerary, booking, and proposal-versioning model |
| [`TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md`](./TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md) | Dev-team rollout plan for aligning the codebase to the canonical workflow model |
| [`EXTERNAL_APIS.md`](./EXTERNAL_APIS.md) | Canonical map of Traveltek, Globus, Amadeus, media, and OCR integrations |
| [`LOCAL_DEV.md`](./LOCAL_DEV.md) | Local setup, ports, env files, and daily commands |
| [`TESTING.md`](./TESTING.md) | Test scripts, coverage boundaries, and gaps |
| [`CI_CD.md`](./CI_CD.md) | What the current GitHub Actions workflows actually do |
| [`ENVIRONMENTS.md`](./ENVIRONMENTS.md) | Environment URLs, secrets strategy, and deployment mapping |
| [`DATABASE_ARCHITECTURE.md`](./DATABASE_ARCHITECTURE.md) | Database layout, FDW, and schema notes |
| [`MIGRATIONS.md`](./MIGRATIONS.md) | Migration workflow and constraints |
| [`SECURITY.md`](./SECURITY.md) | Auth, authorization, and security notes |
| [`MONITORING.md`](./MONITORING.md) | Sentry and monitoring runbooks |
| [`RELEASE_CHECKLIST.md`](./RELEASE_CHECKLIST.md) | Release checklist |
| [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | Ongoing platform issue log maintained by the team |
| [`REPOSITORY_REVIEW_ISSUES.md`](./REPOSITORY_REVIEW_ISSUES.md) | Issues captured during the current repository documentation review |

## App And Package Docs

- [`../apps/api/README.md`](../apps/api/README.md)
- [`../apps/admin/README.md`](../apps/admin/README.md)
- [`../apps/client/README.md`](../apps/client/README.md)
- [`../apps/ota/README.md`](../apps/ota/README.md)
- [`../packages/database/README.md`](../packages/database/README.md)
- [`../packages/shared-types/README.md`](../packages/shared-types/README.md)
- [`../packages/api-client/README.md`](../packages/api-client/README.md)
- [`../packages/ui-public/README.md`](../packages/ui-public/README.md)
- [`../packages/trip-proposal-ui/README.md`](../packages/trip-proposal-ui/README.md)
- [`../packages/config/README.md`](../packages/config/README.md)

## Wiki Seed

The local source pages for the GitHub Wiki seed live under:

- [`../wiki/Home.md`](../wiki/Home.md)
- [`../wiki/_Sidebar.md`](../wiki/_Sidebar.md)

## Historical Design Material

These directories are useful for context, but they are not guaranteed to match the current codebase line-for-line:

- [`plans/`](./plans/)
- [`superpowers/plans/`](./superpowers/plans/)
- [`superpowers/specs/`](./superpowers/specs/)

When a historical plan conflicts with code or the canonical docs above, treat the code and canonical docs as the source of truth.
