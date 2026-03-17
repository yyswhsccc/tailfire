# Commission Tracking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a transparent commission tracking page where agents see their commissions (gross, tax, tech fee, split) and can claim payable commissions, while admins see all agents and approve claims.

**Architecture:** Fix the commission calculation formula (deduct tax + tech fee before agent split), auto-create trip collaborators, add departure-based payability filter, build admin + agent commission page views with React Query hooks.

**Tech Stack:** NestJS (API), Next.js + shadcn/ui (Admin), TanStack Query, Drizzle ORM

---

## Commission Calculation (Corrected)

```
Gross Commission (supplier pays based on activity_pricing.commission_rate)
  minus Tax (commission_tracking.tax_amount_cents)
  minus Tech Fee (net × agency_settings.commission_fee_rate / 100)
  = Distributable
  Agency keeps (100 - agentSplitRate)%                ← always fixed (default 40%)
  Agent portion = distributable × agentSplitRate%     ← default 60%
    × Collaborator share (trip_collaborators.commission_percentage / 100)
    = Individual Agent Payout

Collaborator split: comes from the agent's portion ONLY.
Agency cut is never reduced. commission_percentage values sum to 100.
Single agent = 100%. Two agents might be lead=70, support=30.
agentSplitRate comes from user_profiles.commission_settings.splitValue (default 60).
```

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/financials/commission/commission.service.ts` | Modify | Fix payout formula, add departure filter, remove threshold, auto-calc tech fee |
| `apps/api/src/financials/commission/commission.controller.ts` | Modify | Add RBAC scoping (admin=all, agent=self), add agent claim endpoint |
| `apps/api/src/trips/trips.service.ts` | Modify | Auto-create trip_collaborator on trip create |
| `apps/api/src/users/users.service.ts` | Modify | Default splitValue to 60 for new users |
| `packages/shared-types/src/api/commission.types.ts` | Create | Export commission DTOs for frontend |
| `apps/admin/src/hooks/use-commission.ts` | Create | React Query hooks for commission API |
| `apps/admin/src/app/commission/page.tsx` | Rewrite | Full commission page (agent + admin views) |
| `apps/admin/src/app/commission/_components/commission-stats.tsx` | Create | KPI cards |
| `apps/admin/src/app/commission/_components/commission-table.tsx` | Create | Commission checks table |
| `apps/admin/src/app/commission/_components/agent-payable-table.tsx` | Create | Admin: payable by agent |
| `apps/admin/src/app/commission/_components/claim-dialog.tsx` | Create | Agent claim/cashout dialog |

---

## Chunk 1: Fix Commission Calculation (API)

### Task 1: Fix getCommissionDue() formula

**Files:** `apps/api/src/financials/commission/commission.service.ts`

- [ ] **Step 1:** Update the SQL query in `getCommissionDue()` (around line 557).

Current: `ROUND(cci.received_cents * tc.commission_percentage / 100)`

Replace with: `ROUND((cci.received_cents - COALESCE(ct.tax_amount_cents, 0) - COALESCE(ct.platform_fee_cents, 0)) * tc.commission_percentage / 100)`

This requires joining `commission_tracking ct` on `ct.activity_pricing_id = cci.activity_pricing_id`.

- [ ] **Step 2:** Add trip departure filter — only include trips where `t.status IN ('in_progress', 'completed')`.

- [ ] **Step 3:** Remove the `>= 5000` threshold (line ~594). Agents should see all payable amounts.

- [ ] **Step 4:** Apply same formula fix in `payAgents()` settlement creation (line ~660).

- [ ] **Step 5:** Typecheck and commit.

---

### Task 2: Auto-calculate platform fee in upsertActivityCommission()

**Files:** `apps/api/src/financials/commission/commission.service.ts`

- [ ] **Step 1:** In `upsertActivityCommission()`, after computing `netCommissionCents = gross - tax`, calculate the platform fee:

```typescript
// Fetch agency commission fee rate
const [agency] = await this.db.client
  .select({ commissionFeeRate: this.db.schema.agencySettings.commissionFeeRate })
  .from(this.db.schema.agencySettings)
  .where(eq(this.db.schema.agencySettings.agencyId, agencyId))
  .limit(1)

const feeRate = parseFloat(agency?.commissionFeeRate || '5.00')
const platformFeeCents = Math.round(netCommissionCents * feeRate / 100)
```

Store `platformFeeCents` in the upsert.

- [ ] **Step 2:** Also check for trip-level `commissionFeeRateOverride` — if set, use that instead of agency default.

- [ ] **Step 3:** Commit.

---

### Task 3: Auto-create trip collaborator on trip create

**Files:** `apps/api/src/trips/trips.service.ts`

- [ ] **Step 1:** In the `create()` method, after inserting the trip, auto-create a `trip_collaborators` record for the trip owner:

```typescript
// Auto-create collaborator with agent's default split
const [profile] = await this.db.client
  .select({ commissionSettings: this.db.schema.userProfiles.commissionSettings })
  .from(this.db.schema.userProfiles)
  .where(eq(this.db.schema.userProfiles.id, trip.ownerId))
  .limit(1)

const defaultSplit = (profile?.commissionSettings as any)?.splitValue ?? 60

