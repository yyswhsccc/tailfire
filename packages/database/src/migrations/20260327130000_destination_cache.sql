-- Destination Cache
-- Caches enrichment data from external sources (SerpAPI/TripAdvisor, Amadeus
-- Activities, Google Places) per destination × source × locale.

-- ============================================================================
-- TABLE: destination_cache
-- ============================================================================

CREATE TABLE IF NOT EXISTS "destination_cache" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK → destinations (cascade delete so orphan cache rows are cleaned up)
  "destination_id"        uuid NOT NULL REFERENCES "destinations"("id") ON DELETE CASCADE,

  -- Which external API this cache row represents
  "source"                text NOT NULL CHECK (
    "source" IN ('tripadvisor','amadeus_activities','google_places')
  ),

  -- BCP-47 locale; most sources return English only
  "locale"                text NOT NULL DEFAULT 'en',

  -- Cache entry lifecycle status
  "status"                text NOT NULL DEFAULT 'fresh' CHECK (
    "status" IN ('fresh','stale','refreshing','failed','disabled')
  ),

  -- Stable cache key, e.g. "tripadvisor:<destination_id>:en"
  "cache_key"             text NOT NULL,

  -- Raw API response (verbatim JSON for debugging / replay)
  "raw_payload"           jsonb,

  -- Normalized, application-level payload (what the app reads)
  "normalized_payload"    jsonb,

  -- AI-generated or human-edited Markdown summary
  "summary_md"            text,

  -- URLs fetched during this enrichment pass
  "source_urls"           jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Timing
  "fetched_at"            timestamp with time zone,
  "last_success_at"       timestamp with time zone,
  "refresh_after_at"      timestamp with time zone,
  "expires_at"            timestamp with time zone,

  -- HTTP / error tracking
  "last_http_status"      integer,
  "last_error_code"       text,
  "last_error_message"    text,
  "consecutive_failures"  integer NOT NULL DEFAULT 0,

  -- Operational counters
  "fetch_count"           integer NOT NULL DEFAULT 0,

  -- SHA-256 of normalized_payload for change detection
  "payload_hash"          text,

  -- Schema version for forward-compatible migrations of normalized_payload
  "version"               integer NOT NULL DEFAULT 1,

  -- Distributed lock for concurrent fetch workers
  "lock_token"            uuid,
  "lock_expires_at"       timestamp with time zone,

  -- API cost accounting (credits / units consumed per fetch)
  "cost_units"            numeric(10,4) NOT NULL DEFAULT 0,

  -- Audit
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),

  -- One row per (destination, source, locale) triple
  CONSTRAINT "destination_cache_destination_source_locale_key"
    UNIQUE ("destination_id", "source", "locale")
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS "destination_cache_destination_idx"
  ON "destination_cache"("destination_id");

CREATE INDEX IF NOT EXISTS "destination_cache_status_idx"
  ON "destination_cache"("status");

CREATE INDEX IF NOT EXISTS "destination_cache_refresh_after_idx"
  ON "destination_cache"("refresh_after_at");

-- ============================================================================
-- UPDATED-AT TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS destination_cache_updated_at ON "destination_cache";
CREATE TRIGGER destination_cache_updated_at
  BEFORE UPDATE ON "destination_cache"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
