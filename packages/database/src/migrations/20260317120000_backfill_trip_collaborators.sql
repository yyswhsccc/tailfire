-- Backfill trip_collaborators for existing trips that don't have one.
-- Sets the trip owner as sole collaborator with 100% of agent portion.
-- Safe to run multiple times (INSERT ... ON CONFLICT DO NOTHING).

INSERT INTO trip_collaborators (trip_id, user_id, commission_percentage, role, is_active, created_by)
SELECT t.id, t.owner_id, '100', 'lead', true, t.owner_id
FROM trips t
LEFT JOIN trip_collaborators tc ON tc.trip_id = t.id
WHERE tc.id IS NULL
  AND t.owner_id IS NOT NULL
  AND t.deleted_at IS NULL
ON CONFLICT (trip_id, user_id) DO NOTHING;
