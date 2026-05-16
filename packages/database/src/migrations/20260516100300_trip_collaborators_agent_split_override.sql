-- PR-1 Commission Foundation: per-trip agent split override
--
-- Replaces the previous "splitValue from user_profiles.commission_settings"
-- as the per-trip override. NULL = use the agent's profile default.
--
-- Example: Joel's agent profile splits 60/40 by default, but he earns 100%
-- on his own travel — set agent_split_override = 100.00 on his trip_collaborators
-- row for that trip.

ALTER TABLE trip_collaborators
  ADD COLUMN IF NOT EXISTS agent_split_override numeric(5,2);

COMMENT ON COLUMN trip_collaborators.agent_split_override IS
  'Per-trip override for the agent''s share of distributable commission (%, e.g. 100.00). NULL = derive from user_profiles.commission_settings.splitValue. Admin-only.';
