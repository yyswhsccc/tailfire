-- =============================================================================
-- Tagging System Overhaul
--
-- Makes tags multi-tenant and type-aware:
-- - Adds agency_id, type, created_by to tags table
-- - Backfills existing tags as 'system' type
-- - Handles case-insensitive name collisions
-- - Creates calendar_event_tags and email_log_tags junction tables
-- - Enables RLS on all tag-related tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1a. Add columns to tags table
-- ---------------------------------------------------------------------------

ALTER TABLE tags ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS type VARCHAR(10) DEFAULT 'system' CHECK (type IN ('system', 'agent'));
ALTER TABLE tags ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_tags_agency ON tags(agency_id);
CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type);

-- ---------------------------------------------------------------------------
-- 1b. Backfill existing tags
-- ---------------------------------------------------------------------------

-- Safety check: abort if multiple agencies exist (backfill assumes single agency)
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM agencies) > 1 THEN
    RAISE EXCEPTION 'Multi-agency backfill not supported. Found % agencies — manual tag assignment required.', (SELECT COUNT(*) FROM agencies);
  END IF;
END $$;

-- All existing tags become system tags owned by the (single) agency
UPDATE tags SET agency_id = (SELECT id FROM agencies LIMIT 1), type = 'system'
WHERE agency_id IS NULL;

-- Handle case-insensitive collisions: keep the tag with most usage, delete duplicates
-- First, reassign junction references from duplicates to the keeper
WITH ranked AS (
  SELECT id, LOWER(name) AS lower_name, agency_id,
    ROW_NUMBER() OVER (
      PARTITION BY agency_id, LOWER(name)
      ORDER BY (
        SELECT COUNT(*) FROM trip_tags WHERE tag_id = tags.id
      ) + (
        SELECT COUNT(*) FROM contact_tags WHERE tag_id = tags.id
      ) DESC, created_at ASC
    ) AS rn
  FROM tags
),
keepers AS (
  SELECT lower_name, agency_id, id AS keeper_id
  FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.keeper_id
  FROM ranked r
  JOIN keepers k ON r.lower_name = k.lower_name AND r.agency_id = k.agency_id
  WHERE r.rn > 1
)
-- Reassign trip_tags from duplicate tags to the keeper
UPDATE trip_tags SET tag_id = d.keeper_id
FROM dupes d WHERE trip_tags.tag_id = d.dupe_id
AND NOT EXISTS (
  SELECT 1 FROM trip_tags t2 WHERE t2.trip_id = trip_tags.trip_id AND t2.tag_id = d.keeper_id
);

-- Remove orphaned trip_tags that would cause PK conflicts (already have keeper)
WITH ranked AS (
  SELECT id, LOWER(name) AS lower_name, agency_id,
    ROW_NUMBER() OVER (
      PARTITION BY agency_id, LOWER(name)
      ORDER BY (
        SELECT COUNT(*) FROM trip_tags WHERE tag_id = tags.id
      ) + (
        SELECT COUNT(*) FROM contact_tags WHERE tag_id = tags.id
      ) DESC, created_at ASC
    ) AS rn
  FROM tags
),
dupes AS (
  SELECT id AS dupe_id FROM ranked WHERE rn > 1
)
DELETE FROM trip_tags WHERE tag_id IN (SELECT dupe_id FROM dupes);

-- Same for contact_tags
WITH ranked AS (
  SELECT id, LOWER(name) AS lower_name, agency_id,
    ROW_NUMBER() OVER (
      PARTITION BY agency_id, LOWER(name)
      ORDER BY (
        SELECT COUNT(*) FROM trip_tags WHERE tag_id = tags.id
      ) + (
        SELECT COUNT(*) FROM contact_tags WHERE tag_id = tags.id
      ) DESC, created_at ASC
    ) AS rn
  FROM tags
),
keepers AS (
  SELECT lower_name, agency_id, id AS keeper_id
  FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.keeper_id
  FROM ranked r
  JOIN keepers k ON r.lower_name = k.lower_name AND r.agency_id = k.agency_id
  WHERE r.rn > 1
)
UPDATE contact_tags SET tag_id = d.keeper_id
FROM dupes d WHERE contact_tags.tag_id = d.dupe_id
AND NOT EXISTS (
  SELECT 1 FROM contact_tags c2 WHERE c2.contact_id = contact_tags.contact_id AND c2.tag_id = d.keeper_id
);

