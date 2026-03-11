-- Add calendar display mode to trips
-- Controls how a trip appears on the calendar: as a spanning bar ('trip') or individual activities ('activities')
ALTER TABLE trips ADD COLUMN calendar_display_mode varchar(20) NOT NULL DEFAULT 'trip'
  CONSTRAINT trips_calendar_display_mode_check CHECK (calendar_display_mode IN ('trip', 'activities'));

-- Add calendar visibility toggle to activities
-- When trip is in 'activities' mode, individual activities can be shown/hidden on the calendar
ALTER TABLE itinerary_activities ADD COLUMN is_visible_in_calendar boolean NOT NULL DEFAULT true;
