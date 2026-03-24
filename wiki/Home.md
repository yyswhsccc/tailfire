# Tailfire Wiki

This wiki is the quick-start knowledge area for the Tailfire platform. It is designed for fast orientation and links back to the canonical repository docs for full detail.

Use this wiki for:

- repo and platform orientation
- agent help and platform usage guides
- local setup starting points
- trip workflow and booking model summaries
- operational runbook entry points

For the detailed source-of-truth documentation, use the canonical docs in the main repo:

- [Docs Index](https://github.com/Systemsaholic/tailfire/blob/main/docs/README.md)
- [Architecture](https://github.com/Systemsaholic/tailfire/blob/main/docs/ARCHITECTURE.md)
- [Trip Workflow](https://github.com/Systemsaholic/tailfire/blob/main/docs/TRIP_WORKFLOW.md)
- [Trip Workflow Implementation Plan](https://github.com/Systemsaholic/tailfire/blob/main/docs/TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md)
- [External APIs](https://github.com/Systemsaholic/tailfire/blob/main/docs/EXTERNAL_APIS.md)

## Start Here

- [Agent Guide Home](./Agent-Guide-Home.md)
- [Getting Started](./Getting-Started.md)
- [Platform Architecture](./Platform-Architecture.md)
- [Trip Workflow](./Trip-Workflow.md)
- [External Integrations](./External-Integrations.md)
- [Operations And Runbooks](./Operations-and-Runbooks.md)

## Agent Help Center

Use these pages for task-based help on how advisors and operations staff use the platform:

- [Agent Guide Home](./Agent-Guide-Home.md)
- [Create A Trip](./Agent-Guide-Create-A-Trip.md)
- [Build And Propose An Itinerary](./Agent-Guide-Build-And-Propose-An-Itinerary.md)
- [Record Supplier Bookings](./Agent-Guide-Record-Supplier-Bookings.md)
- [Flight Activities](./Agent-Guide-Flight-Activities.md)
- [Payment Schedules](./Agent-Guide-Payment-Schedules.md)
- [Service Fees](./Agent-Guide-Service-Fees.md)
- [Libraries](./Agent-Guide-Libraries.md)
- [Trip Components](./Agent-Guide-Trip-Components.md)
- [Template System](./Agent-Guide-Template-System.md)
- [Loyalty Programs](./Agent-Guide-Loyalty-Programs.md)
- [Tags](./Agent-Guide-Tags.md)
- [Email System](./Agent-Guide-Email-System.md)
- [Email Troubleshooting](./Agent-Guide-Email-Troubleshooting.md)

## Platform Surfaces

- `apps/admin`: B2B advisor/admin dashboard
- `apps/api`: NestJS backend API
- `apps/client`: traveler portal
- `apps/ota`: public storefront and marketing surface

## Current Canonical Focus

The most important current workflow area is the trip lifecycle and booking model:

- trip stage stays separate from itinerary approval and supplier booking
- itinerary approval and client responses remain version-aware
- the current codebase already stores the new trip stages and activity state fields
- the remaining open work is mostly lifecycle guardrails and booking-path normalization

See:

- [Trip Workflow](./Trip-Workflow.md)
- [Trip Workflow Implementation Plan](https://github.com/Systemsaholic/tailfire/blob/main/docs/TRIP_WORKFLOW_IMPLEMENTATION_PLAN.md)
- [Repository Review Issues](https://github.com/Systemsaholic/tailfire/blob/main/docs/REPOSITORY_REVIEW_ISSUES.md)