WITH ranked AS (
  SELECT id, LOWER(name) AS lower_name, agency_id,
    ROW_NUMBER() OVER (
      PARTITION BY agency_id, LOWER(name)
      ORDER BY (
        SELECT COUNT(*) FROM trip_tags WHERE tag_id = tags.id
      ) + (
        SELECT COUNT(*) FROM contact_tags WHERE tag_id = tags.id
      ) DESC, created_at ASC
    ) AS rn
  FROM tags
),
dupes AS (
  SELECT id AS dupe_id FROM ranked WHERE rn > 1
)
DELETE FROM contact_tags WHERE tag_id IN (SELECT dupe_id FROM dupes);

-- Same for task_tags
WITH ranked AS (
  SELECT id, LOWER(name) AS lower_name, agency_id,
    ROW_NUMBER() OVER (
      PARTITION BY agency_id, LOWER(name)
      ORDER BY (
        SELECT COUNT(*) FROM trip_tags WHERE tag_id = tags.id
      ) + (
        SELECT COUNT(*) FROM contact_tags WHERE tag_id = tags.id
      ) DESC, created_at ASC
    ) AS rn
  FROM tags
),
keepers AS (
  SELECT lower_name, agency_id, id AS keeper_id
  FROM ranked WHERE rn = 1
),
dupes AS (
  SELECT r.id AS dupe_id, k.keeper_id
  FROM ranked r
  JOIN keepers k ON r.lower_name = k.lower_name AND r.agency_id = k.agency_id
  WHERE r.rn > 1
)
UPDATE task_tags SET tag_id = d.keeper_id
FROM dupes d WHERE task_tags.tag_id = d.dupe_id
AND NOT EXISTS (
  SELECT 1 FROM task_tags t2 WHERE t2.task_id = task_tags.task_id AND t2.tag_id = d.keeper_id
);

WITH ranked AS (
  SELECT id, LOWER(name) AS lower_name, agency_id,
    ROW_NUMBER() OVER (
      PARTITION BY agency_id, LOWER(name)
      ORDER BY (
        SELECT COUNT(*) FROM trip_tags WHERE tag_id = tags.id
      ) + (
        SELECT COUNT(*) FROM contact_tags WHERE tag_id = tags.id
      ) DESC, created_at ASC
    ) AS rn
  FROM tags
),
dupes AS (
  SELECT id AS dupe_id FROM ranked WHERE rn > 1
)
DELETE FROM task_tags WHERE tag_id IN (SELECT dupe_id FROM dupes);

-- Now delete the duplicate tags themselves
WITH ranked AS (
  SELECT id, LOWER(name) AS lower_name, agency_id,
    ROW_NUMBER() OVER (
      PARTITION BY agency_id, LOWER(name)
      ORDER BY (
        SELECT COUNT(*) FROM trip_tags WHERE tag_id = tags.id
      ) + (
        SELECT COUNT(*) FROM contact_tags WHERE tag_id = tags.id
      ) DESC, created_at ASC
    ) AS rn
  FROM tags
)
DELETE FROM tags WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Make agency_id NOT NULL after backfill
ALTER TABLE tags ALTER COLUMN agency_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 1c. Replace global unique constraint with scoped indexes
-- ---------------------------------------------------------------------------

-- Drop old global unique constraint
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_unique;
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key;
DROP INDEX IF EXISTS tags_name_unique;
DROP INDEX IF EXISTS tags_name_key;