await this.db.client.insert(this.db.schema.tripCollaborators).values({
  tripId: trip.id,
  userId: trip.ownerId,
  commissionPercentage: String(defaultSplit),
  isActive: true,
})
```

- [ ] **Step 2:** Commit.

---

### Task 4: Default splitValue for new users

**Files:** `apps/api/src/users/users.service.ts`

- [ ] **Step 1:** When creating a new user, if `commissionSettings` is not provided, default `splitValue` to 60:

```typescript
commissionSettings: dto.commissionSettings ?? { splitType: 'percentage', splitValue: 60 }
```

- [ ] **Step 2:** Commit.

---

### Task 5: Add RBAC scoping to commission endpoints

**Files:** `apps/api/src/financials/commission/commission.controller.ts`

- [ ] **Step 1:** Add `@GetAuthContext()` to all endpoints. For non-admin users, scope queries to their own userId:
- `getCommissionDue()` — admin sees all, agent sees only their own
- `getChecks()` — admin sees all, agent sees only checks where `recipientUserId = auth.userId`
- `getSummary()` — admin gets agency totals, agent gets personal totals

- [ ] **Step 2:** Add a self-claim endpoint for agents:

```typescript
@Post('commission/claims/me')
async claimMyCommission(
  @GetAuthContext() auth: AuthContext,
): Promise<CommissionCheckResponseDto[]> {
  return this.commissionService.payAgents(auth.agencyId, {
    userIds: [auth.userId],
  }, auth.userId)
}
```

- [ ] **Step 3:** Commit.

---

## Chunk 2: Shared Types + Hooks (Frontend Foundation)

### Task 6: Export commission types to shared-types

**Files:** `packages/shared-types/src/api/commission.types.ts` (create), `packages/shared-types/src/api/index.ts` (modify)

- [ ] **Step 1:** Create `commission.types.ts` — copy the key interfaces from `commission.types.ts` in the API (response DTOs, filter DTOs, summary).

- [ ] **Step 2:** Export from index.

- [ ] **Step 3:** Commit.

---

### Task 7: Create commission hooks

**Files:** `apps/admin/src/hooks/use-commission.ts` (create)

- [ ] **Step 1:** Create hooks:
- `useCommissionDue()` — GET /commission/due
- `useCommissionChecks(filter)` — GET /commission/checks
- `useCommissionCheckDetail(id)` — GET /commission/checks/:id
- `useCommissionSummary()` — GET /commission/summary
- `useClaimCommission()` — POST /commission/claims/me (mutation)
- `useAcceptCheck()` — POST /commission/checks/:id/accept (mutation)
- `useUpdateCheck()` — PATCH /commission/checks/:id (mutation)

- [ ] **Step 2:** Commit.

---

## Chunk 3: Commission Page UI

### Task 8: Commission stats cards

**Files:** `apps/admin/src/app/commission/_components/commission-stats.tsx` (create)

- [ ] **Step 1:** Create component with 5 cards:

**Agent view:** Payable Now, Gross Commission, Deductions (tax + tech fee), Claims Pending, Paid YTD

**Admin view:** Total Payable (all agents), Total Received (agency), Outstanding Commission, Claims Pending, Paid YTD

- [ ] **Step 2:** Commit.

---

### Task 9: Commission tables

**Files:**
- `apps/admin/src/app/commission/_components/commission-table.tsx` (create)
- `apps/admin/src/app/commission/_components/agent-payable-table.tsx` (create)

- [ ] **Step 1:** Agent commission table — columns: Trip, Supplier, Gross, Tax, Tech Fee, Agent Split, Net Payout, Status

- [ ] **Step 2:** Admin payable table — columns: Agent, Bookings, Gross, Deductions, Net Payable, Action (Record Payout)

- [ ] **Step 3:** Commit.

---

### Task 10: Claim dialog + page assembly

**Files:**
- `apps/admin/src/app/commission/_components/claim-dialog.tsx` (create)
- `apps/admin/src/app/commission/page.tsx` (rewrite)

- [ ] **Step 1:** Claim dialog — shows breakdown (gross, tax, tech fee, split, net), confirm button calls `useClaimCommission()`.

- [ ] **Step 2:** Page assembly — uses `useUser()` to determine agent vs admin view. Renders stats + appropriate tables + claim button.

- [ ] **Step 3:** Typecheck both apps.

- [ ] **Step 4:** Commit and push.

---

## Summary

| Task | What | Chunk |
|------|------|-------|
| 1 | Fix getCommissionDue formula + departure filter | API |
| 2 | Auto-calculate platform fee | API |
| 3 | Auto-create trip collaborator | API |
| 4 | Default splitValue = 60 | API |
| 5 | RBAC scoping + agent claim endpoint | API |
| 6 | Export commission shared types | Types |
| 7 | Commission React Query hooks | Hooks |
| 8 | Commission stats cards | UI |
| 9 | Commission tables (agent + admin) | UI |
| 10 | Claim dialog + page assembly | UI |

**Estimated: 10 tasks across 3 chunks**

**Key formula fix:**
```sql
-- Before (wrong — no deductions, treats commission_percentage as total split):
ROUND(received_cents * tc.commission_percentage / 100)

-- After (correct — deduct tax + tech fee, apply agent split rate, then collaborator share):
-- Step 1: distributable = received - tax - platform_fee
-- Step 2: agent_portion = distributable × agent_split_rate / 100   (e.g. 60%)
-- Step 3: individual_payout = agent_portion × collaborator_percentage / 100  (e.g. 70% of agent portion)
-- Agency keeps: distributable - agent_portion
```
