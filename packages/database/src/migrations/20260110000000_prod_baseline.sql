-- ==============================================================================
-- Migration: Production Baseline Schema
-- Generated from DEV database state as of 2026-01-09
-- Includes: All public schema tables, ENUMs, indexes, constraints, RLS
-- DOES NOT TOUCH: catalog schema (already populated in Prod)
-- ==============================================================================

BEGIN;

-- ============================================================================
-- GUARD: Hard fail if already initialized (RETURN only exits DO block!)
-- ============================================================================
DO $$
BEGIN
  -- Check for agencies table (only created by baseline, not by early numbered migrations)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'agencies') THEN
    RAISE EXCEPTION 'Prod baseline already applied - aborting to prevent duplicate schema';
  END IF;

  -- Clean slate: drop objects from early numbered migrations so baseline can create everything fresh
  -- This only runs on fresh installs where agencies doesn't exist yet
  EXECUTE 'DROP SCHEMA public CASCADE';
  EXECUTE 'CREATE SCHEMA public';
  EXECUTE 'GRANT ALL ON SCHEMA public TO postgres';
  EXECUTE 'GRANT ALL ON SCHEMA public TO public';
END $$;

-- ============================================================================
-- NOTE: Drizzle schema NOT included - Drizzle creates it automatically
-- ============================================================================

