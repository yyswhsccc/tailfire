# TripsService Public Surface — Characterization Inventory

**Source:** `apps/api/src/trips/trips.service.ts` (5,489 LOC at time of writing — 2026-05-14)

**Purpose (per Issue #360 — Step 4 of refactor roadmap #362):** lock the current public surface so any future split into smaller services preserves the contract byte-for-byte.

**Rule for future split PRs:** If you are extracting methods out of `TripsService` into a new service class (e.g. `TripMutationService`, `TripPublishingService`, `TripBookingSummaryReader`, `TripOwnershipService`, etc.), your PR description **must cite this inventory** and identify which method(s) you are moving. The split is byte-identical at the controller boundary unless the inventory is updated in the same PR with an explicit note.

This addresses Codex's concern that this doc could become "documentation theater" — citation is the enforcement mechanism.

---

## Method inventory

### Mutation surface (TripMutationService split target)

| # | Method | LOC | Return | Notes |
|---|---|---|---|---|
| 1 | `create` | 101 | `TripResponseDto` | Emits `TripCreatedEvent` + `AuditEvent`. Generates ref number. |
| 2 | `update` | 586 | `TripResponseDto` | Patches whitelisted fields. Emits `TripUpdatedEvent` + audit. Validates status transitions via `canTransitionTripStatus`. |
| 3 | `remove` | 1070 | `void` | Soft-delete (sets `deletedAt`). |
| 4 | `bulkDelete` | 1120 | summary | Soft-delete in bulk. |
| 5 | `bulkArchive` | 1208 | summary | |
| 6 | `bulkChangeStatus` | 1293 | summary | Validates each transition individually. |
| 7 | `cancelTrip` | 4671 | `TripResponseDto` | Status → `cancelled`, captures `statusBeforeCancel`. |
| 8 | `restoreTrip` | 4745 | `TripResponseDto` | Reverses soft-delete. |
| 9 | `uncancelTrip` | 4782 | `TripResponseDto` | Reverts to `statusBeforeCancel`. |
| 10 | `duplicateTrip` | 3564 | `TripResponseDto` | Deep-clone (itineraries, days, activities, travelers). |
| 11 | `sendBookingConfirmation` | 5041 | unspecified | Emits confirmation email via `EmailService`. |

### Read surface (TripBookingSummaryReader + general readers)

| # | Method | LOC | Return | Notes |
|---|---|---|---|---|
| 12 | `findAll` | 237 | `PaginatedTripsResponseDto` | Filters, agency RLS, pagination. |
| 13 | `findOne` | 524 | `TripResponseDto` | |
| 14 | `getFilterOptions` | 1584 | filter facets | Reads via `TripAccessService` and optional `tripGroupAccessService`. |
| 15 | **`getBookingStatus`** ⭐ | 1673 | `TripBookingStatusResponseDto` | **First split target.** Uses `summarizeActivityPaymentStatus` and `emptyTripBookingStatusSummary` from `trip-booking-status-helpers.ts` (characterized 2026-05-14). |
| 16 | `getTripLocations` | 5228 | `TripLocation[]` | |

### Ownership surface (TripOwnershipService split target)

| # | Method | LOC | Return | Notes |
|---|---|---|---|---|
| 17 | `updateOwner` | 881 | unspecified | Emits audit. |
| 18 | `reassignTripOwner` | 924 | unspecified | Updates `trip_collaborators` (cascade). |
| 19 | `bulkReassignPreview` | 1452 | preview summary | Read-only — counts what would change. |
| 20 | `bulkReassign` | 1534 | summary | Executes the reassignment. |

### Publishing surface (TripPublishingService split target)

| # | Method | LOC | Return | Notes |
|---|---|---|---|---|
| 21 | `publishTrip` | 1895 | `TripResponseDto` | Sets `isPublished`, `publishedAt`. |
| 22 | `publishTripSnapshot` | 1949 | `TripResponseDto & { publishedItineraries }` | Captures itinerary versions. |
| 23 | `unpublishTrip` | 1987 | `TripResponseDto` | |

### Proposal / sharing surface (TripProposalService split target — future)

| # | Method | LOC | Return | Notes |
|---|---|---|---|---|
| 24 | `findByShareToken` | 2013 | `SharedTripProposalDto` | Public read by token. |
| 25 | `previewProposal` | 2150 | `SharedTripProposalDto` | Internal preview. |
| 26 | `selectItinerary` | 2247 | unspecified | Client picks one of N itinerary options. |
| 27 | `getProposalComments` | 2343 | `ProposalCommentsResponseDto` | |
| 28 | `createProposalComment` | 2410 | comment | Client-side comment. |
| 29 | `createAgentComment` | 2534 | comment | Agent-side comment on same thread. |
| 30 | `approveProposal` | 2667 | `{ success, status }` | |
| 31 | `createActivityResponse` | 2730 | unspecified | Client accepts/declines individual activities. |
| 32 | `getActivityResponses` | 2833 | list | |
| 33 | `declineProposal` | 2879 | unspecified | |
| 34 | `getAdminActivityResponses` | 2923 | list | Admin view of same data. |
| 35 | `getAgentComments` | 2970 | list | |
| 36 | `buildItinerarySnapshot` | 3025 | snapshot DTO | Used by `publishTripSnapshot`. |

### Trip groups surface (TripGroupsService split target — already partially extracted)

| # | Method | LOC | Return | Notes |
|---|---|---|---|---|
| 37 | `listTripGroups` | 3883 | list | |
| 38 | `createTripGroup` | 3930 | group | |
| 39 | `updateTripGroup` | 3966 | group | |
| 40 | `deleteTripGroup` | 4026 | unspecified | |
| 41 | `getTripsByGroup` | 4063 | list | |
| 42 | `getGroupTravelers` | 4089 | list | |
| 43 | `getGroupSummary` | 4163 | summary | |
| 44 | `cancelGroupTrips` | 4230 | summary | Cascades to all trips in group. |
| 45 | `addTripsToGroup` | 4299 | summary | |
| 46 | `removeTripFromGroup` | 4378 | unspecified | |
| 47 | `listGroupDocuments` | 4422 | list | |
| 48 | `createGroupDocument` | 4445 | document | |
| 49 | `deleteGroupDocument` | 4490 | unspecified | |
| 50 | `listGroupMedia` | 4528 | list | |
| 51 | `createGroupMedia` | 4550 | media | |
| 52 | `updateGroupMedia` | 4596 | media | |
| 53 | `deleteGroupMedia` | 4622 | unspecified | |

### Automation surface (TripAutomationService split target)

| # | Method | LOC | Return | Notes |
|---|---|---|---|---|
| 54 | `scheduleStatusTransitions` | 4842 | unspecified | BullMQ jobs for auto-status changes. |
| 55 | `cancelScheduledTransitions` | 5003 | `void` | |
| 56 | `rescheduleStatusTransitions` | 5022 | unspecified | |
| 57 | `updateCommissionOverrides` | 5413 | `{ tripId, updatedCollaborators }` | **PR-1 Commission Foundation**: writes `trips.commission_fee_rate_override` + `trip_collaborators.{commission_percentage, agent_split_override}` atomically with `trip_settings_history` audit rows. Admin-only via the new Trip Settings tab (ships PR-2). Split target: `TripCommissionService` or `TripMutationService`. |
| 58 | `listCommissionCollaborators` | 5413 | `Array<{ id, …, agentSplitOverride, user }>` | **PR-2 Commission UI**: lists `trip_collaborators` with joined `user_profiles` display fields. Read-only counterpart to #57. Powers the Settings tab collaborator table. Same split target as #57. |

---

## Coverage status (2026-05-14)

| Coverage type | Status |
|---|---|
| Unit specs on pure helpers | **11 specs** on `trip-booking-status-helpers.ts` (`getBookingStatus` partial extraction) |
| Integration specs on mutation surface | `trips-workflow.spec.ts` exists (in 25/62 failing API spec bucket — needs CI DB infra to run, tracked separately) |
| Type-level contract | All return types are exported from `@tailfire/shared-types`. TypeScript catches signature drift at compile time. |

**To enable full integration coverage of this surface, the CI Postgres infrastructure issue must land first** (file follow-up issue; tracked alongside this PR). Until then, the integration tests in `__tests__/trips-workflow.spec.ts` are not running.

---

## Split target priority (per Codex audit + this PR)

1. **TripBookingSummaryReader** (`getBookingStatus`) — pure helpers extracted in PR #360. Service split is now the smallest possible follow-up.
2. **TripPublishingService** (`publishTrip`, `publishTripSnapshot`, `unpublishTrip`, plus `buildItinerarySnapshot` dependency).
3. **TripOwnershipService** (`updateOwner`, `reassignTripOwner`, `bulkReassign*`).
4. **TripGroupsService** (33% of methods are group-management — natural separation).
5. **TripProposalService** (proposal + activity responses + comments — public-facing share surface).
6. **TripMutationService** (`create`, `update`, `remove`, lifecycle methods) — the keystone, do last.

---

## Doctrine: every TripsService refactor PR must cite this file

If your PR title or body does not include one of:
- `Surface inventory: moving method #N (foo) to X service`
- `Surface inventory unchanged (extracting pure helper)`
- `Updates TRIPS_SERVICE_SURFACE.md (with rationale)`

… then the reviewer should reject the PR and ask which line of this inventory is being moved.

This is the only enforcement mechanism that prevents documentation theater.
