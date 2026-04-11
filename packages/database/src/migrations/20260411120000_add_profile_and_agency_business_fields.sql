-- Add agent identity fields to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS designations VARCHAR(255);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS job_title VARCHAR(100) DEFAULT 'Travel Advisor';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone_extension VARCHAR(20);

-- Add business details to agency_settings
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS company_phone VARCHAR(50);
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS company_toll_free VARCHAR(50);
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS company_email VARCHAR(255);
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS company_address TEXT;
ALTER TABLE agency_settings ADD COLUMN IF NOT EXISTS tico_registration VARCHAR(50);

-- Seed Phoenix Voyages business details
UPDATE agency_settings SET
  company_phone = '(855) 383-5771',
  company_toll_free = '(855) 383-5771',
  company_email = 'info@phoenixvoyages.ca',
  company_address = '600 Du Golf Rd, Hammond ON K0A2A0',
  tico_registration = '50028032',
  updated_at = NOW()
WHERE agency_id = '00000000-0000-0000-0000-000000000001';
