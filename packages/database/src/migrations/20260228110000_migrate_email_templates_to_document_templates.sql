-- ==============================================================================
-- Migration: Migrate email_templates data to document_templates
-- ==============================================================================
-- Copies all rows from email_templates into the new document_templates table.
-- Transforms {{var::fallback}} syntax to {{fallback var "fallback"}} for
-- Handlebars compatibility. Wraps body_html in a single-block structure.
-- Idempotent via ON CONFLICT DO NOTHING.
-- ==============================================================================

INSERT INTO document_templates (
  id,
  agency_id,
  slug,
  name,
  description,
  subject_template,
  email_html,
  text_template,
  variables,
  category,
  blocks_json,
  output_types,
  status,
  version,
  is_active,
  created_by,
  created_at,
  updated_at
)
SELECT
  et.id,
  et.agency_id,
  et.slug,
  et.name,
  et.description,

  -- Transform subject: {{var::fallback}} -> {{fallback var "fallback"}}
  regexp_replace(et.subject, '\{\{([^}:]+)::([^}]+)\}\}', '{{fallback \1 "\2"}}', 'g')
    AS subject_template,

  -- Transform body_html: {{var::fallback}} -> {{fallback var "fallback"}}
  regexp_replace(et.body_html, '\{\{([^}:]+)::([^}]+)\}\}', '{{fallback \1 "\2"}}', 'g')
    AS email_html,

  -- Transform body_text: {{var::fallback}} -> {{fallback var "fallback"}}
  regexp_replace(et.body_text, '\{\{([^}:]+)::([^}]+)\}\}', '{{fallback \1 "\2"}}', 'g')
    AS text_template,

  et.variables,

  -- Map email_category enum to document_templates category strings
  CASE et.category
    WHEN 'trip_order'   THEN 'trip_order'
    WHEN 'payment'      THEN 'payment'
    WHEN 'notification' THEN 'email'
    WHEN 'marketing'    THEN 'email'
    WHEN 'system'       THEN 'email'
    WHEN 'client_care'  THEN 'email'
    ELSE 'email'
  END AS category,

  -- Auto-generate blocks_json wrapping the transformed body_html
  jsonb_build_object(
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'id', 'migrated-body',
        'type', 'text',
        'permission', 'editable',
        'content', jsonb_build_object(
          'html', regexp_replace(et.body_html, '\{\{([^}:]+)::([^}]+)\}\}', '{{fallback \1 "\2"}}', 'g')
        )
      )
    )
  ) AS blocks_json,

  -- Default output types
  '{email}'::text[] AS output_types,

  -- Status: published for active templates, draft for inactive
  CASE WHEN et.is_active THEN 'published' ELSE 'draft' END AS status,

  -- Default version
  1 AS version,

  et.is_active,
  et.created_by,
  et.created_at,
  et.updated_at

FROM email_templates et

ON CONFLICT (id) DO NOTHING;
