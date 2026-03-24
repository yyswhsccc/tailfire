# API Health Dashboard — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Replace static API Credentials page with active health monitoring — BullMQ checks every 15 min, stores results, notifies admins on failure.

**Spec:** `docs/superpowers/specs/2026-03-21-api-health-dashboard-design.md`

---

## Task 1: Migration + Schema

- Create `packages/database/src/migrations/20260321120000_create_api_health_checks.sql`
- Create `packages/database/src/schema/api-health-checks.schema.ts`
- Export from schema index, register in journal
- Run migration

## Task 2: Export TraveltekAuthService

- In `apps/api/src/cruise-booking/cruise-booking.module.ts`, add `TraveltekAuthService` to exports array

## Task 3: ApiHealthService + Types

- Create `apps/api/src/api-health/api-health.types.ts` — provider list, check result type
- Create `apps/api/src/api-health/api-health.service.ts` — check methods for all 15 providers
- Reuse existing `ApiCredentialsService.testConnection()` for providers that have it
- New checks for: Traveltek, Globus, Stripe, Resend, Redis, ExchangeRate-API, Traveltek FTP, OpenAI

## Task 4: ApiHealthProcessor (BullMQ)

- Create `apps/api/src/api-health/api-health.processor.ts` — BullMQ worker
- Fan-out: one job per configured provider
- Write results to `api_health_checks` table
- Check consecutive failures → notify admins
- Recovery notifications

## Task 5: ApiHealthController + Module

- Create `apps/api/src/api-health/api-health.controller.ts` — 3 endpoints
- Create `apps/api/src/api-health/api-health.module.ts` — wire everything
- Register queue in module, register module in AppModule
- Add repeatable job (every 15 min) on module init

## Task 6: Frontend — Hooks + Page Refactor

- Create `apps/admin/src/hooks/use-api-health.ts` — React Query hooks
- Refactor `apps/admin/src/app/settings/api-credentials/page.tsx` — status grid with cards
- Rename tab label from "API Credentials" to "API Health"
- Group cards by category, status dots, Test Now buttons, expandable history

## Task 7: Cleanup + Verification

- 7-day retention cleanup job
- Typecheck, build verify
- Commit all, push to preview
