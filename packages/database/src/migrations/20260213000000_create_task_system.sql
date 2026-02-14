-- ============================================================================
-- Migration: Create Task System
-- Description: Adds task management tables for calendar and task tracking
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Task status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM (
      'pending',
      'in_progress',
      'completed',
      'cancelled'
    );
  END IF;
END $$;

-- Task priority enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM (
      'low',
      'medium',
      'high',
      'urgent'
    );
  END IF;
END $$;

-- Task type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
    CREATE TYPE task_type AS ENUM (
      'manual',
      'automatic',
      'reminder',
      'milestone'
    );
  END IF;
END $$;

-- ============================================================================
-- TABLE: tasks
-- Core tasks table for task management and calendar integration
-- ============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Core fields
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority NOT NULL DEFAULT 'medium',
  task_type task_type NOT NULL DEFAULT 'manual',

  -- Dates (DATE for all-day, TIMESTAMPTZ for specific times)
  due_date DATE,
  due_at TIMESTAMPTZ,  -- For time-specific tasks (week/day views)
  start_date DATE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,

  -- Relationships
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  activity_id UUID REFERENCES itinerary_activities(id) ON DELETE SET NULL,

  -- Assignment (explicit FKs for type safety)
  assignee_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  assignee_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assignee_name VARCHAR(255), -- Denormalized for display

  -- Hierarchy (for subtasks)
  parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,

  -- Calendar display options
  is_visible_in_calendar BOOLEAN DEFAULT true,
  color_override VARCHAR(7), -- Hex color (e.g., #3b82f6)

  -- Recurring config (JSONB for RRULE-compatible format)
  -- Example: {"frequency": "weekly", "interval": 1, "daysOfWeek": [1,3,5], "endDate": "2026-12-31"}
  recurring_config JSONB,

  -- Notification config
  -- Example: {"reminders": [{"value": 1, "unit": "day"}, {"value": 1, "unit": "hour"}]}
  notification_config JSONB,

  -- Ownership (for RBAC filtering)
  owner_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,

  -- Audit fields
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  is_deleted BOOLEAN DEFAULT false NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES: tasks
-- ============================================================================

-- Agency isolation
CREATE INDEX IF NOT EXISTS idx_tasks_agency ON tasks(agency_id);

-- Status filtering (for active tasks)
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status) WHERE is_deleted = false;

-- Due date queries (calendar month/list views)
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE is_deleted = false;

-- Due at queries (calendar week/day views)
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at) WHERE is_deleted = false;

-- Trip relationship
CREATE INDEX IF NOT EXISTS idx_tasks_trip ON tasks(trip_id) WHERE trip_id IS NOT NULL;

-- Contact relationship
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id) WHERE contact_id IS NOT NULL;

-- Activity relationship
CREATE INDEX IF NOT EXISTS idx_tasks_activity ON tasks(activity_id) WHERE activity_id IS NOT NULL;

-- Assignee (user) for filtering
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_user ON tasks(assignee_user_id) WHERE assignee_user_id IS NOT NULL;

-- Owner for RBAC filtering
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id) WHERE owner_id IS NOT NULL;

-- Composite index for calendar queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_tasks_calendar ON tasks(agency_id, due_date, is_visible_in_calendar)
  WHERE is_deleted = false AND is_visible_in_calendar = true;

-- Parent task hierarchy
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;

-- ============================================================================
-- TABLE: task_tags
-- Join table linking tasks to the existing tags system
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT unique_task_tag UNIQUE(task_id, tag_id)
);

-- Indexes for task_tags
CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag ON task_tags(tag_id);

-- ============================================================================
-- TABLE: task_comments
-- Comments and discussion threads on tasks
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false NOT NULL,
  mentions UUID[], -- Array of user IDs mentioned in the comment
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for task_comments
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user ON task_comments(user_id);

-- ============================================================================
-- TABLE: task_templates
-- Reusable task templates for common workflows
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_type VARCHAR(50) NOT NULL, -- 'trip', 'activity', 'contact', 'general'
  category VARCHAR(100),

  -- Default values for new tasks created from this template
  -- Example: {"priority": "high", "status": "pending", "recurring_config": {...}}
  default_values JSONB NOT NULL DEFAULT '{}',

  -- Subtask templates (array of task template snippets)
  -- Example: [{"title": "Confirm booking", "priority": "medium"}, ...]
  subtasks JSONB,

  is_active BOOLEAN DEFAULT true NOT NULL,
  is_system BOOLEAN DEFAULT false NOT NULL, -- System templates available to all agencies
  usage_count INTEGER DEFAULT 0 NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for task_templates
CREATE INDEX IF NOT EXISTS idx_task_templates_agency ON task_templates(agency_id);
CREATE INDEX IF NOT EXISTS idx_task_templates_type ON task_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_task_templates_active ON task_templates(is_active) WHERE is_active = true;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

-- Tasks: Agency isolation policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tasks' AND policyname = 'tasks_agency_isolation'
  ) THEN
    CREATE POLICY tasks_agency_isolation ON tasks
      FOR ALL
      TO authenticated
      USING (
        agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- Task tags: Access through task relationship
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_tags' AND policyname = 'task_tags_via_task'
  ) THEN
    CREATE POLICY task_tags_via_task ON task_tags
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM tasks
          WHERE tasks.id = task_tags.task_id
            AND tasks.agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
        )
      );
  END IF;
END $$;

-- Task comments: Agency isolation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_comments' AND policyname = 'task_comments_agency_isolation'
  ) THEN
    CREATE POLICY task_comments_agency_isolation ON task_comments
      FOR ALL
      TO authenticated
      USING (
        agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
      );
  END IF;
END $$;

-- Task templates: Agency isolation + system templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_templates' AND policyname = 'task_templates_agency_or_system'
  ) THEN
    CREATE POLICY task_templates_agency_or_system ON task_templates
      FOR ALL
      TO authenticated
      USING (
        agency_id = (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
        OR is_system = true
      );
  END IF;
END $$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated at trigger for tasks
DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Updated at trigger for task_comments
DROP TRIGGER IF EXISTS task_comments_updated_at ON task_comments;
CREATE TRIGGER task_comments_updated_at
  BEFORE UPDATE ON task_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Updated at trigger for task_templates
DROP TRIGGER IF EXISTS task_templates_updated_at ON task_templates;
CREATE TRIGGER task_templates_updated_at
  BEFORE UPDATE ON task_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
