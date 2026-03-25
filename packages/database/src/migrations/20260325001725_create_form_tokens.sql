-- Create form_tokens table for token-based public forms (insurance waivers, intake forms)
CREATE TABLE IF NOT EXISTS form_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token varchar(64) UNIQUE NOT NULL,
  form_type varchar(50) NOT NULL,
  trip_id uuid REFERENCES trips(id) ON DELETE CASCADE,
  traveler_ids jsonb,
  agency_id uuid NOT NULL,
  context_data jsonb,
  expires_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_tokens_token ON form_tokens(token);
CREATE INDEX IF NOT EXISTS idx_form_tokens_trip ON form_tokens(trip_id);
