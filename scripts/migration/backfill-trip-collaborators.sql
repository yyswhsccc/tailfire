-- ============================================================================
-- One-off TF-Demo backfill: re-link trip_collaborators based on (XX) initials
--
-- Context: TF-Demo was imported with the OLD import script that points all
-- collaborators at the admin fixture (aaaa0001). Production cutover will use
-- the NEW import script which does this correctly from the start. This file
-- exists only to fix TF-Demo so we can smoke-test the IC payouts flow against
-- realistic data without doing a full re-import.
--
-- Idempotent: re-running has no effect after the first successful run.
-- Safe: deactivates the admin fixture, upserts the real agent, only on trips
-- whose name matches the (XX) pattern. Trips without initials remain on admin.
-- ============================================================================

BEGIN;

-- Mapping table built from agent-initials-mapping.json (TF-Demo UUIDs)
WITH initials_map(initials, user_id) AS (VALUES
  ('JL', '3a6d8336-0b18-49b4-862e-1b27bdbea287'::uuid),  -- Julie Lanouette
  ('SL', 'b835599e-bbb4-468a-8b28-a66a907ed2d1'::uuid),  -- Sebastien Larente
  ('MG', '37c3358c-147c-44ed-a048-80c2dcb15960'::uuid),  -- Mireille Guertin
  ('AG', 'aa41c9b1-d6ff-456d-b9ca-2b08036893ab'::uuid),  -- Andre Guertin
  ('DB', 'cd0d6977-162b-4869-8805-d637c69f540c'::uuid),  -- Denise Boulianne
  ('DH', '4137dae3-44c4-4fa3-a4d0-3ebc3851d95b'::uuid),  -- Denise Hoffman
  ('RS', 'f23e6893-3eef-4a62-81bb-d1b8fdbaf7a9'::uuid),  -- Randal Storey
  ('AC', 'badacadd-fc55-4bce-9b5f-b6bd4a33699e'::uuid),  -- Audrey Cameron
  ('HB', '793620ee-2767-44b3-b729-c1e4696153ef'::uuid),  -- Helen Babanikos
  ('PL', '825bea31-c4f7-4fc5-bb1f-d15d60f4782e'::uuid),  -- Pascal Lafrance
  ('MP', 'e3f64923-d80e-4f67-8544-7e63ce5ae8b6'::uuid),  -- Marc Plante
  ('CB', 'd331966b-905e-41a5-9387-5fd2d32c7634'::uuid),  -- Chantal Boulianne
  ('MF', '8b8327aa-cf7a-41d6-bcbf-df5cb5f9f4ca'::uuid),  -- Melanie Filion
  ('HD', '5d84c3b0-e059-40a5-bc89-bfbae90ff8db'::uuid),  -- Helen Ducharme
  ('CF', '01f19f44-a314-498b-8e86-219b6ab7681f'::uuid),  -- Catherine Fournelle
  ('AR', '2af7f61e-27e8-40be-9d87-9f0523842183'::uuid)   -- Andy Rajhathy
),
mapped_trips AS (
  SELECT
    t.id AS trip_id,
    im.user_id
  FROM trips t
  JOIN initials_map im
    ON im.initials = (regexp_match(t.name, '\(([A-Z]{2,4})\)'))[1]
),

-- Step 1: Deactivate the admin fixture collaborator on mapped trips
deactivated AS (
  UPDATE trip_collaborators tc
  SET is_active = false
  FROM mapped_trips mt
  WHERE tc.trip_id = mt.trip_id
    AND tc.user_id = 'aaaa0001-0000-0000-0000-000000000001'
    AND tc.is_active = true
  RETURNING tc.id
),

-- Step 2: Upsert the real agent at 100% commission
upserted AS (
  INSERT INTO trip_collaborators (trip_id, user_id, commission_percentage, role, is_active)
  SELECT trip_id, user_id, 100.00, 'agent', true FROM mapped_trips
  ON CONFLICT (trip_id, user_id) DO UPDATE
    SET is_active = true,
        commission_percentage = 100.00
  RETURNING trip_collaborators.id
)

SELECT
  (SELECT count(*) FROM deactivated) AS admin_collabs_deactivated,
  (SELECT count(*) FROM upserted) AS real_agent_collabs_upserted;

COMMIT;

-- Verification summary
SELECT
  COALESCE(up.email, '<missing>') AS email,
  count(*) AS active_trips
FROM trip_collaborators tc
LEFT JOIN user_profiles up ON up.id = tc.user_id
WHERE tc.is_active = true
GROUP BY up.email
ORDER BY active_trips DESC
LIMIT 20;