-- System tags: unique per agency (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_agency_name ON tags(agency_id, LOWER(name)) WHERE type = 'system';
-- Agent tags: unique per agency + creator (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_agent_name ON tags(agency_id, created_by, LOWER(name)) WHERE type = 'agent';

-- ---------------------------------------------------------------------------
-- 1d. New junction tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS calendar_event_tags (
  calendar_event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT calendar_event_tags_pk PRIMARY KEY(calendar_event_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_event_tags_event ON calendar_event_tags(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event_tags_tag ON calendar_event_tags(tag_id);

CREATE TABLE IF NOT EXISTS email_log_tags (
  email_log_id UUID NOT NULL REFERENCES email_logs(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT email_log_tags_pk PRIMARY KEY(email_log_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_email_log_tags_email ON email_log_tags(email_log_id);
CREATE INDEX IF NOT EXISTS idx_email_log_tags_tag ON email_log_tags(tag_id);

-- ---------------------------------------------------------------------------
-- 1e. RLS policies (defense-in-depth)
-- ---------------------------------------------------------------------------

-- tags: agency + type visibility
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tags_service_role ON tags FOR ALL TO service_role USING (true);
CREATE POLICY tags_agency_isolation ON tags FOR ALL TO authenticated
  USING (
    agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
    AND (type = 'system' OR (type = 'agent' AND created_by = auth.uid()))
  );

-- trip_tags: via parent entity
ALTER TABLE trip_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY trip_tags_service_role ON trip_tags FOR ALL TO service_role USING (true);
CREATE POLICY trip_tags_via_trip ON trip_tags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM trips WHERE trips.id = trip_tags.trip_id
    AND trips.agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())));

-- contact_tags: via parent entity
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_tags_service_role ON contact_tags FOR ALL TO service_role USING (true);
CREATE POLICY contact_tags_via_contact ON contact_tags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_tags.contact_id
    AND contacts.agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())));

-- calendar_event_tags: via parent entity
ALTER TABLE calendar_event_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_event_tags_service_role ON calendar_event_tags FOR ALL TO service_role USING (true);
CREATE POLICY calendar_event_tags_via_event ON calendar_event_tags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM calendar_events WHERE calendar_events.id = calendar_event_tags.calendar_event_id
    AND calendar_events.agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())));

-- email_log_tags: via parent entity
ALTER TABLE email_log_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_log_tags_service_role ON email_log_tags FOR ALL TO service_role USING (true);
CREATE POLICY email_log_tags_via_email ON email_log_tags FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM email_logs WHERE email_logs.id = email_log_tags.email_log_id
    AND email_logs.agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())));

-- GRANTs
GRANT ALL ON tags, trip_tags, contact_tags, calendar_event_tags, email_log_tags TO service_role;
GRANT ALL ON tags, trip_tags, contact_tags, calendar_event_tags, email_log_tags TO authenticated;

-- ---------------------------------------------------------------------------
-- 1f. Re-sync legacy text[] -> junction tables
-- ---------------------------------------------------------------------------

-- Re-populate trip_tags from trips.tags for any missed entries
INSERT INTO trip_tags (trip_id, tag_id, created_at)
SELECT DISTINCT t.id, tg.id, NOW()
FROM trips t CROSS JOIN LATERAL UNNEST(t.tags) AS tag_name
INNER JOIN tags tg ON LOWER(TRIM(tag_name)) = LOWER(tg.name) AND tg.agency_id = t.agency_id
WHERE t.tags IS NOT NULL AND array_length(t.tags, 1) > 0
ON CONFLICT DO NOTHING;

-- Same for contact_tags
INSERT INTO contact_tags (contact_id, tag_id, created_at)
SELECT DISTINCT c.id, tg.id, NOW()
FROM contacts c CROSS JOIN LATERAL UNNEST(c.tags) AS tag_name
INNER JOIN tags tg ON LOWER(TRIM(tag_name)) = LOWER(tg.name) AND tg.agency_id = c.agency_id
WHERE c.tags IS NOT NULL AND array_length(c.tags, 1) > 0
ON CONFLICT DO NOTHING;