-- ============================================================================
-- SCHEMA STRUCTURE (from pg_dump of DEV - sanitized)
-- ============================================================================
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: activity_action; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.activity_action AS ENUM (
    'created',
    'updated',
    'deleted',
    'status_changed',
    'published',
    'unpublished'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_entity_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.activity_entity_type AS ENUM (
    'trip',
    'trip_traveler',
    'itinerary',
    'contact',
    'user'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.activity_status AS ENUM (
    'proposed',
    'confirmed',
    'cancelled',
    'optional'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.activity_type AS ENUM (
    'lodging',
    'flight',
    'activity',
    'transportation',
    'cruise',
    'dining',
    'options',
    'custom_cruise',
    'port_info'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: amenity_category; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.amenity_category AS ENUM (
    'connectivity',
    'facilities',
    'dining',
    'services',
    'parking',
    'accessibility',
    'room_features',
    'family',
    'pets',
    'other'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: amenity_source; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.amenity_source AS ENUM (
    'google_places',
    'booking_com',
    'amadeus',
    'manual',
    'system'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: api_provider; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.api_provider AS ENUM (
    'supabase_storage',
    'cloudflare_r2',
    'backblaze_b2',
    'unsplash'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: booking_payment_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.booking_payment_status AS ENUM (
    'unpaid',
    'deposit_paid',
    'paid',
    'refunded',
    'partially_refunded'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: booking_pricing_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.booking_pricing_type AS ENUM (
    'flat_rate',
    'per_person'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: commission_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.commission_status AS ENUM (
    'pending',
    'received',
    'cancelled'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: component_entity_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.component_entity_type AS ENUM (
    'activity',
    'accommodation',
    'flight',
    'transfer',
    'dining',
    'cruise',
    'port_info',
    'option'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_group_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.contact_group_type AS ENUM (
    'family',
    'corporate',
    'wedding',
    'friends',
    'custom'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_relationship_category; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.contact_relationship_category AS ENUM (
    'family',
    'business',
    'travel_companions',
    'group',
    'other',
    'custom'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_status_enum; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.contact_status_enum AS ENUM (
    'prospecting',
    'quoted',
    'booked',
    'traveling',
    'returned',
    'awaiting_next',
    'inactive'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_type_enum; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.contact_type_enum AS ENUM (
    'lead',
    'client'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: credential_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.credential_status AS ENUM (
    'active',
    'expired',
    'revoked'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: deposit_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.deposit_type AS ENUM (
    'percentage',
    'fixed_amount'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: expected_payment_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.expected_payment_status AS ENUM (
    'pending',
    'partial',
    'paid',
    'overdue'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: insurance_policy_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.insurance_policy_type AS ENUM (
    'trip_cancellation',
    'medical',
    'comprehensive',
    'evacuation',
    'baggage',
    'other'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: invoice_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.invoice_type AS ENUM (
    'individual_item',
    'part_of_package'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itinerary_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.itinerary_status AS ENUM (
    'draft',
    'presented',
    'selected',
    'rejected'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itinerary_style; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.itinerary_style AS ENUM (
    'side_by_side',
    'stacked',
    'compact'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: media_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.media_type AS ENUM (
    'image',
    'video',
    'document'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: notification_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.notification_status AS ENUM (
    'pending',
    'dismissed',
    'acted'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'split_recalculation_needed',
    'payment_received',
    'payment_overdue',
    'refund_processed'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'check',
    'credit_card',
    'bank_transfer',
    'stripe',
    'other'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'paid',
    'cancelled'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payment_transaction_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.payment_transaction_type AS ENUM (
    'payment',
    'refund',
    'adjustment'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: port_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.port_type AS ENUM (
    'departure',
    'arrival',
    'sea_day',
    'port_call'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: pricing_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.pricing_type AS ENUM (
    'per_person',
    'per_room',
    'flat_rate',
    'per_night',
    'total'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: pricing_visibility; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.pricing_visibility AS ENUM (
    'show_all',
    'hide_all',
    'travelers_only'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: schedule_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.schedule_type AS ENUM (
    'full',
    'deposit',
    'installments',
    'guarantee'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: service_fee_recipient; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.service_fee_recipient AS ENUM (
    'primary_traveller',
    'all_travellers'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: service_fee_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.service_fee_status AS ENUM (
    'draft',
    'sent',
    'paid',
    'partially_refunded',
    'refunded',
    'cancelled'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: split_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.split_type AS ENUM (
    'equal',
    'custom'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: stripe_account_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.stripe_account_status AS ENUM (
    'not_connected',
    'pending',
    'active',
    'restricted',
    'disabled'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_group_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.traveler_group_type AS ENUM (
    'room',
    'dining',
    'activity',
    'transfer',
    'custom'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_insurance_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.traveler_insurance_status AS ENUM (
    'pending',
    'has_own_insurance',
    'declined',
    'selected_package'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_role; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.traveler_role AS ENUM (
    'primary_contact',
    'full_access',
    'limited_access'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.traveler_type AS ENUM (
    'adult',
    'child',
    'infant'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.trip_status AS ENUM (
    'draft',
    'quoted',
    'booked',
    'in_progress',
    'completed',
    'cancelled'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_type; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.trip_type AS ENUM (
    'leisure',
    'business',
    'group',
    'honeymoon',
    'corporate',
    'custom'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'admin',
    'user'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

DO $$
BEGIN
  CREATE TYPE public.user_status AS ENUM (
    'active',
    'pending',
    'locked'
);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: auto_promote_to_client(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.auto_promote_to_client() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- GUARD: Only fire when first_booking_date transitions from null → value
  IF NEW.contact_type = 'lead'
     AND NEW.first_booking_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.first_booking_date IS NULL) THEN
    NEW.contact_type := 'client';
    NEW.became_client_at := NOW();
    NEW.contact_status := 'booked';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_trip_reference(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.generate_trip_reference() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  type_prefix TEXT;
  year_part TEXT;
  next_num INTEGER;
BEGIN
  -- Map trip_type to prefix
  -- FIT: Free Independent Travel
  -- GRP: Group Travel
  -- BUS: Business
  -- MICE: Meetings, Incentives, Conferences, Events
  -- DFT: Draft (temporary reference for draft trips)
  CASE NEW.trip_type
    WHEN 'leisure' THEN type_prefix := 'FIT';
    WHEN 'honeymoon' THEN type_prefix := 'FIT';
    WHEN 'custom' THEN type_prefix := 'FIT';
    WHEN 'group' THEN type_prefix := 'GRP';
    WHEN 'business' THEN type_prefix := 'BUS';
    WHEN 'corporate' THEN type_prefix := 'MICE';
    ELSE type_prefix := 'DFT';
  END CASE;

  -- Get current year
  year_part := TO_CHAR(CURRENT_DATE, 'YYYY');

  -- Get and increment sequence (atomic operation)
  -- Uses ON CONFLICT to handle concurrent inserts safely
  INSERT INTO trip_reference_sequences (trip_type, year, last_sequence, updated_at)
  VALUES (NEW.trip_type, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 1, now())
  ON CONFLICT (trip_type, year)
  DO UPDATE SET
    last_sequence = trip_reference_sequences.last_sequence + 1,
    updated_at = now()
  RETURNING last_sequence INTO next_num;

  -- Format reference number: TYPE-YYYY-NNNNNN (e.g., FIT-2025-000001)
  NEW.reference_number := type_prefix || '-' || year_part || '-' || LPAD(next_num::TEXT, 6, '0');

  RETURN NEW;
END;
$$;


--
-- Name: prevent_client_demotion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.prevent_client_demotion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.contact_type = 'client' AND NEW.contact_type = 'lead' THEN
    RAISE EXCEPTION 'Cannot demote client back to lead (one-way door)';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_consent_timestamps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_consent_timestamps() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Email opt-in timestamp (only set when transitioning false → true)
  IF NEW.marketing_email_opt_in != OLD.marketing_email_opt_in THEN
    IF NEW.marketing_email_opt_in THEN
      NEW.marketing_email_opt_in_at := NOW();
    END IF;
  END IF;

  -- SMS opt-in timestamp
  IF NEW.marketing_sms_opt_in != OLD.marketing_sms_opt_in THEN
    IF NEW.marketing_sms_opt_in THEN
      NEW.marketing_sms_opt_in_at := NOW();
    END IF;
  END IF;

  -- Phone opt-in timestamp
  IF NEW.marketing_phone_opt_in != OLD.marketing_phone_opt_in THEN
    IF NEW.marketing_phone_opt_in THEN
      NEW.marketing_phone_opt_in_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_cruise_lines_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_cruise_lines_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_cruise_ports_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_cruise_ports_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_cruise_regions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_cruise_regions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_cruise_ships_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_cruise_ships_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_custom_cruise_details_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.update_custom_cruise_details_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: validate_split_trip_consistency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.validate_split_trip_consistency() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  activity_trip_id UUID;
  activity_currency VARCHAR(3);
  traveller_trip_id UUID;
BEGIN
  -- Get the trip_id and currency for the activity
  SELECT i.trip_id, ia.currency
  INTO activity_trip_id, activity_currency
  FROM itinerary_activities ia
  JOIN itinerary_days id ON ia.itinerary_day_id = id.id
  JOIN itineraries i ON id.itinerary_id = i.id
  WHERE ia.id = NEW.activity_id;

  -- Validate activity exists and belongs to the specified trip
  IF activity_trip_id IS NULL THEN
    RAISE EXCEPTION 'Activity with ID % not found', NEW.activity_id;
  END IF;

  IF activity_trip_id != NEW.trip_id THEN
    RAISE EXCEPTION 'Activity does not belong to the specified trip';
  END IF;

  -- Validate traveller belongs to the trip
  SELECT trip_id INTO traveller_trip_id
  FROM trip_travelers
  WHERE id = NEW.traveller_id;

  IF traveller_trip_id IS NULL THEN
    RAISE EXCEPTION 'Traveller with ID % not found', NEW.traveller_id;
  END IF;

  IF traveller_trip_id != NEW.trip_id THEN
    RAISE EXCEPTION 'Traveller does not belong to the specified trip';
  END IF;

  -- Validate currency matches activity currency
  IF NEW.currency != activity_currency THEN
    RAISE EXCEPTION 'Split currency (%) must match activity currency (%)', NEW.currency, activity_currency;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: validate_trip_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE OR REPLACE FUNCTION public.validate_trip_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Allow no-op updates (status hasn't changed)
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Validate transitions from 'draft'
  -- Valid: quoted, booked, cancelled
  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('quoted', 'booked', 'cancelled') THEN
      RAISE EXCEPTION 'Cannot transition from Draft to %. Valid transitions: Quoted, Booked, Cancelled', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- Validate transitions from 'quoted'
  -- Valid: draft, booked, cancelled
  IF OLD.status = 'quoted' THEN
    IF NEW.status NOT IN ('draft', 'booked', 'cancelled') THEN
      RAISE EXCEPTION 'Cannot transition from Quoted to %. Valid transitions: Draft, Booked, Cancelled', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- Validate transitions from 'booked'
  -- Valid: in_progress, completed, cancelled
  IF OLD.status = 'booked' THEN
    IF NEW.status NOT IN ('in_progress', 'completed', 'cancelled') THEN
      RAISE EXCEPTION 'Cannot transition from Booked to %. Valid transitions: In Progress, Completed, Cancelled', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- Validate transitions from 'in_progress'
  -- Valid: completed, cancelled
  IF OLD.status = 'in_progress' THEN
    IF NEW.status NOT IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION 'Cannot transition from In Progress to %. Valid transitions: Completed, Cancelled', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- Terminal state: 'completed'
  -- No transitions allowed
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot transition from Completed to %. Completed is a terminal state.', NEW.status;
  END IF;

  -- Terminal state: 'cancelled'
  -- No transitions allowed
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot transition from Cancelled to %. Cancelled is a terminal state.', NEW.status;
  END IF;

  -- Fallback: If we somehow reach here, allow the transition
  -- (This should never happen if all statuses are covered above)
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_amenities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.activity_amenities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    amenity_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: activity_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.activity_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    document_type character varying(100),
    file_url text NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size integer,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by uuid,
    CONSTRAINT activity_documents_type_check CHECK (((document_type IS NULL) OR ((document_type)::text = ANY ((ARRAY['confirmation'::character varying, 'voucher'::character varying, 'invoice'::character varying, 'itinerary'::character varying, 'receipt'::character varying, 'contract'::character varying, 'ticket'::character varying, 'passport'::character varying, 'visa'::character varying, 'cabin_image'::character varying, 'media_image'::character varying, 'other'::character varying])::text[]))))
);



--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type public.activity_entity_type NOT NULL,
    entity_id uuid NOT NULL,
    action public.activity_action NOT NULL,
    actor_id uuid,
    actor_type character varying(50),
    description text,
    metadata jsonb,
    trip_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.activity_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    entity_type public.component_entity_type DEFAULT 'activity'::public.component_entity_type NOT NULL,
    media_type public.media_type NOT NULL,
    file_url text NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size integer,
    caption text,
    order_index integer DEFAULT 0 NOT NULL,
    attribution jsonb,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by uuid
);



--
-- Name: activity_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.activity_pricing (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    agency_id uuid NOT NULL,
    pricing_type public.pricing_type NOT NULL,
    base_price numeric(10,2) NOT NULL,
    currency character varying(3) DEFAULT 'CAD'::character varying NOT NULL,
    invoice_type public.invoice_type DEFAULT 'individual_item'::public.invoice_type NOT NULL,
    total_price_cents integer,
    taxes_and_fees_cents integer DEFAULT 0,
    commission_total_cents integer,
    commission_split_percentage numeric(5,2),
    commission_expected_date date,
    confirmation_number character varying(255),
    booking_reference character varying(255),
    booking_status character varying(100),
    terms_and_conditions text,
    cancellation_policy text,
    supplier character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: activity_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.activity_suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    primary_supplier boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: activity_travelers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.activity_travelers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    trip_traveler_id uuid NOT NULL,
    trip_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: activity_traveller_splits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.activity_traveller_splits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    traveller_id uuid NOT NULL,
    split_type public.split_type DEFAULT 'equal'::public.split_type NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) NOT NULL,
    exchange_rate_to_trip_currency numeric(10,6),
    exchange_rate_snapshot_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT activity_traveller_splits_amount_positive CHECK ((amount_cents >= 0))
);


--
-- Name: agencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: agency_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.agency_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    stripe_account_id character varying(255),
    stripe_account_status public.stripe_account_status DEFAULT 'not_connected'::public.stripe_account_status NOT NULL,
    stripe_charges_enabled boolean DEFAULT false,
    stripe_payouts_enabled boolean DEFAULT false,
    stripe_onboarding_completed_at timestamp with time zone,
    jurisdiction_code character varying(10),
    compliance_disclaimer_text text,
    insurance_waiver_text text,
    logo_url text,
    primary_color character varying(7),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: amenities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.amenities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    category public.amenity_category DEFAULT 'other'::public.amenity_category NOT NULL,
    icon character varying(50),
    description text,
    source public.amenity_source DEFAULT 'manual'::public.amenity_source NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.api_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    provider public.api_provider NOT NULL,
    name character varying(255) NOT NULL,
    encrypted_credentials jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    status public.credential_status DEFAULT 'active'::public.credential_status NOT NULL,
    last_rotated_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: commission_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.commission_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_pricing_id uuid NOT NULL,
    commission_rate numeric(5,2),
    commission_amount numeric(10,2) NOT NULL,
    commission_status public.commission_status DEFAULT 'pending'::public.commission_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.contact_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    role character varying(100),
    notes text,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by uuid
);


--
-- Name: contact_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.contact_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    name character varying(255) NOT NULL,
    group_type public.contact_group_type NOT NULL,
    description text,
    primary_contact_id uuid,
    tags text[],
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: contact_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.contact_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    contact_id1 uuid NOT NULL,
    contact_id2 uuid NOT NULL,
    label_for_contact1 character varying(100),
    label_for_contact2 character varying(100),
    category public.contact_relationship_category DEFAULT 'other'::public.contact_relationship_category,
    custom_label character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: contact_stripe_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.contact_stripe_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    stripe_account_id character varying(255) NOT NULL,
    stripe_customer_id character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.contact_tags (
    contact_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    first_name character varying(100),
    last_name character varying(100),
    email character varying(255),
    phone character varying(50),
    date_of_birth date,
    passport_number character varying(50),
    passport_expiry date,
    nationality character varying(3),
    address_line1 character varying(255),
    address_line2 character varying(255),
    city character varying(100),
    province character varying(100),
    postal_code character varying(20),
    country character varying(3),
    dietary_requirements text,
    mobility_requirements text,
    trust_balance_cad numeric(12,2) DEFAULT 0.00,
    trust_balance_usd numeric(12,2) DEFAULT 0.00,
    tags text[],
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    legal_first_name text,
    legal_last_name text,
    middle_name text,
    preferred_name text,
    prefix character varying(10),
    suffix character varying(10),
    gender character varying(50),
    pronouns character varying(50),
    marital_status character varying(50),
    contact_type public.contact_type_enum DEFAULT 'lead'::public.contact_type_enum NOT NULL,
    contact_status public.contact_status_enum DEFAULT 'prospecting'::public.contact_status_enum NOT NULL,
    became_client_at timestamp with time zone,
    first_booking_date date,
    last_trip_return_date date,
    marketing_email_opt_in boolean DEFAULT false,
    marketing_sms_opt_in boolean DEFAULT false,
    marketing_phone_opt_in boolean DEFAULT false,
    marketing_email_opt_in_at timestamp with time zone,
    marketing_sms_opt_in_at timestamp with time zone,
    marketing_phone_opt_in_at timestamp with time zone,
    marketing_opt_in_source text,
    marketing_opt_out_at timestamp with time zone,
    marketing_opt_out_reason text,
    redress_number character varying(20),
    known_traveler_number character varying(20),
    passport_country character varying(3),
    passport_issue_date date,
    seat_preference character varying(20),
    cabin_preference character varying(20),
    floor_preference character varying(20),
    travel_preferences jsonb DEFAULT '{}'::jsonb,
    timezone character varying(64),
    owner_id uuid,
    CONSTRAINT check_client_timestamp CHECK (((contact_type <> 'client'::public.contact_type_enum) OR (became_client_at IS NOT NULL))),
    CONSTRAINT check_has_name CHECK (((first_name IS NOT NULL) OR (legal_first_name IS NOT NULL) OR (preferred_name IS NOT NULL))),
    CONSTRAINT check_lead_status CHECK (((contact_type <> 'lead'::public.contact_type_enum) OR (contact_status = 'prospecting'::public.contact_status_enum)))
);



--
-- Name: COLUMN contacts.timezone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.timezone IS 'IANA timezone identifier for this contact (e.g., America/Toronto). Used to display dates/times in the user''s local timezone.';


--
-- Name: credit_card_guarantee; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.credit_card_guarantee (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_schedule_config_id uuid NOT NULL,
    card_holder_name character varying(255) NOT NULL,
    card_last_4 character varying(4) NOT NULL,
    authorization_code character varying(100) NOT NULL,
    authorization_date timestamp with time zone NOT NULL,
    authorization_amount_cents integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: currency_exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.currency_exchange_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_currency character varying(3) NOT NULL,
    to_currency character varying(3) NOT NULL,
    rate numeric(10,6) NOT NULL,
    rate_date date NOT NULL,
    source character varying(50) DEFAULT 'ExchangeRate-API'::character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: custom_cruise_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.custom_cruise_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    traveltek_cruise_id text,
    source character varying(50) DEFAULT 'manual'::character varying,
    cruise_line_name character varying(255),
    cruise_line_code character varying(50),
    ship_name character varying(255),
    ship_code character varying(50),
    ship_class character varying(100),
    ship_image_url text,
    itinerary_name character varying(255),
    voyage_code character varying(100),
    region character varying(100),
    nights integer,
    sea_days integer,
    departure_port character varying(255),
    departure_date date,
    departure_time time without time zone,
    departure_timezone character varying(100),
    arrival_port character varying(255),
    arrival_date date,
    arrival_time time without time zone,
    arrival_timezone character varying(100),
    cabin_category character varying(50),
    cabin_code character varying(50),
    cabin_number character varying(50),
    cabin_deck character varying(50),
    booking_number character varying(100),
    fare_code character varying(50),
    booking_deadline date,
    port_calls_json jsonb DEFAULT '[]'::jsonb,
    cabin_pricing_json jsonb DEFAULT '{}'::jsonb,
    ship_content_json jsonb DEFAULT '{}'::jsonb,
    inclusions text[] DEFAULT '{}'::text[],
    special_requests text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    departure_port_id uuid,
    arrival_port_id uuid,
    cruise_line_id uuid,
    cruise_ship_id uuid,
    cruise_region_id uuid,
    CONSTRAINT custom_cruise_details_cabin_category_check CHECK (((cabin_category IS NULL) OR ((cabin_category)::text = ANY ((ARRAY['suite'::character varying, 'balcony'::character varying, 'oceanview'::character varying, 'inside'::character varying])::text[])))),
    CONSTRAINT custom_cruise_details_nights_check CHECK (((nights IS NULL) OR (nights >= 0))),
    CONSTRAINT custom_cruise_details_sea_days_check CHECK (((sea_days IS NULL) OR (sea_days >= 0))),
    CONSTRAINT custom_cruise_details_source_check CHECK (((source)::text = ANY ((ARRAY['traveltek'::character varying, 'manual'::character varying])::text[])))
);


--
-- Name: TABLE custom_cruise_details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.custom_cruise_details IS 'Stores cruise-specific booking details for itinerary components';


--
-- Name: COLUMN custom_cruise_details.traveltek_cruise_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_cruise_details.traveltek_cruise_id IS 'Traveltek codetocruiseid for API reference';


--
-- Name: COLUMN custom_cruise_details.port_calls_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_cruise_details.port_calls_json IS 'Array of port calls: [{day, portName, arriveDate, departDate, arriveTime, departTime, tender}]';


--
-- Name: COLUMN custom_cruise_details.cabin_pricing_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_cruise_details.cabin_pricing_json IS 'Traveltek cabin pricing structure for all cabin types';


--
-- Name: COLUMN custom_cruise_details.ship_content_json; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_cruise_details.ship_content_json IS 'Ship details including images, amenities from Traveltek';


--
-- Name: COLUMN custom_cruise_details.departure_port_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_cruise_details.departure_port_id IS 'Optional FK to cruise_ports for departure port lookup';


--
-- Name: COLUMN custom_cruise_details.arrival_port_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_cruise_details.arrival_port_id IS 'Optional FK to cruise_ports for arrival port lookup';


--
-- Name: COLUMN custom_cruise_details.cruise_line_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_cruise_details.cruise_line_id IS 'FK to cruise_lines table (null for custom entries)';


--
-- Name: COLUMN custom_cruise_details.cruise_ship_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_cruise_details.cruise_ship_id IS 'FK to cruise_ships table (null for custom entries)';


--
-- Name: COLUMN custom_cruise_details.cruise_region_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_cruise_details.cruise_region_id IS 'FK to cruise_regions table (null for custom entries)';


--
-- Name: dining_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.dining_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    restaurant_name character varying(255),
    cuisine_type character varying(100),
    meal_type character varying(50),
    reservation_date date,
    reservation_time time without time zone,
    timezone character varying(100),
    party_size integer,
    address text,
    phone character varying(50),
    website character varying(500),
    coordinates jsonb,
    price_range character varying(50),
    dress_code character varying(100),
    dietary_requirements text[],
    special_requests text,
    menu_url character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dining_details_party_size_check CHECK (((party_size IS NULL) OR ((party_size >= 1) AND (party_size <= 100))))
);


--
-- Name: expected_payment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.expected_payment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_schedule_config_id uuid NOT NULL,
    payment_name character varying(100) NOT NULL,
    expected_amount_cents integer NOT NULL,
    due_date date,
    status public.expected_payment_status DEFAULT 'pending'::public.expected_payment_status NOT NULL,
    sequence_order integer DEFAULT 0 NOT NULL,
    paid_amount_cents integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expected_amount_positive CHECK ((expected_amount_cents >= 0)),
    CONSTRAINT paid_not_exceed_expected CHECK ((paid_amount_cents <= expected_amount_cents))
);


--
-- Name: flight_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.flight_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    airline character varying(255),
    flight_number character varying(100),
    departure_airport_code character varying(10),
    departure_date date,
    departure_time time without time zone,
    departure_timezone character varying(64),
    departure_terminal character varying(50),
    departure_gate character varying(50),
    arrival_airport_code character varying(10),
    arrival_date date,
    arrival_time time without time zone,
    arrival_timezone character varying(64),
    arrival_terminal character varying(50),
    arrival_gate character varying(50),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: flight_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.flight_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    segment_order integer DEFAULT 0 NOT NULL,
    airline character varying(255),
    flight_number character varying(100),
    departure_airport_code character varying(10),
    departure_airport_name character varying(255),
    departure_airport_city character varying(100),
    departure_airport_lat double precision,
    departure_airport_lon double precision,
    departure_date date,
    departure_time time without time zone,
    departure_timezone character varying(64),
    departure_terminal character varying(50),
    departure_gate character varying(50),
    arrival_airport_code character varying(10),
    arrival_airport_name character varying(255),
    arrival_airport_city character varying(100),
    arrival_airport_lat double precision,
    arrival_airport_lon double precision,
    arrival_date date,
    arrival_time time without time zone,
    arrival_timezone character varying(64),
    arrival_terminal character varying(50),
    arrival_gate character varying(50),
    aircraft_model character varying(255),
    aircraft_registration character varying(50),
    aircraft_mode_s character varying(10),
    aircraft_image_url text,
    aircraft_image_author character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: itineraries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.itineraries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    status public.itinerary_status DEFAULT 'draft'::public.itinerary_status NOT NULL,
    is_selected boolean DEFAULT false NOT NULL,
    estimated_cost numeric(12,2),
    sequence_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cover_photo text,
    overview text,
    start_date date,
    end_date date
);


--
-- Name: itinerary_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.itinerary_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_day_id uuid NOT NULL,
    activity_type public.activity_type NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    sequence_order integer DEFAULT 0 NOT NULL,
    start_datetime timestamp with time zone,
    end_datetime timestamp with time zone,
    timezone character varying(64),
    location character varying(255),
    address text,
    coordinates jsonb,
    notes text,
    confirmation_number character varying(100),
    status public.activity_status DEFAULT 'proposed'::public.activity_status,
    estimated_cost numeric(10,2),
    pricing_type public.pricing_type,
    currency character varying(3) DEFAULT 'USD'::character varying,
    photos jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    component_type public.activity_type NOT NULL,
    parent_activity_id uuid
);


--
-- Name: itinerary_days; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.itinerary_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    itinerary_id uuid NOT NULL,
    day_number integer NOT NULL,
    date date,
    title character varying(255),
    notes text,
    sequence_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: itinerary_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.itinerary_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    payload jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: lodging_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.lodging_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    property_name character varying(255),
    address text,
    phone character varying(50),
    website character varying(255),
    check_in_date date NOT NULL,
    check_in_time time without time zone,
    check_out_date date NOT NULL,
    check_out_time time without time zone,
    timezone character varying(100),
    room_type character varying(100),
    room_count integer DEFAULT 1 NOT NULL,
    amenities jsonb DEFAULT '[]'::jsonb,
    special_requests text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT checkout_after_checkin CHECK ((check_out_date >= check_in_date)),
    CONSTRAINT room_count_positive CHECK ((room_count > 0))
);


--
-- Name: options_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.options_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    option_category character varying(50),
    is_selected boolean DEFAULT false,
    availability_start_date date,
    availability_end_date date,
    booking_deadline date,
    min_participants integer,
    max_participants integer,
    spots_available integer,
    duration_minutes integer,
    meeting_point character varying(255),
    meeting_time time without time zone,
    provider_name character varying(255),
    provider_phone character varying(50),
    provider_email character varying(255),
    provider_website character varying(500),
    inclusions text[],
    exclusions text[],
    requirements text[],
    what_to_bring text[],
    display_order integer,
    highlight_text character varying(100),
    instructions_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT options_details_category_check CHECK (((option_category IS NULL) OR ((option_category)::text = ANY ((ARRAY['upgrade'::character varying, 'add_on'::character varying, 'tour'::character varying, 'excursion'::character varying, 'insurance'::character varying, 'meal_plan'::character varying, 'other'::character varying])::text[])))),
    CONSTRAINT options_details_duration_check CHECK (((duration_minutes IS NULL) OR (duration_minutes >= 0))),
    CONSTRAINT options_details_max_participants_check CHECK (((max_participants IS NULL) OR (max_participants >= 0))),
    CONSTRAINT options_details_min_participants_check CHECK (((min_participants IS NULL) OR (min_participants >= 0))),
    CONSTRAINT options_details_participants_range_check CHECK (((min_participants IS NULL) OR (max_participants IS NULL) OR (max_participants >= min_participants))),
    CONSTRAINT options_details_spots_available_check CHECK (((spots_available IS NULL) OR (spots_available >= 0)))
);


--
-- Name: package_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.package_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    trip_id uuid NOT NULL,
    supplier_id uuid,
    supplier_name character varying(255),
    payment_status public.booking_payment_status DEFAULT 'unpaid'::public.booking_payment_status,
    pricing_type public.booking_pricing_type DEFAULT 'flat_rate'::public.booking_pricing_type,
    cancellation_policy text,
    cancellation_deadline date,
    terms_and_conditions text,
    group_booking_number character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: package_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.package_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    payload jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: payment_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.payment_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_pricing_id uuid NOT NULL,
    payment_date date NOT NULL,
    payment_amount numeric(10,2) NOT NULL,
    payment_status public.payment_status DEFAULT 'pending'::public.payment_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_schedule_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.payment_schedule_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_pricing_id uuid NOT NULL,
    schedule_type public.schedule_type DEFAULT 'full'::public.schedule_type NOT NULL,
    allow_partial_payments boolean DEFAULT false,
    deposit_type public.deposit_type,
    deposit_percentage numeric(5,2),
    deposit_amount_cents integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deposit_amount_positive CHECK ((deposit_amount_cents >= 0)),
    CONSTRAINT deposit_percentage_range CHECK (((deposit_percentage >= (0)::numeric) AND (deposit_percentage <= (100)::numeric)))
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expected_payment_item_id uuid NOT NULL,
    agency_id uuid NOT NULL,
    transaction_type public.payment_transaction_type NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) NOT NULL,
    payment_method public.payment_method,
    reference_number character varying(100),
    transaction_date timestamp with time zone NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT payment_transactions_amount_cents_check CHECK ((amount_cents >= 0))
);



--
-- Name: port_info_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.port_info_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    port_name character varying(255),
    port_location character varying(255),
    arrival_date date,
    arrival_time time without time zone,
    departure_date date,
    departure_time time without time zone,
    timezone character varying(100),
    dock_name character varying(255),
    address text,
    coordinates jsonb,
    phone character varying(50),
    website character varying(500),
    excursion_notes text,
    tender_required boolean DEFAULT false,
    special_requests text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    port_type public.port_type
);


--
-- Name: service_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.service_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    recipient_type public.service_fee_recipient DEFAULT 'primary_traveller'::public.service_fee_recipient NOT NULL,
    title character varying(255) NOT NULL,
    amount_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'CAD'::character varying NOT NULL,
    due_date date,
    description text,
    status public.service_fee_status DEFAULT 'draft'::public.service_fee_status NOT NULL,
    exchange_rate_to_trip_currency numeric(10,6),
    amount_in_trip_currency_cents integer,
    stripe_invoice_id character varying(255),
    stripe_payment_intent_id character varying(255),
    stripe_hosted_invoice_url text,
    refunded_amount_cents integer DEFAULT 0,
    refund_reason text,
    sent_at timestamp with time zone,
    paid_at timestamp with time zone,
    refunded_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT service_fees_amount_positive CHECK ((amount_cents > 0))
);


--
-- Name: stripe_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id character varying(255) NOT NULL,
    event_type character varying(100) NOT NULL,
    stripe_account_id character varying(255),
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    payload jsonb
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    supplier_type character varying(100),
    contact_info jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    category character varying(50),
    color character varying(7),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transportation_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.transportation_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    component_id uuid NOT NULL,
    subtype character varying(50),
    provider_name character varying(255),
    provider_phone character varying(50),
    provider_email character varying(255),
    vehicle_type character varying(100),
    vehicle_model character varying(100),
    vehicle_capacity integer,
    license_plate character varying(50),
    pickup_date date,
    pickup_time time without time zone,
    pickup_timezone character varying(64),
    pickup_address text,
    pickup_notes text,
    dropoff_date date,
    dropoff_time time without time zone,
    dropoff_timezone character varying(64),
    dropoff_address text,
    dropoff_notes text,
    driver_name character varying(255),
    driver_phone character varying(50),
    rental_pickup_location character varying(255),
    rental_dropoff_location character varying(255),
    rental_insurance_type character varying(100),
    rental_mileage_limit character varying(100),
    features jsonb DEFAULT '[]'::jsonb,
    special_requests text,
    flight_number character varying(50),
    is_round_trip integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transportation_details_subtype_check CHECK (((subtype IS NULL) OR ((subtype)::text = ANY ((ARRAY['transfer'::character varying, 'car_rental'::character varying, 'private_car'::character varying, 'taxi'::character varying, 'shuttle'::character varying, 'train'::character varying, 'ferry'::character varying, 'bus'::character varying, 'limousine'::character varying])::text[]))))
);


--
-- Name: traveler_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.traveler_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    traveler_group_id uuid NOT NULL,
    trip_traveler_id uuid NOT NULL,
    role character varying(100),
    notes text,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by uuid
);


--
-- Name: traveler_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.traveler_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    group_type public.traveler_group_type NOT NULL,
    description text,
    sequence_order integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: trip_collaborators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.trip_collaborators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    user_id uuid NOT NULL,
    commission_percentage numeric(5,2) NOT NULL,
    role character varying(50),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: trip_insurance_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.trip_insurance_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    provider_name character varying(255) NOT NULL,
    package_name character varying(255) NOT NULL,
    policy_type public.insurance_policy_type NOT NULL,
    coverage_amount_cents integer,
    premium_cents integer NOT NULL,
    deductible_cents integer,
    currency character varying(3) DEFAULT 'CAD'::character varying NOT NULL,
    coverage_start_date date,
    coverage_end_date date,
    coverage_details jsonb,
    terms_url text,
    is_from_catalog boolean DEFAULT false,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: trip_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.trip_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    media_type public.media_type NOT NULL,
    file_url text NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size integer,
    caption text,
    is_cover_photo boolean DEFAULT false NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    attribution jsonb,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by uuid
);


--
-- Name: trip_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.trip_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    notification_type public.notification_type NOT NULL,
    status public.notification_status DEFAULT 'pending'::public.notification_status NOT NULL,
    message text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dismissed_at timestamp with time zone,
    acted_at timestamp with time zone
);


--
-- Name: trip_reference_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.trip_reference_sequences (
    trip_type character varying(50) NOT NULL,
    year integer NOT NULL,
    last_sequence integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trip_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.trip_tags (
    trip_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trip_traveler_insurance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.trip_traveler_insurance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    trip_traveler_id uuid NOT NULL,
    status public.traveler_insurance_status DEFAULT 'pending'::public.traveler_insurance_status NOT NULL,
    selected_package_id uuid,
    external_policy_number character varying(100),
    external_provider_name character varying(255),
    external_coverage_details text,
    declined_reason text,
    declined_at timestamp with time zone,
    acknowledged_at timestamp with time zone,
    premium_paid_cents integer,
    policy_number character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: trip_travelers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.trip_travelers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    contact_id uuid,
    is_primary_traveler boolean DEFAULT false NOT NULL,
    traveler_type public.traveler_type DEFAULT 'adult'::public.traveler_type NOT NULL,
    contact_snapshot jsonb,
    emergency_contact_id uuid,
    emergency_contact_inline jsonb,
    traveler_group_id uuid,
    special_requirements text,
    sequence_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    role public.traveler_role DEFAULT 'limited_access'::public.traveler_role NOT NULL
);


--
-- Name: COLUMN trip_travelers.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trip_travelers.role IS 'Traveler access role: primary_contact (main decision maker), full_access (can view and decide), limited_access (view only). Matches TERN passenger management system.';


--
-- Name: trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid,
    branch_id uuid,
    owner_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    trip_type public.trip_type,
    start_date date,
    end_date date,
    booking_date date,
    status public.trip_status DEFAULT 'draft'::public.trip_status NOT NULL,
    primary_contact_id uuid,
    reference_number character varying(100),
    external_reference character varying(255),
    currency character varying(3) DEFAULT 'CAD'::character varying,
    estimated_total_cost numeric(12,2),
    tags text[],
    custom_fields jsonb,
    is_archived boolean DEFAULT false NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    timezone character varying(64),
    cover_photo_url text,
    pricing_visibility public.pricing_visibility DEFAULT 'show_all'::public.pricing_visibility,
    allow_pdf_downloads boolean DEFAULT true NOT NULL,
    itinerary_style public.itinerary_style DEFAULT 'side_by_side'::public.itinerary_style
);



--
-- Name: COLUMN trips.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.status IS 'Trip status following strict workflow: draft → quoted → booked → in_progress → completed/cancelled. Enforced by trigger. Terminal states: completed, cancelled.';


--
-- Name: COLUMN trips.reference_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.reference_number IS 'Auto-generated trip reference in format {TYPE_ID}-{YEAR}-{SEQUENCE}. Examples: FIT-2025-000001, GRP-2025-000042. Immutable once status leaves draft.';


--
-- Name: COLUMN trips.timezone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.trips.timezone IS 'IANA timezone identifier for this trip (e.g., America/Toronto). Used to interpret trip dates (start_date, end_date) in the correct timezone context.';


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id uuid NOT NULL,
    agency_id uuid NOT NULL,
    email character varying(255),
    first_name character varying(100),
    last_name character varying(100),
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.user_status DEFAULT 'active'::public.user_status NOT NULL,
    invited_at timestamp with time zone,
    invited_by uuid,
    locked_at timestamp with time zone,
    locked_reason text,
    avatar_url text,
    avatar_storage_path text,
    bio text,
    public_phone character varying(50),
    office_address jsonb,
    social_media_links jsonb DEFAULT '{}'::jsonb,
    emergency_contact_name character varying(255),
    emergency_contact_phone character varying(50),
    email_signature_config jsonb DEFAULT '{}'::jsonb,
    platform_preferences jsonb DEFAULT '{}'::jsonb,
    is_public_profile boolean DEFAULT false NOT NULL,
    licensing_info jsonb DEFAULT '{}'::jsonb,
    commission_settings jsonb DEFAULT '{}'::jsonb
);



--
-- Name: activity_amenities activity_amenities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_amenities
    ADD CONSTRAINT activity_amenities_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_amenities activity_amenities_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_amenities
    ADD CONSTRAINT activity_amenities_unique UNIQUE (activity_id, amenity_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_documents activity_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_documents
    ADD CONSTRAINT activity_documents_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_media activity_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_media
    ADD CONSTRAINT activity_media_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_pricing activity_pricing_activity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_pricing
    ADD CONSTRAINT activity_pricing_activity_id_key UNIQUE (activity_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_pricing activity_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_pricing
    ADD CONSTRAINT activity_pricing_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_suppliers activity_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_suppliers
    ADD CONSTRAINT activity_suppliers_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_travelers activity_travelers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_travelers
    ADD CONSTRAINT activity_travelers_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_travelers activity_travelers_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_travelers
    ADD CONSTRAINT activity_travelers_unique UNIQUE (activity_id, trip_traveler_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_traveller_splits activity_traveller_splits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_traveller_splits
    ADD CONSTRAINT activity_traveller_splits_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: agencies agencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: agencies agencies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_slug_key UNIQUE (slug);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: agency_settings agency_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.agency_settings
    ADD CONSTRAINT agency_settings_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: amenities amenities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.amenities
    ADD CONSTRAINT amenities_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: api_credentials api_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.api_credentials
    ADD CONSTRAINT api_credentials_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: commission_tracking commission_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.commission_tracking
    ADD CONSTRAINT commission_tracking_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_group_members contact_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_group_members
    ADD CONSTRAINT contact_group_members_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_groups contact_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_groups
    ADD CONSTRAINT contact_groups_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_relationships contact_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_relationships
    ADD CONSTRAINT contact_relationships_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_stripe_customers contact_stripe_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_stripe_customers
    ADD CONSTRAINT contact_stripe_customers_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_tags contact_tags_contact_id_tag_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_tag_id_pk PRIMARY KEY (contact_id, tag_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: credit_card_guarantee credit_card_guarantee_payment_schedule_config_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.credit_card_guarantee
    ADD CONSTRAINT credit_card_guarantee_payment_schedule_config_id_unique UNIQUE (payment_schedule_config_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: credit_card_guarantee credit_card_guarantee_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.credit_card_guarantee
    ADD CONSTRAINT credit_card_guarantee_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: currency_exchange_rates currency_exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.currency_exchange_rates
    ADD CONSTRAINT currency_exchange_rates_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: custom_cruise_details custom_cruise_details_component_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.custom_cruise_details
    ADD CONSTRAINT custom_cruise_details_component_id_unique UNIQUE (component_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: custom_cruise_details custom_cruise_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.custom_cruise_details
    ADD CONSTRAINT custom_cruise_details_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: dining_details dining_details_component_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.dining_details
    ADD CONSTRAINT dining_details_component_id_unique UNIQUE (component_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: dining_details dining_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.dining_details
    ADD CONSTRAINT dining_details_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: expected_payment_items expected_payment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.expected_payment_items
    ADD CONSTRAINT expected_payment_items_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: flight_details flight_details_component_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.flight_details
    ADD CONSTRAINT flight_details_component_id_unique UNIQUE (component_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: flight_details flight_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.flight_details
    ADD CONSTRAINT flight_details_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: flight_segments flight_segments_activity_order_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.flight_segments
    ADD CONSTRAINT flight_segments_activity_order_unique UNIQUE (activity_id, segment_order);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: flight_segments flight_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.flight_segments
    ADD CONSTRAINT flight_segments_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itineraries itineraries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itinerary_activities itinerary_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.itinerary_activities
    ADD CONSTRAINT itinerary_activities_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itinerary_days itinerary_days_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.itinerary_days
    ADD CONSTRAINT itinerary_days_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itinerary_templates itinerary_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.itinerary_templates
    ADD CONSTRAINT itinerary_templates_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lodging_details lodging_details_component_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.lodging_details
    ADD CONSTRAINT lodging_details_component_id_unique UNIQUE (component_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lodging_details lodging_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.lodging_details
    ADD CONSTRAINT lodging_details_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: options_details options_details_component_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.options_details
    ADD CONSTRAINT options_details_component_id_key UNIQUE (component_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: options_details options_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.options_details
    ADD CONSTRAINT options_details_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: package_details package_details_activity_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.package_details
    ADD CONSTRAINT package_details_activity_id_key UNIQUE (activity_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: package_details package_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.package_details
    ADD CONSTRAINT package_details_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: package_templates package_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.package_templates
    ADD CONSTRAINT package_templates_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payment_schedule_config payment_schedule_config_component_pricing_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.payment_schedule_config
    ADD CONSTRAINT payment_schedule_config_component_pricing_id_unique UNIQUE (component_pricing_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payment_schedule_config payment_schedule_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.payment_schedule_config
    ADD CONSTRAINT payment_schedule_config_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payment_schedule payment_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.payment_schedule
    ADD CONSTRAINT payment_schedule_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: port_info_details port_info_details_component_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.port_info_details
    ADD CONSTRAINT port_info_details_component_id_unique UNIQUE (component_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: port_info_details port_info_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.port_info_details
    ADD CONSTRAINT port_info_details_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: service_fees service_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.service_fees
    ADD CONSTRAINT service_fees_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: stripe_webhook_events stripe_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: tags tags_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_name_unique UNIQUE (name);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: transportation_details transportation_details_component_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.transportation_details
    ADD CONSTRAINT transportation_details_component_id_key UNIQUE (component_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: transportation_details transportation_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.transportation_details
    ADD CONSTRAINT transportation_details_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_group_members traveler_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.traveler_group_members
    ADD CONSTRAINT traveler_group_members_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_groups traveler_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.traveler_groups
    ADD CONSTRAINT traveler_groups_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_collaborators trip_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT trip_collaborators_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_insurance_packages trip_insurance_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_insurance_packages
    ADD CONSTRAINT trip_insurance_packages_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_media trip_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_media
    ADD CONSTRAINT trip_media_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_notifications trip_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_notifications
    ADD CONSTRAINT trip_notifications_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_reference_sequences trip_reference_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_reference_sequences
    ADD CONSTRAINT trip_reference_sequences_pkey PRIMARY KEY (trip_type, year);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_tags trip_tags_trip_id_tag_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_tags
    ADD CONSTRAINT trip_tags_trip_id_tag_id_pk PRIMARY KEY (trip_id, tag_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_traveler_insurance trip_traveler_insurance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_traveler_insurance
    ADD CONSTRAINT trip_traveler_insurance_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_traveler_insurance trip_traveler_insurance_unique_traveler; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_traveler_insurance
    ADD CONSTRAINT trip_traveler_insurance_unique_traveler UNIQUE (trip_id, trip_traveler_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_travelers trip_travelers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_travelers
    ADD CONSTRAINT trip_travelers_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trips trips_reference_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_reference_number_unique UNIQUE (reference_number);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_traveller_splits unique_activity_traveller; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_traveller_splits
    ADD CONSTRAINT unique_activity_traveller UNIQUE (activity_id, traveller_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: agency_settings unique_agency_settings; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.agency_settings
    ADD CONSTRAINT unique_agency_settings UNIQUE (agency_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_group_members unique_contact_group_member; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_group_members
    ADD CONSTRAINT unique_contact_group_member UNIQUE (group_id, contact_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_relationships unique_contact_relationship; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_relationships
    ADD CONSTRAINT unique_contact_relationship UNIQUE (contact_id1, contact_id2);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_stripe_customers unique_contact_stripe_account; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_stripe_customers
    ADD CONSTRAINT unique_contact_stripe_account UNIQUE (contact_id, stripe_account_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: currency_exchange_rates unique_currency_pair_date; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.currency_exchange_rates
    ADD CONSTRAINT unique_currency_pair_date UNIQUE (from_currency, to_currency, rate_date);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: stripe_webhook_events unique_stripe_event; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.stripe_webhook_events
    ADD CONSTRAINT unique_stripe_event UNIQUE (event_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_group_members unique_traveler_group_member; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.traveler_group_members
    ADD CONSTRAINT unique_traveler_group_member UNIQUE (traveler_group_id, trip_traveler_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_collaborators unique_trip_collaborator; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT unique_trip_collaborator UNIQUE (trip_id, user_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: amenities_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX amenities_slug_unique ON public.amenities USING btree (slug);


--
-- Name: dining_details_component_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dining_details_component_id_idx ON public.dining_details USING btree (component_id);


--
-- Name: idx_activity_amenities_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_amenities_activity ON public.activity_amenities USING btree (activity_id);


--
-- Name: idx_activity_documents_activity_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_documents_activity_id ON public.activity_documents USING btree (activity_id);


--
-- Name: idx_activity_documents_document_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_documents_document_type ON public.activity_documents USING btree (document_type);


--
-- Name: idx_activity_media_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_media_activity ON public.activity_media USING btree (activity_id);


--
-- Name: idx_activity_pricing_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_pricing_activity ON public.activity_pricing USING btree (activity_id);


--
-- Name: idx_activity_suppliers_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_suppliers_activity ON public.activity_suppliers USING btree (activity_id);


--
-- Name: idx_activity_travelers_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_travelers_activity ON public.activity_travelers USING btree (activity_id);


--
-- Name: idx_agencies_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agencies_slug ON public.agencies USING btree (slug);


--
-- Name: idx_contact_tags_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_tags_contact_id ON public.contact_tags USING btree (contact_id);


--
-- Name: idx_contact_tags_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_tags_tag_id ON public.contact_tags USING btree (tag_id);


--
-- Name: idx_contacts_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_owner_id ON public.contacts USING btree (owner_id);


--
-- Name: idx_custom_cruise_details_arrival_port_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_cruise_details_arrival_port_id ON public.custom_cruise_details USING btree (arrival_port_id);


--
-- Name: idx_custom_cruise_details_component_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_cruise_details_component_id ON public.custom_cruise_details USING btree (component_id);


--
-- Name: idx_custom_cruise_details_cruise_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_cruise_details_cruise_line ON public.custom_cruise_details USING btree (cruise_line_name) WHERE (cruise_line_name IS NOT NULL);


--
-- Name: idx_custom_cruise_details_cruise_line_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_cruise_details_cruise_line_id ON public.custom_cruise_details USING btree (cruise_line_id);


--
-- Name: idx_custom_cruise_details_cruise_region_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_cruise_details_cruise_region_id ON public.custom_cruise_details USING btree (cruise_region_id);


--
-- Name: idx_custom_cruise_details_cruise_ship_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_cruise_details_cruise_ship_id ON public.custom_cruise_details USING btree (cruise_ship_id);


--
-- Name: idx_custom_cruise_details_departure_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_cruise_details_departure_date ON public.custom_cruise_details USING btree (departure_date) WHERE (departure_date IS NOT NULL);


--
-- Name: idx_custom_cruise_details_departure_port_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_cruise_details_departure_port_id ON public.custom_cruise_details USING btree (departure_port_id);


--
-- Name: idx_custom_cruise_details_traveltek_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_cruise_details_traveltek_id ON public.custom_cruise_details USING btree (traveltek_cruise_id) WHERE (traveltek_cruise_id IS NOT NULL);


--
-- Name: idx_expected_payment_items_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expected_payment_items_config ON public.expected_payment_items USING btree (payment_schedule_config_id);


--
-- Name: idx_expected_payment_items_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expected_payment_items_due_date ON public.expected_payment_items USING btree (due_date);


--
-- Name: idx_expected_payment_items_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expected_payment_items_sequence ON public.expected_payment_items USING btree (payment_schedule_config_id, sequence_order);


--
-- Name: idx_expected_payment_items_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expected_payment_items_status ON public.expected_payment_items USING btree (status);


--
-- Name: idx_itinerary_templates_agency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_templates_agency ON public.itinerary_templates USING btree (agency_id);


--
-- Name: idx_itinerary_templates_agency_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_itinerary_templates_agency_active ON public.itinerary_templates USING btree (agency_id, is_active);


--
-- Name: idx_lodging_details_component_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lodging_details_component_id ON public.lodging_details USING btree (component_id);


--
-- Name: idx_options_details_component_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_options_details_component_id ON public.options_details USING btree (component_id);


--
-- Name: idx_options_details_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_options_details_display_order ON public.options_details USING btree (display_order);


--
-- Name: idx_options_details_option_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_options_details_option_category ON public.options_details USING btree (option_category);


--
-- Name: idx_package_templates_agency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_templates_agency ON public.package_templates USING btree (agency_id);


--
-- Name: idx_package_templates_agency_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_package_templates_agency_active ON public.package_templates USING btree (agency_id, is_active);


--
-- Name: idx_payment_schedule_config_pricing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_schedule_config_pricing ON public.payment_schedule_config USING btree (component_pricing_id);


--
-- Name: idx_payment_transactions_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_transactions_item ON public.payment_transactions USING btree (expected_payment_item_id);


--
-- Name: idx_tags_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_name ON public.tags USING btree (name);


--
-- Name: idx_trip_insurance_packages_trip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_insurance_packages_trip ON public.trip_insurance_packages USING btree (trip_id);


--
-- Name: idx_trip_tags_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_tags_tag_id ON public.trip_tags USING btree (tag_id);


--
-- Name: idx_trip_tags_trip_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_tags_trip_id ON public.trip_tags USING btree (trip_id);


--
-- Name: idx_trip_traveler_insurance_trip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trip_traveler_insurance_trip ON public.trip_traveler_insurance USING btree (trip_id);


--
-- Name: idx_user_profiles_agency_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_agency_id ON public.user_profiles USING btree (agency_id);


--
-- Name: idx_user_profiles_agency_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_agency_status ON public.user_profiles USING btree (agency_id, status);


--
-- Name: idx_user_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_email ON public.user_profiles USING btree (email);


--
-- Name: idx_user_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_status ON public.user_profiles USING btree (status);


--
-- Name: one_primary_contact_per_trip; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_primary_contact_per_trip ON public.trip_travelers USING btree (trip_id) WHERE (role = 'primary_contact'::public.traveler_role);


--
-- Name: INDEX one_primary_contact_per_trip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.one_primary_contact_per_trip IS 'Ensures only one traveler per trip can have the primary_contact role';


--
-- Name: port_info_details_component_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX port_info_details_component_id_idx ON public.port_info_details USING btree (component_id);


--
-- Name: transportation_details_component_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transportation_details_component_id_idx ON public.transportation_details USING btree (component_id);


--
-- Name: transportation_details_pickup_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transportation_details_pickup_date_idx ON public.transportation_details USING btree (pickup_date);


--
-- Name: unique_bidirectional_relationship; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_bidirectional_relationship ON public.contact_relationships USING btree (LEAST(contact_id1, contact_id2), GREATEST(contact_id1, contact_id2));


--
-- Name: contacts auto_promote_on_booking; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_promote_on_booking BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.auto_promote_to_client();


--
-- Name: custom_cruise_details custom_cruise_details_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER custom_cruise_details_updated_at_trigger BEFORE UPDATE ON public.custom_cruise_details FOR EACH ROW EXECUTE FUNCTION public.update_custom_cruise_details_updated_at();


--
-- Name: contacts enforce_client_one_way_door; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_client_one_way_door BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.prevent_client_demotion();


--
-- Name: trips set_trip_reference_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_trip_reference_insert BEFORE INSERT ON public.trips FOR EACH ROW WHEN ((new.reference_number IS NULL)) EXECUTE FUNCTION public.generate_trip_reference();


--
-- Name: trips set_trip_reference_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_trip_reference_update BEFORE UPDATE ON public.trips FOR EACH ROW WHEN (((new.status = 'draft'::public.trip_status) AND (old.trip_type IS DISTINCT FROM new.trip_type))) EXECUTE FUNCTION public.generate_trip_reference();


--
-- Name: contacts track_consent_timestamps; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER track_consent_timestamps BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_consent_timestamps();


--
-- Name: trips trip_status_transition_validation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trip_status_transition_validation BEFORE UPDATE ON public.trips FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.validate_trip_status_transition();


--
-- Name: activity_traveller_splits validate_split_trip_consistency_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_split_trip_consistency_trigger BEFORE INSERT OR UPDATE ON public.activity_traveller_splits FOR EACH ROW EXECUTE FUNCTION public.validate_split_trip_consistency();


--
-- Name: activity_amenities activity_amenities_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_amenities
    ADD CONSTRAINT activity_amenities_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_amenities activity_amenities_amenity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_amenities
    ADD CONSTRAINT activity_amenities_amenity_id_fkey FOREIGN KEY (amenity_id) REFERENCES public.amenities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_documents activity_documents_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_documents
    ADD CONSTRAINT activity_documents_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_logs activity_logs_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_pricing activity_pricing_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_pricing
    ADD CONSTRAINT activity_pricing_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_suppliers activity_suppliers_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_suppliers
    ADD CONSTRAINT activity_suppliers_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_suppliers activity_suppliers_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_suppliers
    ADD CONSTRAINT activity_suppliers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_travelers activity_travelers_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_travelers
    ADD CONSTRAINT activity_travelers_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_travelers activity_travelers_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_travelers
    ADD CONSTRAINT activity_travelers_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_travelers activity_travelers_trip_traveler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_travelers
    ADD CONSTRAINT activity_travelers_trip_traveler_id_fkey FOREIGN KEY (trip_traveler_id) REFERENCES public.trip_travelers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_traveller_splits activity_traveller_splits_activity_id_itinerary_activities_id_f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_traveller_splits
    ADD CONSTRAINT activity_traveller_splits_activity_id_itinerary_activities_id_f FOREIGN KEY (activity_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_traveller_splits activity_traveller_splits_traveller_id_trip_travelers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_traveller_splits
    ADD CONSTRAINT activity_traveller_splits_traveller_id_trip_travelers_id_fk FOREIGN KEY (traveller_id) REFERENCES public.trip_travelers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: activity_traveller_splits activity_traveller_splits_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.activity_traveller_splits
    ADD CONSTRAINT activity_traveller_splits_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: api_credentials api_credentials_parent_id_api_credentials_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.api_credentials
    ADD CONSTRAINT api_credentials_parent_id_api_credentials_id_fk FOREIGN KEY (parent_id) REFERENCES public.api_credentials(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_group_members contact_group_members_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_group_members
    ADD CONSTRAINT contact_group_members_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_group_members contact_group_members_group_id_contact_groups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_group_members
    ADD CONSTRAINT contact_group_members_group_id_contact_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.contact_groups(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_groups contact_groups_primary_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_groups
    ADD CONSTRAINT contact_groups_primary_contact_id_contacts_id_fk FOREIGN KEY (primary_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_relationships contact_relationships_contact_id1_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_relationships
    ADD CONSTRAINT contact_relationships_contact_id1_contacts_id_fk FOREIGN KEY (contact_id1) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_relationships contact_relationships_contact_id2_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_relationships
    ADD CONSTRAINT contact_relationships_contact_id2_contacts_id_fk FOREIGN KEY (contact_id2) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_stripe_customers contact_stripe_customers_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_stripe_customers
    ADD CONSTRAINT contact_stripe_customers_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_tags contact_tags_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: contact_tags contact_tags_tag_id_tags_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_tag_id_tags_id_fk FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: credit_card_guarantee credit_card_guarantee_payment_schedule_config_id_payment_schedu; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.credit_card_guarantee
    ADD CONSTRAINT credit_card_guarantee_payment_schedule_config_id_payment_schedu FOREIGN KEY (payment_schedule_config_id) REFERENCES public.payment_schedule_config(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: custom_cruise_details custom_cruise_details_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.custom_cruise_details
    ADD CONSTRAINT custom_cruise_details_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: custom_cruise_details custom_cruise_details_component_id_itinerary_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.custom_cruise_details
    ADD CONSTRAINT custom_cruise_details_component_id_itinerary_activities_id_fk FOREIGN KEY (component_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: dining_details dining_details_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.dining_details
    ADD CONSTRAINT dining_details_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: expected_payment_items expected_payment_items_payment_schedule_config_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.expected_payment_items
    ADD CONSTRAINT expected_payment_items_payment_schedule_config_id_fk FOREIGN KEY (payment_schedule_config_id) REFERENCES public.payment_schedule_config(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: flight_details flight_details_component_id_itinerary_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.flight_details
    ADD CONSTRAINT flight_details_component_id_itinerary_activities_id_fk FOREIGN KEY (component_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: flight_segments flight_segments_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.flight_segments
    ADD CONSTRAINT flight_segments_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itineraries itineraries_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.itineraries
    ADD CONSTRAINT itineraries_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itinerary_activities itinerary_activities_itinerary_day_id_itinerary_days_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.itinerary_activities
    ADD CONSTRAINT itinerary_activities_itinerary_day_id_itinerary_days_id_fk FOREIGN KEY (itinerary_day_id) REFERENCES public.itinerary_days(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itinerary_activities itinerary_activities_parent_activity_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.itinerary_activities
    ADD CONSTRAINT itinerary_activities_parent_activity_id_fk FOREIGN KEY (parent_activity_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: itinerary_days itinerary_days_itinerary_id_itineraries_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.itinerary_days
    ADD CONSTRAINT itinerary_days_itinerary_id_itineraries_id_fk FOREIGN KEY (itinerary_id) REFERENCES public.itineraries(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: lodging_details lodging_details_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.lodging_details
    ADD CONSTRAINT lodging_details_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: options_details options_details_component_id_itinerary_activities_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.options_details
    ADD CONSTRAINT options_details_component_id_itinerary_activities_id_fk FOREIGN KEY (component_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: package_details package_details_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.package_details
    ADD CONSTRAINT package_details_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: package_details package_details_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.package_details
    ADD CONSTRAINT package_details_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: package_details package_details_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.package_details
    ADD CONSTRAINT package_details_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: payment_transactions payment_transactions_expected_payment_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_expected_payment_item_id_fkey FOREIGN KEY (expected_payment_item_id) REFERENCES public.expected_payment_items(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: port_info_details port_info_details_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.port_info_details
    ADD CONSTRAINT port_info_details_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: service_fees service_fees_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.service_fees
    ADD CONSTRAINT service_fees_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: transportation_details transportation_details_component_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.transportation_details
    ADD CONSTRAINT transportation_details_component_id_fkey FOREIGN KEY (component_id) REFERENCES public.itinerary_activities(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_group_members traveler_group_members_traveler_group_id_traveler_groups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.traveler_group_members
    ADD CONSTRAINT traveler_group_members_traveler_group_id_traveler_groups_id_fk FOREIGN KEY (traveler_group_id) REFERENCES public.traveler_groups(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_group_members traveler_group_members_trip_traveler_id_trip_travelers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.traveler_group_members
    ADD CONSTRAINT traveler_group_members_trip_traveler_id_trip_travelers_id_fk FOREIGN KEY (trip_traveler_id) REFERENCES public.trip_travelers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: traveler_groups traveler_groups_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.traveler_groups
    ADD CONSTRAINT traveler_groups_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_collaborators trip_collaborators_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_collaborators
    ADD CONSTRAINT trip_collaborators_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_insurance_packages trip_insurance_packages_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_insurance_packages
    ADD CONSTRAINT trip_insurance_packages_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_media trip_media_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_media
    ADD CONSTRAINT trip_media_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_notifications trip_notifications_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_notifications
    ADD CONSTRAINT trip_notifications_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_tags trip_tags_tag_id_tags_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_tags
    ADD CONSTRAINT trip_tags_tag_id_tags_id_fk FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_tags trip_tags_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_tags
    ADD CONSTRAINT trip_tags_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_traveler_insurance trip_traveler_insurance_selected_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_traveler_insurance
    ADD CONSTRAINT trip_traveler_insurance_selected_package_id_fkey FOREIGN KEY (selected_package_id) REFERENCES public.trip_insurance_packages(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_traveler_insurance trip_traveler_insurance_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_traveler_insurance
    ADD CONSTRAINT trip_traveler_insurance_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_traveler_insurance trip_traveler_insurance_trip_traveler_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_traveler_insurance
    ADD CONSTRAINT trip_traveler_insurance_trip_traveler_id_fkey FOREIGN KEY (trip_traveler_id) REFERENCES public.trip_travelers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_travelers trip_travelers_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_travelers
    ADD CONSTRAINT trip_travelers_contact_id_contacts_id_fk FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_travelers trip_travelers_emergency_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_travelers
    ADD CONSTRAINT trip_travelers_emergency_contact_id_contacts_id_fk FOREIGN KEY (emergency_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trip_travelers trip_travelers_trip_id_trips_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trip_travelers
    ADD CONSTRAINT trip_travelers_trip_id_trips_id_fk FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: trips trips_primary_contact_id_contacts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_primary_contact_id_contacts_id_fk FOREIGN KEY (primary_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: user_profiles user_profiles_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--
-- Name: user_profiles user_profiles_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$
BEGIN
  ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.user_profiles(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


--

--

--

--

--

--

--

--


--

--

--

--

--

--

--

--

--

--

--


--
-- PostgreSQL database dump complete
--



-- ============================================================================
-- RLS: ENABLE + FORCE for ALL public tables (Phase 11 Standard)
-- ============================================================================

-- Activity tables
ALTER TABLE public.activity_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_amenities FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_documents FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_media FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_pricing FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_suppliers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_travelers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_traveller_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_traveller_splits FORCE ROW LEVEL SECURITY;

-- Agency tables
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies FORCE ROW LEVEL SECURITY;

ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_settings FORCE ROW LEVEL SECURITY;

-- Reference tables
ALTER TABLE public.amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenities FORCE ROW LEVEL SECURITY;

ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_credentials FORCE ROW LEVEL SECURITY;

ALTER TABLE public.commission_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_tracking FORCE ROW LEVEL SECURITY;

-- Contact tables
ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_group_members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_groups FORCE ROW LEVEL SECURITY;

ALTER TABLE public.contact_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_relationships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.contact_stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_stripe_customers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags FORCE ROW LEVEL SECURITY;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;

-- Payment tables
ALTER TABLE public.credit_card_guarantee ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_guarantee FORCE ROW LEVEL SECURITY;

ALTER TABLE public.currency_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_exchange_rates FORCE ROW LEVEL SECURITY;

-- Detail tables
ALTER TABLE public.custom_cruise_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_cruise_details FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dining_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_details FORCE ROW LEVEL SECURITY;

ALTER TABLE public.expected_payment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expected_payment_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.flight_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_details FORCE ROW LEVEL SECURITY;

ALTER TABLE public.flight_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_segments FORCE ROW LEVEL SECURITY;

-- Itinerary tables
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itineraries FORCE ROW LEVEL SECURITY;

ALTER TABLE public.itinerary_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_activities FORCE ROW LEVEL SECURITY;

ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_days FORCE ROW LEVEL SECURITY;

ALTER TABLE public.itinerary_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_templates FORCE ROW LEVEL SECURITY;

ALTER TABLE public.lodging_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lodging_details FORCE ROW LEVEL SECURITY;

ALTER TABLE public.options_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options_details FORCE ROW LEVEL SECURITY;

-- Package tables
ALTER TABLE public.package_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_details FORCE ROW LEVEL SECURITY;

ALTER TABLE public.package_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_templates FORCE ROW LEVEL SECURITY;

-- Payment tables
ALTER TABLE public.payment_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedule FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payment_schedule_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_schedule_config FORCE ROW LEVEL SECURITY;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.port_info_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_info_details FORCE ROW LEVEL SECURITY;

ALTER TABLE public.service_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_fees FORCE ROW LEVEL SECURITY;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags FORCE ROW LEVEL SECURITY;

ALTER TABLE public.transportation_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transportation_details FORCE ROW LEVEL SECURITY;

-- Traveler tables
ALTER TABLE public.traveler_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traveler_group_members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.traveler_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traveler_groups FORCE ROW LEVEL SECURITY;

-- Trip tables
ALTER TABLE public.trip_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_collaborators FORCE ROW LEVEL SECURITY;

ALTER TABLE public.trip_insurance_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_insurance_packages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.trip_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_media FORCE ROW LEVEL SECURITY;

ALTER TABLE public.trip_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.trip_reference_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_reference_sequences FORCE ROW LEVEL SECURITY;

ALTER TABLE public.trip_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_tags FORCE ROW LEVEL SECURITY;

ALTER TABLE public.trip_traveler_insurance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_traveler_insurance FORCE ROW LEVEL SECURITY;

ALTER TABLE public.trip_travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_travelers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES (Phase 11 API-First Lockdown - Minimal Policies Only)
-- All other access goes through API (service_role bypasses RLS)
-- ============================================================================

-- Agencies: authenticated can read (safe - no sensitive data)
CREATE POLICY agencies_authenticated_select
  ON public.agencies
  FOR SELECT
  TO authenticated
  USING (true);

-- User Profiles: authenticated can read own record only
CREATE POLICY user_profiles_self_select
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- ============================================================================
-- GRANTS (Phase 11 API-First Lockdown)
-- ============================================================================

-- service_role: Full access (API backend uses this - bypasses RLS)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- authenticated: Schema access only (RLS + minimal policies control actual access)
GRANT USAGE ON SCHEMA public TO authenticated;

-- anon: Schema access only (no table access - all via API)
GRANT USAGE ON SCHEMA public TO anon;

COMMIT;
