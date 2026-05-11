-- ============================================================================
-- FX Rate Snapshots
--
-- Daily Bank of Canada exchange rates cached locally for T4A CAD-equivalent
-- calculation. One row per (rate_date, from_currency, to_currency).
-- Populated by FxRateService (weekday 16:30 ET cron + on-demand backfill).
-- ============================================================================

CREATE TABLE IF NOT EXISTS fx_rate_snapshots (
  rate_date     date NOT NULL,
  from_currency varchar(3) NOT NULL,
  to_currency   varchar(3) NOT NULL,
  rate          numeric(18,8) NOT NULL,
  source        varchar(40) NOT NULL DEFAULT 'bank_of_canada',
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rate_date, from_currency, to_currency)
);

-- Index for queries that filter by date alone
-- (e.g., "what rates do we have on date X?" or audit queries)
-- The PK already covers the full (date, from, to) lookup used by getRateOnDate.
CREATE INDEX IF NOT EXISTS idx_fx_rate_snapshots_date
  ON fx_rate_snapshots (rate_date);
