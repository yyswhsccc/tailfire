-- Add last_seen_at column for online presence tracking
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
