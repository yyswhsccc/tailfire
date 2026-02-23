-- Formalize previously manual itinerary_status enum renames.
-- Safe on DBs where renames were already applied.

DO $$
BEGIN
  IF to_regtype('public.itinerary_status') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.itinerary_status'::regtype
        AND enumlabel = 'presented'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.itinerary_status'::regtype
        AND enumlabel = 'proposing'
    ) THEN
      ALTER TYPE public.itinerary_status RENAME VALUE 'presented' TO 'proposing';
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.itinerary_status'::regtype
        AND enumlabel = 'selected'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.itinerary_status'::regtype
        AND enumlabel = 'approved'
    ) THEN
      ALTER TYPE public.itinerary_status RENAME VALUE 'selected' TO 'approved';
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.itinerary_status'::regtype
        AND enumlabel = 'rejected'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = 'public.itinerary_status'::regtype
        AND enumlabel = 'archived'
    ) THEN
      ALTER TYPE public.itinerary_status RENAME VALUE 'rejected' TO 'archived';
    END IF;
  END IF;
END $$;
