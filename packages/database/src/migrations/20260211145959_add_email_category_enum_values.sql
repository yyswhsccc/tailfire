-- ==============================================================================
-- Migration: Add Email Category Enum Values
-- ==============================================================================
-- Adds new category values to email_category enum for automation templates.
-- Must run BEFORE the email templates seed migration.
-- ==============================================================================

-- Add 'payment' category for payment reminder templates
ALTER TYPE email_category ADD VALUE IF NOT EXISTS 'payment';

-- Add 'client_care' category for birthday and follow-up templates
ALTER TYPE email_category ADD VALUE IF NOT EXISTS 'client_care';
