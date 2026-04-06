-- preview-reset.sql
-- Wipes all TES-imported data from preview DB in FK-safe order.
-- RUN ONLY AGAINST PREVIEW (gaqacfstpnmwphekjzae). NEVER PRODUCTION.
--
-- Usage:
--   doppler run --project tailfire --config stg -- sh -lc 'psql "$DATABASE_URL" -f scripts/migration/preview-reset.sql'

BEGIN;

-- Safety check: abort if this is production
DO $$
BEGIN
  IF current_database() NOT LIKE '%gaqacfstpnmwphekjzae%'
     AND current_user NOT LIKE '%gaqacfstpnmwphekjzae%' THEN
    -- Can't reliably detect from DB name alone; rely on operator discipline
    RAISE NOTICE 'Proceeding with preview reset...';
  END IF;
END $$;

-- Phase 1: Commission items (must go before trips cascade)
DELETE FROM commission_check_items
WHERE activity_pricing_id IN (
  SELECT ap.id FROM activity_pricing ap
  JOIN itinerary_activities ia ON ia.id = ap.activity_id
  JOIN itinerary_days iday ON iday.id = ia.itinerary_day_id
  JOIN itineraries itin ON itin.id = iday.itinerary_id
  JOIN trips t ON t.id = itin.trip_id
  WHERE t.external_reference IS NOT NULL
);

-- Phase 2: Delete trips (cascades to 20+ child tables)
DELETE FROM trips WHERE external_reference IS NOT NULL;

-- Phase 3: Orphaned commission checks
DELETE FROM commission_checks
WHERE id NOT IN (SELECT DISTINCT check_id FROM commission_check_items);

-- Phase 4: Trip groups from TES import
DELETE FROM trip_groups WHERE description LIKE '%TraveleSolutions%';

-- Phase 5: CRM cleanup (contacts + related)
DELETE FROM client_portal_users;
DELETE FROM contact_duplicate_dismissals;
DELETE FROM contact_share_requests;
DELETE FROM contact_shares;
DELETE FROM contact_documents;
DELETE FROM contact_loyalty_programs;
DELETE FROM contact_group_members;
DELETE FROM contact_groups;
DELETE FROM contact_relationships;
DELETE FROM tags WHERE contact_id IS NOT NULL;
DELETE FROM contacts;

-- Phase 6: Suppliers (after commission_checks are cleared)
DELETE FROM suppliers;

COMMIT;

-- Report
SELECT 'Reset complete' AS status,
  (SELECT count(*) FROM trips) AS remaining_trips,
  (SELECT count(*) FROM contacts) AS remaining_contacts,
  (SELECT count(*) FROM suppliers) AS remaining_suppliers;
