-- Add phase column to tasks table for trip lifecycle grouping
-- Values: pre_booking, pre_departure, during_travel, post_return
-- Null means auto-infer from dueDate vs trip dates
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phase varchar(20);
