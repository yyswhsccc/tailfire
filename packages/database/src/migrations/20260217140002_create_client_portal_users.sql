-- Create client_portal_users table
-- Maps Supabase auth users to existing contacts for client portal access.

-- Enum for client portal user status
DO $$ BEGIN
  CREATE TYPE client_portal_status AS ENUM ('invited', 'active', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Grant enum usage to supabase_auth_admin (needed by JWT hook)
GRANT USAGE ON TYPE client_portal_status TO supabase_auth_admin;

CREATE TABLE IF NOT EXISTS client_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Supabase auth user (created at invite time via admin.createUser)
  supabase_user_id UUID NOT NULL UNIQUE,

  -- Agency scoping (for RLS)
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE RESTRICT,

  -- Link to existing contact record
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,

  -- Denormalized for quick lookup
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),

  -- Status
  status client_portal_status NOT NULL DEFAULT 'invited',

  -- Invite token security (SHA-256 hash, not plaintext)
  invite_token_hash VARCHAR(128),
  invite_expires_at TIMESTAMPTZ,
  invite_consumed_at TIMESTAMPTZ,

  -- Invite tracking
  invited_at TIMESTAMPTZ DEFAULT now(),
  invited_by UUID,  -- FK to user_profiles (the agent who invited)
  last_login_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_contact_agency UNIQUE (contact_id, agency_id)
);

-- Indexes
CREATE INDEX idx_client_portal_users_agency ON client_portal_users(agency_id);
CREATE INDEX idx_client_portal_users_contact ON client_portal_users(contact_id);
CREATE INDEX idx_client_portal_users_email ON client_portal_users(email);
CREATE INDEX idx_client_portal_users_status ON client_portal_users(status);
CREATE INDEX idx_client_portal_users_supabase ON client_portal_users(supabase_user_id);

-- Grant SELECT to supabase_auth_admin (needed by JWT hook to look up client users)
GRANT SELECT ON public.client_portal_users TO supabase_auth_admin;
