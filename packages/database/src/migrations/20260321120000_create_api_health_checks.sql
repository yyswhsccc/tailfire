-- API Health Check results table
-- Stores periodic health check results for all external API providers.
-- Retention: 7 days, cleaned up by daily BullMQ job.

CREATE TABLE IF NOT EXISTS api_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  success BOOLEAN NOT NULL,
  response_ms INTEGER,
  error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ahc_provider_time ON api_health_checks(provider, checked_at DESC);
