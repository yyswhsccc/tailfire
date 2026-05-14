-- #302 — generic per-activity booking/referral URL
--
-- The proposal preview / shared-trip view shows activity cards to clients.
-- This column lets agents attach a "Book this activity →" CTA per activity
-- pointing at an external booking page or affiliate referral URL. Optional;
-- when null the CTA is not rendered.
--
-- Lives on itinerary_activities (top-level) so any activity type — tour,
-- lodging, transportation, etc. — can carry one.
ALTER TABLE itinerary_activities
  ADD COLUMN IF NOT EXISTS referral_url text;

COMMENT ON COLUMN itinerary_activities.referral_url IS
  'Optional external URL the client can click from the shared-trip view to book the activity directly (#302). text rather than varchar(N) because referral / affiliate URLs are routinely long.';
