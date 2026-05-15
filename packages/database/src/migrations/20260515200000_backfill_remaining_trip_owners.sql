-- ============================================================================
-- Backfill trip.owner_id from trip_collaborators — direct SQL (#30 / W1)
-- ============================================================================
--
-- The script-based version of this backfill (scripts/migration/backfill-trip-
-- owners.sh) calls PATCH /trips/:id/owner per trip and triggers an
-- assignment-notification email for every call. After 286 trips were
-- remapped that way (sending 286 emails distributed across 15 agents), the
-- script was halted on 2026-05-15. The remaining 122 trips are completed
-- here via direct SQL that mirrors reassignTripOwner's cascade WITHOUT
-- firing any application events or notification emails.
--
-- Cascade mirrored from apps/api/src/trips/trips.service.ts:922-1080:
--   1. trips.owner_id     ← new owner
--   2. trip_collaborators ← old lead deactivated, new owner upserted as lead (100%)
--   3. contacts.owner_id  ← propagated when contact has no owner OR owner inactive
--      (the conservative "skip when current owner is active" policy is preserved)
--
-- Policy (user-approved 2026-05-15): only remap trips that have a real-agent
-- collaborator. Trips with admin-fixture as the sole collaborator stay owned
-- by admin-fixture and will be manually re-assigned later.
--
-- Idempotent: WHERE owner_id = admin-fixture ensures no-op on already-remapped
-- trips. Re-running on prod (where no admin-fixture trips exist) is a no-op.
--
-- See docs/runbooks/tes-cutover-backfill-plan.md (P5.A item 4 / #30)
-- ============================================================================

DO $$
DECLARE
  v_admin_fixture uuid := 'aaaa0001-0000-0000-0000-000000000001';
BEGIN

-- Resolve target owner per trip (same rule as the script):
--   role IN ('lead','owner') wins, else earliest created_at; tie-broken
--   non-admin only. Active collaborators only.
CREATE TEMP TABLE _owner_remap ON COMMIT DROP AS
WITH candidates AS (
  SELECT
    t.id AS trip_id,
    tc.user_id AS new_owner_id,
    ROW_NUMBER() OVER (
      PARTITION BY t.id
      ORDER BY
        CASE WHEN tc.role IN ('lead','owner') THEN 0 ELSE 1 END,
        tc.created_at ASC
    ) AS rn
  FROM trips t
  JOIN trip_collaborators tc ON tc.trip_id = t.id
  WHERE t.owner_id = v_admin_fixture
    AND tc.user_id <> v_admin_fixture
    AND tc.is_active = true
)
SELECT trip_id, new_owner_id FROM candidates WHERE rn = 1;

-- Step 1: update trips.owner_id
UPDATE trips t
SET owner_id = r.new_owner_id,
    updated_at = NOW()
FROM _owner_remap r
WHERE t.id = r.trip_id;

-- Step 2a: deactivate old admin-fixture lead role on these trips
UPDATE trip_collaborators tc
SET is_active = false
FROM _owner_remap r
WHERE tc.trip_id = r.trip_id
  AND tc.user_id = v_admin_fixture
  AND tc.role = 'lead';

-- Step 2b: upsert new owner as lead collaborator at 100% commission split
-- (trip_collaborators has no updated_at column; created_at uses default now())
INSERT INTO trip_collaborators (trip_id, user_id, commission_percentage, role, is_active, created_by)
SELECT r.trip_id, r.new_owner_id, 100, 'lead', true, r.new_owner_id
FROM _owner_remap r
ON CONFLICT (trip_id, user_id) DO UPDATE
  SET role = 'lead',
      is_active = true,
      commission_percentage = 100;

-- Step 3: cascade ownership to traveler + primary contacts where appropriate
--   - assign if contact has no current owner
--   - assign if current owner is inactive (status <> 'active' OR is_active = false)
--   - skip otherwise (preserve existing real-agent assignments)
WITH affected_contacts AS (
  SELECT DISTINCT tt.contact_id, r.new_owner_id
  FROM _owner_remap r
  JOIN trip_travelers tt ON tt.trip_id = r.trip_id
  WHERE tt.contact_id IS NOT NULL
  UNION
  SELECT DISTINCT t.primary_contact_id, r.new_owner_id
  FROM _owner_remap r
  JOIN trips t ON t.id = r.trip_id
  WHERE t.primary_contact_id IS NOT NULL
)
UPDATE contacts c
SET owner_id = ac.new_owner_id,
    updated_at = NOW()
FROM affected_contacts ac
WHERE c.id = ac.contact_id
  AND c.owner_id IS DISTINCT FROM ac.new_owner_id
  AND (
    c.owner_id IS NULL
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = c.owner_id
        AND (up.status <> 'active' OR up.is_active = false)
    )
  );

END $$;
